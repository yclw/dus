const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const schedule = require('node-schedule');
const { Logger } = require('./src/utils/logger');
const { loadConfig, saveConfig } = require('./src/config/index');
const { qiandao } = require('./src/signin');
const { sendPushNotification } = require('./src/utils/notify');
const { listAllClassIds, checkUserSignIn } = require('./src/users');
const AutoLaunch = require('auto-launch');

// 创建自启动器
const autoLauncher = new AutoLaunch({
  name: '班级魔方GPS签到工具',
  path: app.getPath('exe'),
  isHidden: false
});

// 存储对象和设置
let store;
let storeReady = false;

// 异步初始化electron-store
(async () => {
  try {
    const { default: Store } = await import('electron-store');
    store = new Store();
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

// 创建窗口函数
function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // 在macOS上，当dock图标被点击且没有其他窗口打开时，通常会重新创建一个窗口
    if (mainWindow === null) createWindow();
  });

  // 如果存储已准备好，初始化自启动设置
  if (storeReady) {
    initAutoLaunch();
  }
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', function () {
  // 在macOS上，用户通常希望应用在显式退出之前保持活动状态
  if (process.platform !== 'darwin') app.quit();
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
    
    // 检查当前自启动状态
    const isEnabled = await autoLauncher.isEnabled();
    
    // 如果配置与实际状态不一致，则更新
    if (isAutoLaunchEnabled && !isEnabled) {
      await autoLauncher.enable();
      Logger.info('已启用开机自启动');
    } else if (!isAutoLaunchEnabled && isEnabled) {
      await autoLauncher.disable();
      Logger.info('已禁用开机自启动');
    }
  } catch (error) {
    Logger.error(`初始化自启动设置出错: ${error.message}`);
  }
}

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
          const jsonData = loadConfig();
          
          // 检查配置是否正确
          if (!jsonData.cookies || jsonData.cookies.length === 0) {
            Logger.error('未配置Cookie，无法执行签到');
            if (mainWindow) {
              mainWindow.webContents.send('notification', {
                type: 'error',
                message: '未配置Cookie，无法执行签到'
              });
            }
            return;
          }
          
          // 执行签到
          const result = await qiandao(
            jsonData.cookies,
            jsonData.lng,
            jsonData.lat,
            jsonData.class,
            jsonData.acc
          );
          
          // 处理签到结果
          if (result.success) {
            const successUsers = result.results.filter(r => r.success).map(r => r.username).join(', ');
            const failUsers = result.results.filter(r => !r.success).map(r => r.username).join(', ');
            
            const message = `定时签到结果：\n成功：${successUsers || '无'}\n失败：${failUsers || '无'}`;
            Logger.info(message);
            
            // 发送通知到渲染进程
            if (mainWindow) {
              mainWindow.webContents.send('sign-result', result);
              mainWindow.webContents.send('notification', {
                type: 'success',
                message: message
              });
            }
            
            // 发送通知
            if (jsonData.pushplus) {
              await sendPushNotification(
                jsonData.pushplus,
                '班级魔方GPS定时签到结果',
                message
              );
            }
          } else {
            Logger.error('定时签到失败');
            if (mainWindow) {
              mainWindow.webContents.send('notification', {
                type: 'error',
                message: '定时签到失败'
              });
            }
          }
          
          // 处理Cookie失效的情况
          if (result.errorCookies && result.errorCookies.length > 0) {
            const errorUsers = result.errorCookies.map(c => c.username).join(', ');
            Logger.warning(`以下用户的Cookie已失效: ${errorUsers}`);
            if (mainWindow) {
              mainWindow.webContents.send('notification', {
                type: 'warning',
                message: `以下用户的Cookie已失效: ${errorUsers}`
              });
            }
          }
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

// 监听IPC事件
let scheduledJob = null;

// 更新配置
ipcMain.on('save-config', async (event, config) => {
  try {
    saveConfig(config);
    
    // 如果有定时任务，取消之前的任务并创建新任务
    if (scheduledJob) {
      scheduledJob.cancel();
      scheduledJob = null;
    }
    
    if (config.scheduletime) {
      scheduledJob = setupScheduledTask(config.scheduletime);
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
    
    // 设置定时任务
    if (config.scheduletime && !scheduledJob) {
      scheduledJob = setupScheduledTask(config.scheduletime);
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
    
    // 执行签到
    const result = await qiandao(
      jsonData.cookies,
      jsonData.lng,
      jsonData.lat,
      jsonData.class,
      jsonData.acc
    );
    
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