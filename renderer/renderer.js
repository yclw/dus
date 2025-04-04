// DOM 元素
const configForm = document.getElementById('config-form');
const scheduletimeInput = document.getElementById('scheduletime');
const lngInput = document.getElementById('lng');
const latInput = document.getElementById('lat');
const accInput = document.getElementById('acc'); // 添加海拔/精度输入框
const pushplusInput = document.getElementById('pushplus');
const debugCheckbox = document.getElementById('debug');
const autoLaunchCheckbox = document.getElementById('auto-launch'); // 自启动选项
const cookiesContainer = document.getElementById('cookies-container');
const addCookieBtn = document.getElementById('add-cookie-btn');
const cookieTemplate = document.getElementById('cookie-template');
const manualSignBtn = document.getElementById('manual-sign-btn');
const signStatus = document.getElementById('sign-status');
const taskStatus = document.getElementById('task-status');
const notificationContainer = document.getElementById('notification-container');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Cookie帮助相关元素
const helpCookieBtn = document.getElementById('help-cookie-btn');
const cookieHelpModal = document.getElementById('cookie-help-modal');
const closeModalBtn = document.querySelector('#cookie-help-modal .close');

// 班级选择相关元素
const classSelectionContainer = document.getElementById('class-selection-container');
const classSelect = document.getElementById('class-select');
const classLoading = document.getElementById('class-loading');
const fetchClassesBtn = document.getElementById('fetch-classes-btn');

// 全局变量
let currentClassList = [];
let selectedClassId = '';

// 初始化应用程序
document.addEventListener('DOMContentLoaded', async () => {
    // 加载配置
    await loadConfig();
    
    // 加载自启动状态
    await loadAutoLaunchStatus();
    
    // 注册事件监听器
    registerEventListeners();
    
    // 监听通知
    window.electronAPI.onNotification(showNotification);
    
    // 监听配置保存
    window.electronAPI.onConfigSaved((result) => {
        if (result.success) {
            showNotification({ type: 'success', message: '配置已保存' });
        } else {
            showNotification({ type: 'error', message: `保存配置失败: ${result.error}` });
        }
    });
    
    // 监听签到结果
    window.electronAPI.onSignResult(updateSignStatus);
});

// 注册事件监听器
function registerEventListeners() {
    // 表单提交
    configForm.addEventListener('submit', saveConfig);
    
    // 添加Cookie
    addCookieBtn.addEventListener('click', () => addCookieItem());
    
    // 手动签到
    manualSignBtn.addEventListener('click', manualSign);
    
    // 获取班级列表
    fetchClassesBtn.addEventListener('click', fetchClassList);
    
    // 标签页切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // 切换激活的标签按钮
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 切换激活的内容面板
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
        });
    });
    
    // 班级选择变更
    classSelect.addEventListener('change', () => {
        selectedClassId = classSelect.value;
    });
    
    // Cookie帮助对话框
    helpCookieBtn.addEventListener('click', () => {
        cookieHelpModal.style.display = 'block';
    });
    
    closeModalBtn.addEventListener('click', () => {
        cookieHelpModal.style.display = 'none';
    });
    
    // 点击modal外部关闭对话框
    window.addEventListener('click', (event) => {
        if (event.target === cookieHelpModal) {
            cookieHelpModal.style.display = 'none';
        }
    });
    
    // 按ESC键关闭对话框
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && cookieHelpModal.style.display === 'block') {
            cookieHelpModal.style.display = 'none';
        }
    });
    
    // 自启动状态变更
    autoLaunchCheckbox.addEventListener('change', async () => {
        const enabled = autoLaunchCheckbox.checked;
        
        try {
            const result = await window.electronAPI.setAutoLaunchStatus(enabled);
            
            if (result.success) {
                showNotification({ 
                    type: 'success', 
                    message: `已${enabled ? '启用' : '禁用'}开机自启动` 
                });
            } else {
                showNotification({ 
                    type: 'error', 
                    message: `设置自启动状态失败: ${result.error}` 
                });
                // 如果设置失败，恢复之前的状态
                autoLaunchCheckbox.checked = !enabled;
            }
        } catch (error) {
            showNotification({ 
                type: 'error', 
                message: `设置自启动状态出错: ${error.message}` 
            });
            // 如果设置出错，恢复之前的状态
            autoLaunchCheckbox.checked = !enabled;
        }
    });
}

