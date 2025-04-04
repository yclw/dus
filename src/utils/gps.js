/**
 * 修改GPS坐标，添加随机偏移
 * @param {number|string} coordinate - 原始GPS坐标
 * @returns {number} - 修改后的GPS坐标
 */
const modifyGPSLocation = (coordinate) => {
    // 将坐标转换为浮点数并格式化为8位小数
    const originalCoord = parseFloat(coordinate).toFixed(8);
    
    // 提取小数部分
    const parts = originalCoord.toString().split('.');
    let decimalPart = parts[1] || '';
    
    // 确保小数部分有足够的位数
    while (decimalPart.length < 8) {
        decimalPart += '0';
    }
    
    // 生成-15000到15000之间的随机偏移
    const randomOffset = Math.floor(Math.random() * 30000) - 15000;
    
    // 转换为数值并添加偏移
    const decimalValue = parseInt(decimalPart) + randomOffset;
    
    // 重新构建坐标
    let newCoord;
    if (decimalValue < 0) {
        // 如果小数部分变为负数，需要适当处理整数部分
        const intPart = parseInt(parts[0]);
        newCoord = (intPart - 1) + (1 + decimalValue / 100000000);
    } else {
        newCoord = parseInt(parts[0]) + (decimalValue / 100000000);
    }
    
    // 确保返回的是一个数字
    return parseFloat(newCoord.toFixed(8));
};

module.exports = {
    modifyGPSLocation
}; 