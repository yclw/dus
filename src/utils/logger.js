const fs = require('fs');
const path = require('path');

/**
 * 确保日志目录存在
 * @returns {string} - 日志目录路径
 */
const ensureLogDir = () => {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
        try {
            fs.mkdirSync(logDir, { recursive: true });
        } catch (err) {
            console.error(`创建日志目录失败: ${err.message}`);
        }
    }
    return logDir;
};

/**
 * 日志工具类
 */
class LoggerClass {
    constructor() {
        this.logFile = path.join(ensureLogDir(), 'AutoCheckBJMF.log');
        this.level = 'info'; // 默认日志级别
        this.levels = {
            'info': 0,
            'warning': 1,
            'error': 2
        };
    }

    /**
     * 设置日志级别
     * @param {string} level - 日志级别 (info, warning, error)
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.level = level;
        }
    }

    /**
     * 写入日志
     * @param {string} type - 日志类型
     * @param {string} message - 日志消息
     */
    log(type, message) {
        // 检查是否启用调试或满足日志级别要求
        if (!global.debug && this.levels[type] < this.levels[this.level]) {
            return;
        }
        
        const now = new Date();
        const timestamp = now.toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        
        // 在调试模式下同时输出到控制台
        if (global.debug) {
            console.log(logMessage);
        }
        
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            console.error(`写入日志文件失败: ${error.message}`);
        }
    }

    /**
     * 记录信息日志
     * @param {string} message - 日志消息
     */
    info(message) {
        this.log('info', message);
    }

    /**
     * 记录警告日志
     * @param {string} message - 日志消息
     */
    warning(message) {
        this.log('warning', message);
    }

    /**
     * 记录错误日志
     * @param {string} message - 日志消息
     */
    error(message) {
        this.log('error', message);
    }
}

// 创建单例实例
const Logger = new LoggerClass();

module.exports = {
    Logger
};