// 加载配置
async function loadConfig() {
    try {
        const response = await window.electronAPI.loadConfig();
        
        if (response.success) {
            const config = response.config;
            
            // 填充表单
            if (config.scheduletime) {
                scheduletimeInput.value = config.scheduletime;
                updateTaskStatus(config.scheduletime);
            }
            
            if (config.lng) lngInput.value = config.lng;
            if (config.lat) latInput.value = config.lat;
            if (config.acc) accInput.value = config.acc;
            if (config.class) selectedClassId = config.class;
            if (config.pushplus) pushplusInput.value = config.pushplus;
            if (config.debug) debugCheckbox.checked = config.debug;
            
            // 填充Cookie
            if (config.cookies && config.cookies.length > 0) {
                // 清空现有的Cookie
                cookiesContainer.innerHTML = '';
                
                // 添加新的Cookie
                config.cookies.forEach(cookie => {
                    addCookieItem(null, cookie);
                });
                
                // 如果有有效的Cookie，显示班级选择区域
                if (config.cookies.length > 0) {
                    classSelectionContainer.style.display = 'block';
                }
            } else {
                // 至少添加一个空的Cookie项
                addCookieItem();
            }
        } else {
            showNotification({ type: 'error', message: `加载配置失败: ${response.error}` });
        }
    } catch (error) {
        showNotification({ type: 'error', message: `加载配置出错: ${error.message}` });
    }
}

// 加载自启动状态
async function loadAutoLaunchStatus() {
    try {
        const result = await window.electronAPI.getAutoLaunchStatus();
        
        if (result.success) {
            autoLaunchCheckbox.checked = result.enabled;
        } else {
            showNotification({ type: 'error', message: `获取自启动状态失败: ${result.error}` });
        }
    } catch (error) {
        showNotification({ type: 'error', message: `获取自启动状态出错: ${error.message}` });
    }
}

// 保存配置
async function saveConfig(event) {
    if (event) event.preventDefault();
    
    try {
        const config = {
            scheduletime: scheduletimeInput.value,
            lng: lngInput.value,
            lat: latInput.value,
            acc: accInput.value,
            class: selectedClassId,
            pushplus: pushplusInput.value,
            debug: debugCheckbox.checked,
            cookies: []
        };
        
        // 收集Cookie
        const cookieItems = cookiesContainer.querySelectorAll('.cookie-item');
        cookieItems.forEach(item => {
            const username = item.querySelector('.username').value.trim();
            const cookieValue = item.querySelector('.cookie-value').value.trim();
            
            if (cookieValue) {
                config.cookies.push({
                    username,
                    cookie: cookieValue
                });
            }
        });
        
        // 发送到主进程
        window.electronAPI.saveConfig(config);
        
        // 更新任务状态
        if (config.scheduletime) {
            updateTaskStatus(config.scheduletime);
        }
    } catch (error) {
        showNotification({ type: 'error', message: `保存配置出错: ${error.message}` });
    }
}

// 添加Cookie项
function addCookieItem(event, cookieData = null) {
    // 克隆模板
    const template = cookieTemplate.content.cloneNode(true);
    const cookieItem = template.querySelector('.cookie-item');
    
    // 如果有数据，填充数据
    if (cookieData) {
        cookieItem.querySelector('.username').value = cookieData.username || '';
        cookieItem.querySelector('.cookie-value').value = cookieData.cookie || '';
    }
    
    // 添加验证Cookie按钮事件
    const checkBtn = cookieItem.querySelector('.check-cookie-btn');
    checkBtn.addEventListener('click', async () => {
        const cookieValue = cookieItem.querySelector('.cookie-value').value.trim();
        const usernameInput = cookieItem.querySelector('.username');
        
        if (!cookieValue) {
            showNotification({ type: 'warning', message: '请先输入Cookie' });
            return;
        }
        
        checkBtn.disabled = true;
        checkBtn.textContent = '验证中...';
        
        try {
            const result = await window.electronAPI.verifyCookie(cookieValue);
            
            if (result.success) {
                usernameInput.value = result.user.name;
                showNotification({ 
                    type: 'success', 
                    message: `验证成功，用户名: ${result.user.name}` 
                });
                
                // 显示班级选择区域
                classSelectionContainer.style.display = 'block';
            } else {
                usernameInput.value = '';
                showNotification({ 
                    type: 'error', 
                    message: `Cookie验证失败: ${result.error}` 
                });
            }
        } catch (error) {
            showNotification({ 
                type: 'error', 
                message: `验证Cookie出错: ${error.message}` 
            });
        } finally {
            checkBtn.disabled = false;
            checkBtn.textContent = '验证Cookie';
        }
    });
    
    // 添加删除按钮事件
    const removeBtn = cookieItem.querySelector('.remove-cookie-btn');
    removeBtn.addEventListener('click', () => {
        cookieItem.remove();
        
        // 如果没有Cookie项了，隐藏班级选择区域
        if (cookiesContainer.querySelectorAll('.cookie-item').length === 0) {
            classSelectionContainer.style.display = 'none';
        }
    });
    
    // 添加Cookie值变化监听
    const cookieValueInput = cookieItem.querySelector('.cookie-value');
    cookieValueInput.addEventListener('change', () => {
        // 当Cookie值更改时，清空用户名
        const usernameInput = cookieItem.querySelector('.username');
        if (usernameInput.value && cookieValueInput.value.trim() === '') {
            usernameInput.value = '';
        }
    });
    
    // 添加到容器
    cookiesContainer.appendChild(cookieItem);
    
    // 如果是新添加的空Cookie项，默认聚焦到Cookie输入框
    if (!cookieData) {
        cookieItem.querySelector('.cookie-value').focus();
    }
}

