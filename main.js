const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray } = require('electron');
const path = require('path');
const schedule = require('node-schedule');
const { Logger } = require('./src/utils/logger');
const { loadConfig, saveConfig } = require('./src/config/index');
const { qiandao } = require('./src/signin');
const { sendPushNotification } = require('./src/utils/notify');
const { listAllClassIds, checkUserSignIn } = require('./src/users');
const AutoLaunch = require('auto-launch');
const { Notification } = require('electron');
const fs = require('fs');

// 应用图标
let appIcon = null;
// 系统托盘对象
let tray = null;
// 是否通过自启动静默启动
let isSilentLaunch = false;

// 检查命令行参数是否包含静默启动标志
isSilentLaunch = process.argv.includes('--silent');

// 创建自启动器
const autoLauncher = new AutoLaunch({
  name: '班级魔方GPS签到工具',
  path: app.getPath('exe'),
  isHidden: true  // 设为true，使用静默启动模式
});

// 存储对象和设置
let store;
let storeReady = false;

// 异步初始化electron-store
(async () => {
  try {
    const { default: Store } = await import('electron-store');
    store = new Store({
      cwd: app.getPath('userData') // 确保store使用正确的路径
    });
    storeReady = true;
    Logger.info('存储初始化成功');
    
    // 初始化自启动设置
    if (app.isReady()) {
      initAutoLaunch();
    }
  } catch (error) {
    Logger.error(`存储初始化失败: ${error.message}`);
  }
})();

// 保持对window对象的全局引用，避免JavaScript对象被垃圾回收时，窗口被自动关闭
let mainWindow;

// 创建系统托盘
function createTray() {
  try {
    // 确定应用图标路径
    const iconPath = path.join(__dirname, 'renderer', 'assets', 'icon.png');
    
    // 检查图标是否存在
    if (!fs.existsSync(iconPath)) {
      Logger.warning(`创建托盘时发现图标不存在: ${iconPath}`);
      // 尝试使用内置的默认图标
      appIcon = null;
    } else {
      appIcon = iconPath;
    }
    
    // 创建托盘图标，使用appIcon或nativeImage.createEmpty()
    tray = new Tray(appIcon || null);
    tray.setToolTip('班级魔方GPS签到工具');
    
    // 创建托盘菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            if (process.platform === 'darwin' && !app.dock.isVisible()) {
              app.dock.show();
            }
          } else {
            createWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: '立即签到',
        click: async () => {
          try {
            // 执行手动签到
            const result = await manualSignFromTray();
            
            // 在托盘显示通知
            if (result.success) {
              showNotificationFromTray('签到成功', '手动签到已完成');
            } else if (result.noTask) {
              showNotificationFromTray('无签到任务', '当前没有进行中的签到任务');
            } else {
              showNotificationFromTray('签到失败', result.message || result.error || '未知错误');
            }
          } catch (error) {
            showNotificationFromTray('签到出错', error.message);
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        }
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // 点击托盘图标显示主窗口
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          if (process.platform === 'darwin' && !app.dock.isVisible()) {
            app.dock.show();
          }
        }
      } else {
        createWindow();
      }
    });
    
    Logger.info('系统托盘创建成功');
  } catch (error) {
    Logger.error(`创建系统托盘出错: ${error.message}`);
  }
}

// 显示托盘通知
function showNotificationFromTray(title, message) {
  // 使用系统托盘通知
  if (process.platform === 'win32' && tray) {
    tray.displayBalloon({
      title,
      content: message
    });
  } else {
    // 其他平台使用系统通知
    showNotification(title, message);
  }
}

