#!/usr/bin/env node

const schedule = require('node-schedule');
const { Logger } = require('./utils/logger');
const { loadConfig } = require('./config');
const { handleCommandLine } = require('./cli');
const { qiandao } = require('./signin');
const { sendPushNotification } = require('./utils/notify');

// 设置全局变量
global.debug = false;

// 格式化时间显示
const formatTime = (hour, minute) => {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// 主函数
const main = async () => {
    try {
        // 处理命令行
        await handleCommandLine();
        
        // 设置定时任务
        const jsonData = loadConfig();
        
        // 设置调试模式
        if (jsonData.debug) {
            global.debug = true;
            Logger.setLevel('info');
        }
        
        // 处理定时任务
        if (jsonData.scheduletime) {
            const timeArr = jsonData.scheduletime.split(':');
            if (timeArr.length === 2) {
                const hour = parseInt(timeArr[0]);
                const minute = parseInt(timeArr[1]);
                
                if (!isNaN(hour) && !isNaN(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    const taskTime = formatTime(hour, minute);
                    
                    Logger.info(`已设置定时任务: ${taskTime}`);
                    console.log(`已设置定时任务: ${taskTime}`);
                    
                    // 设置定时任务
                    schedule.scheduleJob(`${minute} ${hour} * * *`, async () => {
                        Logger.info(`定时任务执行中... (${new Date().toLocaleString()})`);
                        
                        // 检查配置是否正确
                        if (!jsonData.cookies || jsonData.cookies.length === 0) {
                            Logger.error('未配置Cookie，无法执行签到');
                            return;
                        }
                        
                        // 执行签到
                        const result = await qiandao(
                            jsonData.cookies,
                            jsonData.lng,
                            jsonData.lat,
                            jsonData.class
                        );
                        
                        // 处理签到结果
                        if (result.success) {
                            const successUsers = result.results.filter(r => r.success).map(r => r.username).join(', ');
                            const failUsers = result.results.filter(r => !r.success).map(r => r.username).join(', ');
                            
                            const message = `定时签到结果：\n成功：${successUsers || '无'}\n失败：${failUsers || '无'}`;
                            Logger.info(message);
                            
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
                        }
                        
                        // 处理Cookie失效的情况
                        if (result.errorCookies.length > 0) {
                            const errorUsers = result.errorCookies.map(c => c.username).join(', ');
                            Logger.warning(`以下用户的Cookie已失效: ${errorUsers}`);
                        }
                    });
                } else {
                    Logger.warning(`定时任务时间格式错误: ${jsonData.scheduletime}`);
                }
            } else {
                Logger.warning(`定时任务时间格式错误: ${jsonData.scheduletime}`);
            }
        }
    } catch (error) {
        Logger.error(`程序出错: ${error.message}`);
        console.error(`程序出错: ${error.message}`);
    }
};

// 启动程序
main(); 