// 获取班级列表
async function fetchClassList() {
    // 检查是否有Cookie
    const cookieItems = cookiesContainer.querySelectorAll('.cookie-item');
    let validCookie = '';
    
    for (const item of cookieItems) {
        const cookieValue = item.querySelector('.cookie-value').value.trim();
        const usernameInput = item.querySelector('.username');
        
        if (cookieValue && usernameInput.value) {
            validCookie = cookieValue;
            break;
        }
    }
    
    if (!validCookie) {
        showNotification({ 
            type: 'warning', 
            message: '请先添加并验证至少一个有效的Cookie' 
        });
        return;
    }
    
    // 显示加载中状态
    fetchClassesBtn.disabled = true;
    classLoading.style.display = 'flex';
    classSelect.innerHTML = '<option value="">加载中...</option>';
    
    try {
        const result = await window.electronAPI.fetchClassList(validCookie);
        
        if (result.success && result.classList.length > 0) {
            // 清空现有选项
            classSelect.innerHTML = '';
            
            // 更新全局变量
            currentClassList = result.classList;
            
            // 添加班级选项
            result.classList.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.id;
                option.textContent = `${cls.name} (ID: ${cls.id})`;
                
                // 如果有已选择的班级ID，则选中它
                if (cls.id === selectedClassId) {
                    option.selected = true;
                }
                
                classSelect.appendChild(option);
            });
            
            // 如果没有选中项但有班级列表，默认选中第一个
            if (!selectedClassId && result.classList.length > 0) {
                selectedClassId = result.classList[0].id;
                classSelect.value = selectedClassId;
            }
            
            showNotification({ 
                type: 'success', 
                message: `成功获取到 ${result.classList.length} 个班级` 
            });
        } else {
            classSelect.innerHTML = '<option value="">未获取到班级列表</option>';
            showNotification({ 
                type: 'warning', 
                message: result.error || '未找到任何班级' 
            });
        }
    } catch (error) {
        classSelect.innerHTML = '<option value="">获取失败</option>';
        showNotification({ 
            type: 'error', 
            message: `获取班级列表出错: ${error.message}` 
        });
    } finally {
        fetchClassesBtn.disabled = false;
        classLoading.style.display = 'none';
    }
}

// 手动签到
async function manualSign() {
    try {
        // 禁用按钮
        manualSignBtn.disabled = true;
        manualSignBtn.textContent = '正在签到...';
        
        // 执行签到
        const result = await window.electronAPI.manualSign();
        
        // 更新状态
        updateSignStatus(result);
        
        // 启用按钮
        manualSignBtn.disabled = false;
        manualSignBtn.textContent = '立即签到';
    } catch (error) {
        showNotification({ type: 'error', message: `签到出错: ${error.message}` });
        manualSignBtn.disabled = false;
        manualSignBtn.textContent = '立即签到';
    }
}

// 更新签到状态
function updateSignStatus(result) {
    if (!result) {
        signStatus.innerHTML = '<p>未执行签到</p>';
        return;
    }
    
    if (result.success) {
        let html = '<div class="sign-results">';
        
        // 显示成功的用户
        const successUsers = result.results.filter(r => r.success);
        if (successUsers.length > 0) {
            html += '<h3>签到成功的用户</h3><ul>';
            successUsers.forEach(user => {
                html += `<li>${user.username}</li>`;
            });
            html += '</ul>';
        } else {
            html += '<h3>没有用户签到成功</h3>';
        }
        
        // 显示失败的用户
        const failUsers = result.results.filter(r => !r.success);
        if (failUsers.length > 0) {
            html += '<h3>签到失败的用户</h3><ul>';
            failUsers.forEach(user => {
                html += `<li>${user.username}: ${user.error || '未知错误'}</li>`;
            });
            html += '</ul>';
        }
        
        html += '</div>';
        signStatus.innerHTML = html;
        
        // 显示签到成功通知
        showNotification({ type: 'success', message: '签到执行完成' });
    } else {
        signStatus.innerHTML = `<p class="error">签到失败: ${result.error || '未知错误'}</p>`;
        showNotification({ type: 'error', message: `签到失败: ${result.error || '未知错误'}` });
    }
}

// 更新任务状态
function updateTaskStatus(time) {
    if (time) {
        taskStatus.innerHTML = `<p>定时任务将在每天 ${time} 执行</p>`;
    } else {
        taskStatus.innerHTML = '<p>未设置定时任务</p>';
    }
}

// 显示通知
function showNotification(notification) {
    const { type, message } = notification;
    
    // 创建通知元素
    const notificationEl = document.createElement('div');
    notificationEl.classList.add('notification', type);
    notificationEl.textContent = message;
    
    // 添加到容器
    notificationContainer.appendChild(notificationEl);
    
    // 3秒后删除
    setTimeout(() => {
        notificationEl.remove();
    }, 3000);
} 