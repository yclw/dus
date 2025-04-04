const { program } = require('commander');
const { Logger } = require('../utils/logger');
const { loadConfig } = require('../config');
const { initConfig } = require('../config/setup');
const { qiandao } = require('../signin');
const { sendPushNotification } = require('../utils/notify');

// 定义命令行参数
const setupCommandLine = () => {
    program
        .version('1.0.0')
        .description('北京名师课堂GPS签到工具');

    program
        .option('-i, --init', '初始化配置')
        .option('-s, --sign', '执行签到')
        .option('-l, --log <level>', '设置日志级别 (info, warning, error)', 'info');
    
    program.parse(process.argv);
    return program.opts();
};

// 处理命令行操作
const handleCommandLine = async () => {
    const options = setupCommandLine();
    Logger.setLevel(options.log);
    
    // 加载配置
    const jsonData = loadConfig();
    
    // 处理初始化选项
    if (options.init) {
        await initConfig();
        return;
    }
    
    // 检查是否已配置
    if (!jsonData.cookies || jsonData.cookies.length === 0) {
        Logger.warning('未配置Cookie，请先初始化配置');
        await initConfig();
        return;
    }
    
    // 打印当前配置
    console.log('当前配置：');
    console.log(`- 班级ID: ${jsonData.class}`);
    console.log(`- 地理坐标: ${jsonData.lng}, ${jsonData.lat}`);
    console.log(`- 海拔/精度: ${jsonData.acc}`);
    console.log(`- Cookie数量: ${jsonData.cookies.length}`);
    console.log('- 用户列表:');
    jsonData.cookies.forEach(c => console.log(`  * ${c.username}`));
    
    // 处理签到选项
    if (options.sign) {
        console.log('\n开始执行签到...');
        
        try {
            const result = await qiandao(
                jsonData.cookies,
                jsonData.lng,
                jsonData.lat,
                jsonData.class
            );
            
            // 处理签到结果
            if (result.success) {
                if (result.results.length === 0) {
                    console.log('没有找到正在进行的签到任务，无需签到。');
                } else {
                    const successUsers = result.results.filter(r => r.success).map(r => r.username).join(', ');
                    const failUsers = result.results.filter(r => !r.success).map(r => r.username).join(', ');
                    
                    const message = `签到结果：\n成功：${successUsers || '无'}\n失败：${failUsers || '无'}`;
                    console.log(message);
                    Logger.info(message);
                    
                    // 显示每个用户的具体签到消息
                    result.results.forEach(r => {
                        console.log(`用户 [${r.username}]: ${r.message}`);
                    });
                    
                    // 发送通知
                    if (jsonData.pushplus) {
                        await sendPushNotification(
                            jsonData.pushplus,
                            '北京名师课堂GPS签到结果',
                            message
                        );
                    }
                }
            } else {
                console.log('所有用户签到失败');
                Logger.error('所有用户签到失败');
            }
            
            // 处理Cookie失效的情况
            if (result.errorCookies && result.errorCookies.length > 0) {
                const errorUsers = result.errorCookies.map(c => c.username).join(', ');
                console.log(`以下用户的Cookie已失效，请重新配置: ${errorUsers}`);
                Logger.warning(`以下用户的Cookie已失效，请重新配置: ${errorUsers}`);
            }
        } catch (error) {
            console.error(`签到过程出错: ${error.message}`);
            Logger.error(`签到过程出错: ${error.message}`);
        }
        
        console.log('\n签到流程已完成。');
    }
};

module.exports = {
    setupCommandLine,
    handleCommandLine
}; 