const axios = require('axios');

// 发送推送通知
const sendPushNotification = async (token, title, content) => {
    if (!token) return;
    
    try {
        const notifyUrl = `http://www.pushplus.plus/send?token=${token}&title=${title}&content=${content}`;
        await axios.get(notifyUrl);
        console.log("通知已发送");
        return true;
    } catch (error) {
        console.log("发送通知失败:", error.message);
        return false;
    }
};

module.exports = {
    sendPushNotification
}; 