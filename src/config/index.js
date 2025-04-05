const fs = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');

// 尝试导入electron，但如果不在electron环境中不会出错
let app;
try {
    const electron = require('electron');
    app = electron.app || (electron.remote && electron.remote.app);
} catch (error) {
    // 忽略错误，保持app为undefined
}

// 获取正确的配置文件路径
const getConfigPath = () => {
    try {
        // 如果在Electron环境中运行并且app已初始化
        if (app && app.getPath) {
            try {
                const userDataPath = app.getPath('userData');
                return path.join(userDataPath, 'config.json');
            } catch (e) {
                Logger.warning(`获取Electron用户数据路径失败: ${e.message}`);
            }
        }
    } catch (error) {
        Logger.warning(`获取配置路径出错: ${error.message}`);
    }
    
    // 回退到当前工作目录
    return path.join(process.cwd(), 'config.json');
};

// 配置常量
const CONFIG = {
    fileName: "config.json",
    currentDirectory: process.cwd(),
    defaultSettings: {
        "class": "",       // 班级ID
        "lat": "",         // 纬度
        "lng": "",         // 经度
        "acc": "",         // 海拔
        "time": 0,         // 等待时间（已弃用）
        "cookies": [],     // 用户令牌及信息 [{cookie: "...", username: "..."}]
        "scheduletime": "", // 定时任务（旧版单一时间点，保留向后兼容）
        "scheduleRange": {  // 定时任务时间范围
            "enabled": false, // 是否启用时间范围
            "startTime": "", // 开始时间 (HH:MM)
            "endTime": "",   // 结束时间 (HH:MM)
            "retryEnabled": true, // 是否启用失败重试
            "retryInterval": 5,  // 重试间隔（分钟）
            "maxRetries": 3,     // 最大重试次数
            "infiniteRetry": false // 是否启用无限重试
        },
        "pushplus": "",    // pushplus推送令牌
        "debug": false,    // 调试模式
        "systemNotify": true, // 系统通知
        "configLock": false // 配置编辑状态
    }
};

// 打印分隔线
const printDivider = (title) => {
    console.log(`----------${title}----------`);
};

// 加载配置
const loadConfig = () => {
    const configPath = getConfigPath();
    
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const jsonData = JSON.parse(configData);
            
            // 兼容旧版本配置
            if (jsonData.cookie && !jsonData.cookies) {
                Logger.info('检测到旧版本配置，正在转换为新版本...');
                jsonData.cookies = [{ cookie: jsonData.cookie, username: '未知用户' }];
                delete jsonData.cookie;
                saveConfig(jsonData);
            }
            
            // 兼容未添加时间范围的配置
            if (!jsonData.scheduleRange) {
                Logger.info('检测到配置中无时间范围设置，添加默认设置');
                jsonData.scheduleRange = CONFIG.defaultSettings.scheduleRange;
                
                // 如果有老的单时间点，尝试将其设为开始时间
                if (jsonData.scheduletime) {
                    jsonData.scheduleRange.startTime = jsonData.scheduletime;
                    // 结束时间设为开始时间后1小时
                    try {
                        const [hour, minute] = jsonData.scheduletime.split(':').map(Number);
                        const endHour = (hour + 1) % 24;
                        jsonData.scheduleRange.endTime = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                    } catch (e) {
                        jsonData.scheduleRange.endTime = jsonData.scheduletime;
                    }
                }
                
                saveConfig(jsonData);
            }
            
            return jsonData;
        } else {
            Logger.info('未找到配置文件，创建默认配置');
            
            console.log('欢迎使用班级魔方GPS签到工具！');
            console.log('首次使用需要进行配置，请按照提示操作。');
            console.log('您需要以下信息：');
            console.log('1. 班级魔方网站的Cookie');
            console.log('2. 签到位置的GPS坐标');
            printDivider('初始化');
            
            saveConfig(CONFIG.defaultSettings);
            return CONFIG.defaultSettings;
        }
    } catch (error) {
        Logger.error(`加载配置文件失败: ${error.message}`);
        return CONFIG.defaultSettings;
    }
};

// 保存配置
const saveConfig = (data) => {
    const configPath = getConfigPath();
    
    try {
        // 确保目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(data, null, 4), 'utf8');
        console.log(`数据已保存到配置文件: ${configPath}`);
        return true;
    } catch (error) {
        Logger.error(`保存配置文件失败: ${error.message}`);
        return false;
    }
};

module.exports = {
    CONFIG,
    printDivider,
    loadConfig,
    saveConfig
}; 