// 从托盘执行手动签到
async function manualSignFromTray() {
  try {
    const jsonData = loadConfig();
    
    // 检查配置是否正确
    if (!jsonData.cookies || jsonData.cookies.length === 0) {
      return { success: false, error: '未配置Cookie，无法执行签到' };
    }
    
    // 手动签到时重置当天状态
    const today = new Date().toDateString();
    successfulSignDates[today] = false;
    
    // 执行签到
    const result = await qiandao(
      jsonData.cookies,
      jsonData.lng,
      jsonData.lat,
      jsonData.class,
      jsonData.acc
    );
    
    // 处理无任务情况
    if (result.noTask) {
      Logger.info(`手动签到: 当前没有可用的签到任务`);
      return { ...result, message: '当前没有进行中的签到任务' };
    }
    
    // 处理所有任务都已签到的情况
    if (result.allSigned) {
      Logger.info(`手动签到: 所有任务已签到完成`);
      successfulSignDates[today] = true; // 标记为当天已签到
      Logger.info(`已记录今天(${today})签到成功，今天不会再自动执行签到任务`);
      return { ...result, message: '所有签到任务已完成' };
    }
    
    // 如果手动签到成功且至少有一个用户成功签到，更新成功标记
    if (result.success && result.results && result.results.some(r => r.success)) {
      successfulSignDates[today] = true;
      Logger.info(`手动签到成功，已记录今天(${today})签到成功`);
    }
    
    return result;
  } catch (error) {
    Logger.error(`托盘手动签到出错: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 创建窗口函数
function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: !isSilentLaunch, // 根据静默启动标志决定是否显示窗口
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 加载应用的index.html
  mainWindow.loadFile('renderer/index.html');

  // 打开开发者工具
  // mainWindow.webContents.openDevTools();

  // 当window被关闭时，触发下面的事件
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
  
  // 当窗口被最小化时隐藏到托盘
  mainWindow.on('minimize', function(event) {
    event.preventDefault();
    mainWindow.hide();
    if (process.platform === 'darwin') {
      app.dock.hide(); // 在macOS上隐藏dock图标
    }
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  // 确保日志使用正确的路径
  Logger.reinitLogPath();
  
  // 检查并创建必要的资源
  checkAndCreateResources();
  
  // 创建系统托盘
  createTray();
  
  // 检查是否是开机自启动（静默启动）
  const isStartedFromAutoLaunch = process.argv.includes('--silent') || process.argv.some(arg => arg.includes('autolaunch'));
  
  if (isStartedFromAutoLaunch) {
    // 如果是开机自启动，设置静默启动标志
    isSilentLaunch = true;
    Logger.info('应用通过开机自启动或静默模式启动');
  }
  
  // 创建主窗口（根据静默启动标志决定是否显示）
  createWindow();
  
  // 如果是macOS且是静默启动，隐藏dock图标
  if (process.platform === 'darwin' && isSilentLaunch) {
    app.dock.hide();
  }

  app.on('activate', function () {
    // 在macOS上，当dock图标被点击且没有其他窗口打开时，通常会重新创建一个窗口
    if (mainWindow === null) {
      createWindow();
      // 如果是macOS且之前隐藏了dock，则显示它
      if (process.platform === 'darwin' && !app.dock.isVisible()) {
        app.dock.show();
      }
    }
  });

  // 如果存储已准备好，初始化自启动设置
  if (storeReady) {
    initAutoLaunch();
  }
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', function () {
  // 不直接退出应用，保持在托盘中运行
  if (process.platform !== 'darwin') {
    // 在Windows和Linux上，关闭所有窗口不会退出应用
    // 不调用app.quit()，应用会保持在托盘中运行
  }
});

// 初始化自启动设置
async function initAutoLaunch() {
  try {
    if (!storeReady) {
      Logger.warning('存储未初始化，跳过自启动设置');
      return;
    }
    
    // 从存储中获取自启动设置，默认为false
    const isAutoLaunchEnabled = store.get('autoLaunch', false);
    
    // 更新自启动路径，确保包含静默启动参数
    const exePath = app.getPath('exe');
    const updatedPath = process.platform === 'darwin' 
      ? `${exePath} --silent`
      : `"${exePath}" --silent`;
    
    autoLauncher.opts.path = updatedPath;
    
    // 检查当前自启动状态
    const isEnabled = await autoLauncher.isEnabled();
    
    // 如果配置与实际状态不一致，则更新
    if (isAutoLaunchEnabled && !isEnabled) {
      await autoLauncher.enable();
      Logger.info('已启用开机自启动（静默模式）');
    } else if (!isAutoLaunchEnabled && isEnabled) {
      await autoLauncher.disable();
      Logger.info('已禁用开机自启动');
    }
  } catch (error) {
    Logger.error(`初始化自启动设置出错: ${error.message}`);
  }
}

// 检查并创建必要的资源
function checkAndCreateResources() {
  try {
    // 确定托盘图标路径
    const iconPath = path.join(__dirname, 'renderer', 'assets', 'icon.png');
    
    // 如果图标文件不存在，创建一个简单的默认图标
    if (!fs.existsSync(iconPath)) {
      Logger.warning(`托盘图标不存在: ${iconPath}，将创建默认图标`);
      
      // 确保目录存在
      const iconDir = path.dirname(iconPath);
      if (!fs.existsSync(iconDir)) {
        fs.mkdirSync(iconDir, { recursive: true });
      }
      
      // 创建默认图标 - 这里仅作为示例，实际应用应该有一个内置的默认图标
      // 这段代码只在找不到图标时执行
      try {
        // 尝试从electron文件夹复制默认图标
        const electronIconPath = path.join(process.resourcesPath, 'electron.png');
        if (fs.existsSync(electronIconPath)) {
          fs.copyFileSync(electronIconPath, iconPath);
          Logger.info(`已复制默认图标到: ${iconPath}`);
        } else {
          Logger.warning('无法找到默认图标源文件');
        }
      } catch (iconError) {
        Logger.error(`创建默认图标出错: ${iconError.message}`);
      }
    }
  } catch (error) {
    Logger.error(`检查资源出错: ${error.message}`);
  }
}

// 定时任务相关变量
let scheduledJobs = {};
let retryCounters = {};
let checkRangeInterval = null;
let successfulSignDates = {}; // 记录每天成功签到的日期

// 定时任务处理函数
function setupScheduledTask(timeString) {
  try {
    const timeArr = timeString.split(':');
    if (timeArr.length === 2) {
      const hour = parseInt(timeArr[0]);
      const minute = parseInt(timeArr[1]);
      
      if (!isNaN(hour) && !isNaN(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const taskTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        Logger.info(`已设置定时任务: ${taskTime}`);
        
        // 设置定时任务
        return schedule.scheduleJob(`${minute} ${hour} * * *`, async () => {
          Logger.info(`定时任务执行中... (${new Date().toLocaleString()})`);
          await executeSignTask();
        });
      } else {
        Logger.warning(`定时任务时间格式错误: ${timeString}`);
        return null;
      }
    } else {
      Logger.warning(`定时任务时间格式错误: ${timeString}`);
      return null;
    }
  } catch (error) {
    Logger.error(`设置定时任务出错: ${error.message}`);
    return null;
  }
}

// 设置时间范围检查
function setupTimeRangeCheck() {
  // 清除现有的区间检查
  if (checkRangeInterval) {
    clearInterval(checkRangeInterval);
    checkRangeInterval = null;
  }

  const config = loadConfig();
  if (!config.scheduleRange || !config.scheduleRange.enabled) {
    Logger.info('时间范围签到未启用');
    return;
  }

  const { startTime, endTime } = config.scheduleRange;
  if (!startTime || !endTime) {
    Logger.warning('时间范围未设置完整，跳过启用');
    return;
  }

  Logger.info(`已启用时间范围签到: ${startTime} - ${endTime}`);

  // 每分钟检查一次是否在时间范围内
  checkRangeInterval = setInterval(async () => {
    const now = new Date();
    const today = now.toDateString();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 如果当天已经成功签到过，则不再执行
    if (successfulSignDates[today]) {
      Logger.info(`当前时间 ${currentTime} 在签到范围内，但今天已成功签到，跳过执行`);
      return;
    }
    
    if (isTimeInRange(currentTime, startTime, endTime)) {
      Logger.info(`当前时间 ${currentTime} 在签到范围内，执行签到任务`);
      await executeSignTask();
    }
  }, 60000); // 每分钟检查一次
}

// 检查时间是否在范围内
function isTimeInRange(currentTime, startTime, endTime) {
  // 将时间转换为分钟数进行比较
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  // 处理跨午夜的情况
  if (start <= end) {
    return current >= start && current <= end;
  } else {
    return current >= start || current <= end;
  }
}

// 执行签到任务
async function executeSignTask() {
  const config = loadConfig();
  
  // 检查配置是否正确
  if (!config.cookies || config.cookies.length === 0) {
    Logger.error('未配置Cookie，无法执行签到');
    showNotification('签到失败', '未配置Cookie，无法执行签到', 'error');
    return;
  }
  
  // 执行签到
  try {
    const result = await qiandao(
      config.cookies,
      config.lng,
      config.lat,
      config.class,
      config.acc
    );
    
    // 处理无任务的特殊情况
    if (result.noTask) {
      Logger.info('当前没有可用的签到任务');
      showNotification('无签到任务', '当前没有进行中的签到任务', 'info');
      
      if (mainWindow) {
        mainWindow.webContents.send('sign-result', result);
        mainWindow.webContents.send('notification', {
          type: 'info',
          message: '当前没有进行中的签到任务'
        });
      }
      
      // 发送推送通知
      if (config.pushplus) {
        await sendPushNotification(
          config.pushplus,
          '班级魔方GPS签到结果',
          '当前没有进行中的签到任务'
        );
      }
      
      return; // 无任务不标记为成功，也不重试
    }
    
    // 处理所有任务都已签到的情况
    if (result.allSigned) {
      Logger.info('所有任务已签到完成');
      showNotification('已完成', '所有签到任务已完成', 'success');
      
      // 记录今天已成功签到
      const today = new Date().toDateString();
      successfulSignDates[today] = true;
      Logger.info(`已记录今天(${today})签到成功，今天不会再自动执行签到任务`);
      
      // 重置重试计数
      retryCounters = {};
      
      if (mainWindow) {
        mainWindow.webContents.send('sign-result', result);
        mainWindow.webContents.send('notification', {
          type: 'success',
          message: '所有签到任务已完成'
        });
      }
      
      // 发送推送通知
      if (config.pushplus) {
        await sendPushNotification(
          config.pushplus,
          '班级魔方GPS签到结果',
          '所有签到任务已完成'
        );
      }
      
      return; // 所有任务已签到，标记为成功，不需要重试
    }
    
    // 处理签到结果
    if (result.success) {
      const successUsers = result.results.filter(r => r.success).map(r => r.username).join(', ');
      const failUsers = result.results.filter(r => !r.success).map(r => r.username).join(', ');
      
      // 只有当至少有一个用户成功签到时，才标记为成功
      const hasSuccessfulSign = result.results.some(r => r.success);
      
      const message = `签到结果：\n成功：${successUsers || '无'}\n失败：${failUsers || '无'}`;
      Logger.info(message);
      
      if (hasSuccessfulSign) {
        // 发送成功通知
        showNotification('签到成功', `成功签到用户: ${successUsers}`, 'success');
        
        // 记录今天已成功签到
        const today = new Date().toDateString();
        successfulSignDates[today] = true;
        Logger.info(`已记录今天(${today})签到成功，今天不会再自动执行签到任务`);
        
        // 重置重试计数
        retryCounters = {};
      } else {
        // 如果没有用户成功签到，视为失败
        showNotification('签到失败', '没有用户成功签到', 'error');
        
        // 处理失败重试
        if (config.scheduleRange && config.scheduleRange.retryEnabled) {
          scheduleRetry();
        }
      }
      
      // 发送通知到渲染进程
      if (mainWindow) {
        mainWindow.webContents.send('sign-result', result);
        mainWindow.webContents.send('notification', {
          type: hasSuccessfulSign ? 'success' : 'error',
          message: message
        });
      }
      
      // 发送推送通知
      if (config.pushplus) {
        await sendPushNotification(
          config.pushplus,
          '班级魔方GPS签到结果',
          message
        );
      }
    } else {
      Logger.error('签到失败');
      // 检查是否有错误消息，优先显示具体错误
      const errorMessage = result.message || result.error || '未知错误';
      showNotification('签到失败', errorMessage, 'error');
      
      if (mainWindow) {
        mainWindow.webContents.send('notification', {
          type: 'error',
          message: '签到失败: ' + errorMessage
        });
      }
      
      // 处理失败重试
      if (config.scheduleRange && config.scheduleRange.retryEnabled) {
        scheduleRetry();
      }
    }
    
    // 处理Cookie失效的情况
    if (result.errorCookies && result.errorCookies.length > 0) {
      const errorUsers = result.errorCookies.map(c => c.username).join(', ');
      Logger.warning(`以下用户的Cookie已失效: ${errorUsers}`);
      showNotification('Cookie已失效', `以下用户的Cookie已失效: ${errorUsers}`, 'warning');
      
      if (mainWindow) {
        mainWindow.webContents.send('notification', {
          type: 'warning',
          message: `以下用户的Cookie已失效: ${errorUsers}`
        });
      }
    }
  } catch (error) {
    Logger.error(`签到执行出错: ${error.message}`);
    showNotification('签到出错', error.message, 'error');
    
    // 处理失败重试
    if (config.scheduleRange && config.scheduleRange.retryEnabled) {
      scheduleRetry();
    }
  }
}

// 安排重试
function scheduleRetry() {
  const config = loadConfig();
  const retryKey = new Date().toDateString(); // 用日期作为键，每天重置
  
  if (!retryCounters[retryKey]) {
    retryCounters[retryKey] = 0;
  }
  
  // 增加重试计数
  retryCounters[retryKey]++;
  
  // 检查是否达到最大重试次数（只在未启用无限重试时检查）
  if (!config.scheduleRange.infiniteRetry && retryCounters[retryKey] >= config.scheduleRange.maxRetries) {
    Logger.warning(`已达到最大重试次数(${config.scheduleRange.maxRetries})，不再重试`);
    showNotification('重试结束', `已达到最大重试次数(${config.scheduleRange.maxRetries})，不再重试`, 'warning');
    return;
  }
  
  // 设置重试时间
  const retryInterval = config.scheduleRange.retryInterval || 5; // 默认5分钟
  const retryTime = new Date(Date.now() + retryInterval * 60000);
  
  // 根据是否无限重试显示不同的消息
  if (config.scheduleRange.infiniteRetry) {
    Logger.info(`安排在 ${retryTime.toLocaleTimeString()} 重试签到，这是第 ${retryCounters[retryKey]} 次重试（无限重试模式）`);
    showNotification('签到重试', `将在${retryInterval}分钟后重试签到，这是第${retryCounters[retryKey]}次重试（无限重试模式）`, 'info');
  } else {
    Logger.info(`安排在 ${retryTime.toLocaleTimeString()} 重试签到，这是第 ${retryCounters[retryKey]} 次重试`);
    showNotification('签到重试', `将在${retryInterval}分钟后重试签到，这是第${retryCounters[retryKey]}次重试`, 'info');
  }
  
  // 安排重试
  setTimeout(() => {
    Logger.info(`执行第 ${retryCounters[retryKey]} 次重试签到`);
    executeSignTask();
  }, retryInterval * 60000);
}

// 显示系统通知
function showNotification(title, message, type = 'info') {
  const config = loadConfig();
  
  // 检查是否启用系统通知
  if (config.systemNotify === false) {
    return;
  }
  
  try {
    // 判断是否在Electron环境中
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: title,
        body: message,
        icon: type === 'success' ? './resources/success.png' : 
              type === 'warning' ? './resources/warning.png' : 
              type === 'error' ? './resources/error.png' : './resources/info.png'
      });
      
      notification.show();
    }
  } catch (error) {
    Logger.error(`显示系统通知失败: ${error.message}`);
  }
}

// 监听IPC事件
let scheduledJob = null;

// 更新配置
ipcMain.on('save-config', async (event, config) => {
  try {
    saveConfig(config);
    
    // 取消所有现有的定时任务
    Object.keys(scheduledJobs).forEach(key => {
      if (scheduledJobs[key]) {
        scheduledJobs[key].cancel();
      }
    });
    scheduledJobs = {};
    
    // 如果有单独的定时任务设置，创建新任务
    if (config.scheduletime) {
      scheduledJobs.single = setupScheduledTask(config.scheduletime);
    }
    
    // 如果启用了时间范围，设置时间范围检查
    if (config.scheduleRange && config.scheduleRange.enabled) {
      setupTimeRangeCheck();
    } else if (checkRangeInterval) {
      clearInterval(checkRangeInterval);
      checkRangeInterval = null;
    }
    
    event.reply('config-saved', { success: true });
  } catch (error) {
    Logger.error(`保存配置出错: ${error.message}`);
    event.reply('config-saved', { success: false, error: error.message });
  }
});

// 加载配置
ipcMain.handle('load-config', async () => {
  try {
    const config = loadConfig();
    
    // 设置调试模式
    if (config.debug) {
      global.debug = true;
      Logger.setLevel('info');
    }
    
    // 设置单独的定时任务
    if (config.scheduletime && !scheduledJobs.single) {
      scheduledJobs.single = setupScheduledTask(config.scheduletime);
    }
    
    // 设置时间范围检查
    if (config.scheduleRange && config.scheduleRange.enabled) {
      setupTimeRangeCheck();
    }
    
    return { success: true, config };
  } catch (error) {
    Logger.error(`加载配置出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 手动签到
ipcMain.handle('manual-sign', async () => {
  try {
    const jsonData = loadConfig();
    
    // 检查配置是否正确
    if (!jsonData.cookies || jsonData.cookies.length === 0) {
      return { success: false, error: '未配置Cookie，无法执行签到' };
    }
    
    // 手动签到时重置当天状态
    const today = new Date().toDateString();
    successfulSignDates[today] = false;
    
    // 执行签到
    const result = await qiandao(
      jsonData.cookies,
      jsonData.lng,
      jsonData.lat,
      jsonData.class,
      jsonData.acc
    );
    
    // 处理无任务情况
    if (result.noTask) {
      Logger.info(`手动签到: 当前没有可用的签到任务`);
      return { ...result, message: '当前没有进行中的签到任务' };
    }
    
    // 处理所有任务都已签到的情况
    if (result.allSigned) {
      Logger.info(`手动签到: 所有任务已签到完成`);
      successfulSignDates[today] = true; // 标记为当天已签到
      Logger.info(`已记录今天(${today})签到成功，今天不会再自动执行签到任务`);
      return { ...result, message: '所有签到任务已完成' };
    }
    
    // 如果手动签到成功且至少有一个用户成功签到，更新成功标记
    if (result.success && result.results && result.results.some(r => r.success)) {
      successfulSignDates[today] = true;
      Logger.info(`手动签到成功，已记录今天(${today})签到成功`);
    }
    
    return result;
  } catch (error) {
    Logger.error(`手动签到出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 获取班级列表
ipcMain.handle('fetch-class-list', async (event, cookie) => {
  try {
    Logger.info('正在获取班级列表...');
    const result = await listAllClassIds(cookie);
    
    if (result.user) {
      return { 
        success: true, 
        user: result.user, 
        classList: result.classIds 
      };
    } else {
      return { 
        success: false, 
        error: 'Cookie无效或已过期' 
      };
    }
  } catch (error) {
    Logger.error(`获取班级列表出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 验证Cookie
ipcMain.handle('verify-cookie', async (event, cookie) => {
  try {
    Logger.info('正在验证Cookie...');
    const result = await listAllClassIds(cookie);
    
    if (result.user) {
      return { 
        success: true, 
        user: result.user
      };
    } else {
      return { 
        success: false, 
        error: 'Cookie无效或已过期' 
      };
    }
  } catch (error) {
    Logger.error(`验证Cookie出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 获取自启动状态
ipcMain.handle('get-auto-launch', async () => {
  try {
    if (!storeReady) {
      return { success: false, error: '存储未初始化' };
    }
    
    const isEnabled = store.get('autoLaunch', false);
    return { success: true, enabled: isEnabled };
  } catch (error) {
    Logger.error(`获取自启动状态出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 设置自启动状态
ipcMain.handle('set-auto-launch', async (event, enabled) => {
  try {
    if (!storeReady) {
      return { success: false, error: '存储未初始化' };
    }
    
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    
    // 保存设置到存储
    store.set('autoLaunch', enabled);
    
    Logger.info(`自启动设置已${enabled ? '启用' : '禁用'}`);
    return { success: true };
  } catch (error) {
    Logger.error(`设置自启动状态出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 获取今日签到状态
ipcMain.handle('get-sign-status', async () => {
  try {
    const today = new Date().toDateString();
    return { 
      success: true, 
      signedToday: !!successfulSignDates[today]
    };
  } catch (error) {
    Logger.error(`获取签到状态出错: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// 重置今日签到状态
ipcMain.handle('reset-sign-status', async () => {
  try {
    const today = new Date().toDateString();
    successfulSignDates[today] = false;
    Logger.info(`已重置今日(${today})签到状态，将允许在时间范围内重新尝试签到`);
    return { success: true };
  } catch (error) {
    Logger.error(`重置签到状态出错: ${error.message}`);
    return { success: false, error: error.message };
  }
}); 