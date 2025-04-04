# 班级魔方GPS自动签到

一个用于班级魔方的自动GPS签到工具，支持多用户、定时任务和消息推送。

## 特点

- **多用户支持**: 支持配置多个Cookie，同时为多个用户进行签到
- **自动获取信息**: 自动获取班级列表，无需手动输入班级ID
- **自动识别用户**: 自动识别Cookie对应的用户名，提升用户体验
- **定时任务**: 支持配置cron格式的定时任务
- **消息推送**: 支持使用PushPlus进行签到结果通知
- **GPS模拟**: 模拟GPS坐标偏移，使签到位置更真实

## 项目结构

```
├── package.json           # 项目配置文件
├── README.md              # 项目说明文档
└── src                    # 源代码目录
    ├── index.js           # 主入口文件
    ├── config/            # 配置管理
    │   ├── index.js       # 配置操作基础方法
    │   └── setup.js       # 配置初始化
    ├── users/             # 用户管理
    │   └── index.js       # 用户信息获取
    ├── signin/            # 签到功能
    │   └── index.js       # 签到相关功能
    ├── cli/               # 命令行处理
    │   └── index.js       # 命令行参数处理
    └── utils/             # 工具函数
        ├── logger.js      # 日志工具
        ├── gps.js         # GPS坐标处理
        └── notify.js      # 通知推送
```

## 安装

```bash
# 克隆仓库
git clone <仓库地址>
cd bjmfapp-gps-signin

# 安装依赖
npm install

# 全局安装（可选）
npm install -g .
```

## 使用方法

### 初始化配置

```bash
# 使用npm脚本
npm run init

# 或者使用命令行
node src/index.js --init

# 如果全局安装
bjmf-signin --init
```

### 执行签到

```bash
# 使用npm脚本
npm run sign

# 或者使用命令行
node src/index.js --sign

# 如果全局安装
bjmf-signin --sign
```

### 设置日志级别

```bash
# 设置日志级别为info、warning或error
node src/index.js --log info
```

## 配置说明

初始化配置时，您需要提供以下信息：

1. **Cookie**: 从班级魔方网站获取，可以配置多个（输入空行结束）
2. **班级ID**: 可以从获取的班级列表中选择，也可以手动输入
3. **GPS坐标**: 签到位置的经纬度
4. **PushPlus Token**: 用于推送签到结果（可选）
5. **定时任务**: cron格式的定时任务配置（可选）

## 多用户支持

本工具支持同时为多个用户进行签到：

- 配置时可输入多个Cookie
- 程序会自动获取每个Cookie对应的用户名
- 签到结果会显示每个用户的成功/失败状态
- 支持自动检测并提示Cookie失效的情况

## 温馨提示

- 请确保提供的Cookie有效
- GPS坐标请使用有效的经纬度格式
- 定时任务请使用标准cron格式
