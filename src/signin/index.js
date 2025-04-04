const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const { modifyGPSLocation } = require('../utils/gps');
const { checkUserSignIn, extractAuthCookie } = require('../users');

// 确保日志目录存在
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

// 查找正在进行的签到任务
const findSignInTasks = (html) => {
    try {
        const $ = cheerio.load(html);
        const matches = [];
        
        console.log('正在检查页面中的签到任务...');
        
        // 查找 onclick="punch_gps(数字)" 的元素
        $('[onclick^="punch_gps("]').each((index, element) => {
            const onclick = $(element).attr('onclick');
            if (onclick) {
                console.log(`找到GPS签到元素 onclick: ${onclick}`);
                const match = onclick.match(/punch_gps\((\d+)\)/);
                if (match && match[1]) {
                    matches.push(match[1]);
                    console.log(`已提取签到ID: ${match[1]}`);
                }
            }
        });
        
        if (matches.length === 0) {
            // 输出页面内容摘要以便调试
            console.log('所有方法均未找到GPS签到任务，以下是页面相关元素摘要:');
            $('a, button, .card, [onclick], form').each((i, el) => {
                const text = $(el).text().trim();
                const onclick = $(el).attr('onclick');
                const action = $(el).attr('action');
                if ((text && (text.includes('签到') || text.includes('未签'))) || 
                    (onclick && onclick.includes('punch')) || 
                    (action && action.includes('punchs'))) {
                    console.log(`- 元素类型: ${el.name}, 文本: ${text.substring(0, 30)}, onclick: ${onclick}, action: ${action}`);
                }
            });
        } else {
            console.log(`总共找到 ${matches.length} 个签到任务`);
        }
        
        return matches;
    } catch (error) {
        console.error(`查找签到任务时出错: ${error.message}`);
        Logger.error(`查找签到任务出错: ${error.message}`);
        return [];
    }
};

// 创建请求头
const createHeaders = (authCookie, classId) => {
    return {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; AKT-AK47 Build/USER-AK47; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MMWEBID/1136 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/tpg,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'X-Requested-With': 'com.tencent.mm',
        'Referer': 'http://k8n.cn/student/course/' + classId,
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'zh-CN,zh-SG;q=0.9,zh;q=0.8,en-SG;q=0.7,en-US;q=0.6,en;q=0.5',
        'Cookie': authCookie
    };
};

