const fs = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');

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
        "scheduletime": "", // 定时任务
        "pushplus": "",    // pushplus推送令牌
        "debug": false,    // 调试模式
        "configLock": false // 配置编辑状态
    }
};

// 打印分隔线
const printDivider = (title) => {
    console.log(`----------${title}----------`);
};

// 加载配置
const loadConfig = () => {
    const configPath = path.join(CONFIG.currentDirectory, CONFIG.fileName);
    
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
            
            return jsonData;
        } else {
            Logger.info('未找到配置文件，创建默认配置');
            
            console.log('欢迎使用北京名师课堂GPS签到工具！');
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
    const configPath = path.join(CONFIG.currentDirectory, CONFIG.fileName);
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(data, null, 4), 'utf8');
        console.log(`数据已保存到${CONFIG.currentDirectory}下的${CONFIG.fileName}中。`);
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