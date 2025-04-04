const axios = require('axios');
const { Logger } = require('../utils/logger');
const cheerio = require('cheerio');

// 提取认证Cookie
const extractAuthCookie = (cookie) => {
    return cookie; // 返回完整Cookie字符串
};

// 获取用户信息和课程列表
const getUserInfo = async (cookie) => {
    try {
        // 提取认证Cookie
        const authCookie = extractAuthCookie(cookie);
        if (!authCookie) {
            Logger.warning('无法获取有效的认证Cookie');
            return null;
        }
        
        // 创建请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 9; AKT-AK47 Build/USER-AK47; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MMWEBID/1136 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/tpg,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'X-Requested-With': 'com.tencent.mm',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh-SG;q=0.9,zh;q=0.8,en-SG;q=0.7,en-US;q=0.6,en;q=0.5',
            'Cookie': authCookie
        };
        
        // 请求用户中心页面
        const url = 'http://k8n.cn/student';
        const response = await axios.get(url, { headers });
        
        if (response.status !== 200) {
            Logger.warning(`获取用户中心页面失败，状态码: ${response.status}`);
            return null;
        }
        
        // 解析HTML获取用户信息
        const $ = cheerio.load(response.data);
        
        // 提取用户名
        let user = null;
        const accountLink = $('a[href="/student/account"]');
        if (accountLink.length > 0) {
            const accountText = accountLink.text().trim();
            // 从"当前账号：王浩璟(3241319117)"中提取用户名
            const match = accountText.match(/当前账号：(.+)/);
            if (match && match[1]) {
                user = {
                    name: match[1]
                };
                Logger.info(`已获取用户名: ${user.name}`);
            }
        }
        
        return user;
    } catch (error) {
        Logger.error(`获取用户信息请求出错: ${error.message}`);
        return null;
    }
};

// 获取所有课程ID
const listAllClassIds = async (cookie) => {
    try {
        const userInfo = await getUserInfo(cookie);
        if (!userInfo) {
            return { user: null, classIds: [] };
        }
        
        Logger.info(`用户 [${userInfo.name}] 信息获取成功`);
        
        // 提取认证Cookie
        const authCookie = extractAuthCookie(cookie);
        if (!authCookie) {
            Logger.warning('无法获取有效的认证Cookie');
            return { user: userInfo, classIds: [] };
        }
        
        // 创建请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 9; AKT-AK47 Build/USER-AK47; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MMWEBID/1136 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/tpg,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'X-Requested-With': 'com.tencent.mm',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh-SG;q=0.9,zh;q=0.8,en-SG;q=0.7,en-US;q=0.6,en;q=0.5',
            'Cookie': authCookie
        };
        
        // 请求用户中心页面
        const url = 'http://k8n.cn/student';
        const response = await axios.get(url, { headers });
        
        if (response.status !== 200) {
            Logger.warning(`获取用户中心页面失败，状态码: ${response.status}`);
            return { user: userInfo, classIds: [] };
        }
        
        // 使用cheerio解析HTML内容
        const $ = cheerio.load(response.data);
        const classItems = [];
        
        // 查找所有班级列表项
        $('.class-item, .course-item, a[href*="/student/course/"]').each((index, element) => {
            const $element = $(element);
            let classId, className;
            
            // 尝试从href属性中提取班级ID
            const href = $element.attr('href') || $element.find('a').attr('href');
            if (href) {
                const match = href.match(/\/student\/course\/(\d+)/);
                if (match && match[1]) {
                    classId = match[1];
                }
            }
            
            // 尝试获取班级名称
            className = $element.find('.class-name, .course-name, .title').text().trim() || 
                       $element.text().trim();
            
            // 如果找到班级ID，添加到结果中
            if (classId) {
                classItems.push({
                    id: classId,
                    name: className || `班级 ${classId}`
                });
            }
        });
        
        // 如果没有找到班级，尝试其他可能的选择器
        if (classItems.length === 0) {
            // 尝试查找所有可能包含班级ID的链接
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                if (href && href.includes('/student/course/')) {
                    const match = href.match(/\/student\/course\/(\d+)/);
                    if (match && match[1]) {
                        const classId = match[1];
                        const className = $(element).text().trim() || `班级 ${classId}`;
                        
                        // 检查是否已经添加过这个班级ID
                        if (!classItems.some(item => item.id === classId)) {
                            classItems.push({
                                id: classId,
                                name: className
                            });
                        }
                    }
                }
            });
        }
        
        Logger.info(`为用户 [${userInfo.name}] 找到 ${classItems.length} 个班级`);
        return { user: userInfo, classIds: classItems };
    } catch (error) {
        Logger.error(`获取课程列表请求出错: ${error.message}`);
        return { user: null, classIds: [] };
    }
};

// 检查用户登录状态
const checkUserSignIn = async (cookieObj) => {
    const { cookie, username } = cookieObj;
    
    try {
        // 提取认证Cookie
        const authCookie = extractAuthCookie(cookie);
        if (!authCookie) {
            Logger.warning(`用户 [${username}] Cookie无效，无法提取认证信息`);
            return false;
        }
        
        // 创建请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 9; AKT-AK47 Build/USER-AK47; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MMWEBID/1136 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/wxpic,image/tpg,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'X-Requested-With': 'com.tencent.mm',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh-SG;q=0.9,zh;q=0.8,en-SG;q=0.7,en-US;q=0.6,en;q=0.5',
            'Cookie': authCookie
        };
        
        // 请求用户中心页面
        const url = 'http://k8n.cn/student';
        const response = await axios.get(url, { headers });
        
        if (response.status === 200) {
            // 检查是否包含用户信息
            const $ = cheerio.load(response.data);
            const accountLink = $('a[href="/student/account"]');
            
            if (accountLink.length > 0) {
                Logger.info(`用户 [${username}] 身份验证成功`);
                return true;
            }
        }
        
        Logger.warning(`用户 [${username}] Cookie已失效，请重新配置`);
        return false;
    } catch (error) {
        Logger.error(`用户 [${username}] 身份验证请求出错: ${error.message}`);
        return false;
    }
};

module.exports = {
    getUserInfo,
    listAllClassIds,
    checkUserSignIn,
    extractAuthCookie
}; 