// 执行签到功能
const signIn = async (cookieObj, longitude, latitude, classId) => {
    const { cookie, username } = cookieObj;
    
    try {
        console.log(`\n开始为用户 [${username}] 执行签到流程...`);
        
        // 提取认证Cookie
        const authCookie = extractAuthCookie(cookie);
        if (!authCookie) {
            console.log(`用户 [${username}] Cookie无效，无法提取认证信息`);
            Logger.warning(`用户 [${username}] Cookie无效，无法提取认证信息`);
            return { success: false, message: 'Cookie无效' };
        }
        
        // 创建请求头
        const headers = createHeaders(authCookie, classId);
        
        // 获取签到任务
        const punchUrl = `http://k8n.cn/student/course/${classId}/punchs`;
        console.log(`请求签到页面: ${punchUrl}`);
        
        const punchResponse = await axios.get(punchUrl, { headers });
        
        if (punchResponse.status !== 200) {
            console.log(`用户 [${username}] 获取签到页面失败，状态码: ${punchResponse.status}`);
            Logger.warning(`用户 [${username}] 获取签到页面失败，状态码: ${punchResponse.status}`);
            return { success: false, message: '获取签到页面失败' };
        }
        
        // 保存HTML用于调试
        try {
            const logDir = ensureLogDir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const punchPagePath = path.join(logDir, `punch_page_${timestamp}.html`);
            fs.writeFileSync(punchPagePath, punchResponse.data);
            console.log(`已保存签到页面HTML到 ${punchPagePath}`);
        } catch (err) {
            console.log(`保存HTML失败: ${err.message}`);
        }
        
        // 查找签到任务
        console.log(`开始解析页面查找签到任务...`);
        const signInTasks = findSignInTasks(punchResponse.data);
        
        if (signInTasks.length === 0) {
            console.log(`用户 [${username}] 未找到进行中的签到任务`);
            Logger.info(`用户 [${username}] 未找到进行中的签到任务`);
            return { success: true, message: '未找到进行中的签到任务' };
        }
        
        console.log(`找到 ${signInTasks.length} 个签到任务，开始签到...`);
        
        // 执行签到
        for (const signId of signInTasks) {
            // 修改GPS坐标
            const modifiedLongitude = modifyGPSLocation(longitude);
            const modifiedLatitude = modifyGPSLocation(latitude);
            
            console.log(`用户 [${username}] 使用GPS坐标 [${modifiedLongitude}, ${modifiedLatitude}] 签到，签到ID: ${signId}`);
            Logger.info(`用户 [${username}] 尝试签到，使用GPS坐标: ${modifiedLongitude}, ${modifiedLatitude}`);
            
            const url = `http://k8n.cn/student/punchs/course/${classId}/${signId}`;
            
            // 构建payload - 字段名与实际表单匹配
            const payload = {
                'id': signId,
                'lat': modifiedLatitude,
                'lng': modifiedLongitude,
                'acc': '10', // 海拔/精度
                'res': '',
                'gps_addr': ''
            };
            
            console.log(`发送签到请求: ${url}`);
            console.log(`请求参数: ${JSON.stringify(payload)}`);
            
            // 添加必要的请求头部
            const postHeaders = {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'http://k8n.cn',
                'Referer': `http://k8n.cn/student/course/${classId}/punchs`
            };
            
            const signResponse = await axios.post(
                url, 
                new URLSearchParams(payload).toString(), 
                { headers: postHeaders }
            );
            
            if (signResponse.status === 200) {
                // 保存签到结果HTML
                try {
                    const logDir = ensureLogDir();
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const resultPath = path.join(logDir, `sign_result_${timestamp}.html`);
                    fs.writeFileSync(resultPath, signResponse.data);
                    console.log(`已保存签到结果HTML到 ${resultPath}`);
                } catch (err) {
                    console.log(`保存HTML失败: ${err.message}`);
                }
                
                // 解析响应的 HTML 内容
                const $response = cheerio.load(signResponse.data);
                
                // 尝试多种方式查找结果
                let resultText = '';
                
                // 方法1: 查找div#title
                const divTag = $response('div#title');
                if (divTag.length > 0) {
                    resultText = divTag.text().trim();
                } 
                // 方法2: 查找包含结果的任何文本
                else if ($response.html().includes('签到成功')) {
                    resultText = '签到成功';
                }
                // 方法3: 查找layui-layer-content
                else {
                    const layerContent = $response('.layui-layer-content');
                    if (layerContent.length > 0) {
                        resultText = layerContent.text().trim();
                    }
                }
                
                if (resultText) {
                    console.log(`用户 [${username}] 签到结果: ${resultText}`);
                    Logger.info(`用户 [${username}] 签到结果: ${resultText}`);
                    return { success: true, message: resultText };
                } else {
                    console.log(`用户 [${username}] 签到可能成功，但未找到结果确认`);
                    Logger.info(`用户 [${username}] 签到可能成功，但未找到结果确认`);
                    
                    // 尝试从整个页面内容中找线索
                    const pageText = $response.text();
                    if (pageText.includes('成功') || pageText.includes('已签到')) {
                        console.log(`页面内容包含"成功"或"已签到"关键词，认为签到成功`);
                        return { success: true, message: '从页面内容判断签到成功' };
                    }
                    
                    return { success: true, message: '签到可能成功' };
                }
            } else {
                console.log(`用户 [${username}] 签到请求失败，状态码: ${signResponse.status}`);
                Logger.warning(`用户 [${username}] 签到请求失败，状态码: ${signResponse.status}`);
                return { success: false, message: '签到请求失败' };
            }
        }
        
        return { success: true, message: '签到任务已完成' };
    } catch (error) {
        console.error(`用户 [${username}] 签到请求出错: ${error.message}`);
        Logger.error(`用户 [${username}] 签到请求出错: ${error.message}`);
        return { success: false, message: error.message };
    }
};

// 执行多用户签到
const qiandao = async (cookieObjects, longitude, latitude, classId) => {
    const errorCookies = [];
    const results = [];
    
    // 检查参数
    if (!cookieObjects || cookieObjects.length === 0) {
        Logger.error('未提供有效的Cookie，无法执行签到');
        return { success: false, results: [], errorCookies: [] };
    }
    
    // 遍历所有cookie进行签到
    for (const cookieObj of cookieObjects) {
        const { cookie, username } = cookieObj;
        
        // 验证cookie有效性
        const isValid = await checkUserSignIn(cookieObj);
        if (!isValid) {
            errorCookies.push(cookieObj);
            continue;
        }
        
        // 执行签到
        const result = await signIn(cookieObj, longitude, latitude, classId);
        results.push({
            username,
            ...result
        });
    }
    
    return {
        success: results.some(r => r.success),
        results,
        errorCookies
    };
};

module.exports = {
    signIn,
    qiandao,
    findSignInTasks
}; 