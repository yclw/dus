const readline = require('readline');
const { Logger } = require('../utils/logger');
const { loadConfig, saveConfig } = require('./index');
const { listAllClassIds } = require('../users');

// 创建readline接口
const createRLInterface = () => {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
};

// 提示用户输入
const prompt = (rl, question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};

// 初始化配置
const initConfig = async () => {
    const rl = createRLInterface();
    const jsonData = loadConfig();
    
    console.log('开始配置北京名师课堂GPS签到工具');
    console.log('-------------------------------');
    
    try {
        // 收集Cookie信息
        const rawCookies = [];
        let cookieInput;
        
        console.log('请输入Cookie(可多次输入，输入空行结束):');
        
        do {
            cookieInput = await prompt(rl, '> ');
            if (cookieInput.trim()) {
                rawCookies.push(cookieInput.trim());
            }
        } while (cookieInput.trim() && rawCookies.length < 10);
        
        if (rawCookies.length === 0) {
            console.log('未提供Cookie，配置已取消');
            rl.close();
            return;
        }
        
        // 处理每个Cookie，获取用户信息和课程列表
        const cookieObjects = [];
        let firstValidCookie = null;
        let classList = [];
        
        console.log('正在获取用户信息和课程列表...');
        
        for (const cookie of rawCookies) {
            const result = await listAllClassIds(cookie);
            
            if (result.user) {
                cookieObjects.push({
                    cookie,
                    username: result.user.name
                });
                
                if (!firstValidCookie && result.classIds.length > 0) {
                    firstValidCookie = cookie;
                    classList = result.classIds;
                }
            }
        }
        
        if (cookieObjects.length === 0) {
            console.log('所有Cookie均无效，请重新配置');
            rl.close();
            return;
        }
        
        // 选择班级ID
        let classId;
        
        if (classList.length > 0) {
            console.log('获取到以下班级列表:');
            classList.forEach((cls, index) => {
                console.log(`${index + 1}. ${cls.name} (ID: ${cls.id})`);
            });
            
            const classChoice = await prompt(rl, '请选择班级序号，或直接输入班级ID: ');
            
            if (!isNaN(parseInt(classChoice)) && parseInt(classChoice) > 0 && parseInt(classChoice) <= classList.length) {
                classId = classList[parseInt(classChoice) - 1].id;
            } else {
                classId = classChoice;
            }
        } else {
            classId = await prompt(rl, '未获取到班级列表，请手动输入班级ID: ');
        }
        
        // 输入地理坐标
        console.log('请输入GPS坐标(用于定位签到):');
        const longitude = await prompt(rl, '经度: ');
        const latitude = await prompt(rl, '纬度: ');
        const altitude = await prompt(rl, '海拔(精度): ');
        
        // 设置推送通知
        const pushplusToken = await prompt(rl, '请输入PushPlus推送Token(可选): ');
        
        // 设置定时任务
        const scheduletime = await prompt(rl, '请输入定时任务时间(HH:MM格式，可选): ');
        
        // 更新配置
        jsonData.class = classId;
        jsonData.lng = parseFloat(longitude);
        jsonData.lat = parseFloat(latitude);
        jsonData.acc = altitude || "10";
        jsonData.cookies = cookieObjects;
        jsonData.debug = true;
        
        if (pushplusToken.trim()) {
            jsonData.pushplus = pushplusToken.trim();
        }
        
        if (scheduletime.trim()) {
            jsonData.scheduletime = scheduletime.trim();
        }
        
        // 保存配置
        saveConfig(jsonData);
        
        console.log('配置已保存！');
        console.log(`共配置了 ${cookieObjects.length} 个用户：`);
        cookieObjects.forEach(c => console.log(`- ${c.username}`));
        
    } catch (error) {
        Logger.error(`配置过程出错: ${error.message}`);
        console.log('配置过程出错，请重试');
    } finally {
        rl.close();
    }
};

module.exports = {
    initConfig
}; 