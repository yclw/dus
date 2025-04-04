// 预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  onConfigSaved: (callback) => {
    ipcRenderer.on('config-saved', (_, result) => callback(result));
    return () => ipcRenderer.removeListener('config-saved', callback);
  },
  
  // 签到相关
  manualSign: () => ipcRenderer.invoke('manual-sign'),
  onSignResult: (callback) => {
    ipcRenderer.on('sign-result', (_, result) => callback(result));
    return () => ipcRenderer.removeListener('sign-result', callback);
  },
  
  // 用户和班级相关
  fetchClassList: (cookie) => ipcRenderer.invoke('fetch-class-list', cookie),
  verifyCookie: (cookie) => ipcRenderer.invoke('verify-cookie', cookie),
  
  // 自启动相关
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunchStatus: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  
  // 通知相关
  onNotification: (callback) => {
    ipcRenderer.on('notification', (_, notification) => callback(notification));
    return () => ipcRenderer.removeListener('notification', callback);
  }
}); 