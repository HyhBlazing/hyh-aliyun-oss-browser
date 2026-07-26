# OSS Browser

基于阿里云开源 [oss-browser](https://github.com/aliyun/oss-browser) 的桌面客户端，提供类似资源管理器的对象存储管理能力：浏览、上传、下载、搜索与权限管理等。

本仓库为本地定制版，在原有功能基础上做了界面与体验调整。

## 当前版本与技术栈

| 项       | 说明                                                 |
| -------- | ---------------------------------------------------- |
| 版本     | `1.18.0`                                             |
| 桌面框架 | Electron `1.8.4`                                     |
| 前端     | AngularJS `1.5` + Bootstrap 3                        |
| 语言     | 仅简体中文（已移除英/日等多语言与语言切换）          |
| UI 风格  | Apple / iOS 风格素色界面（见 `app/z-mac-theme.css`） |

> 注意：当前 Electron 内置 Chromium 较旧，**不支持 flexbox `gap`**，布局间距请使用 `margin`。

## 主要能力

- **登录**：AccessKey 登录、授权码（STS）登录；子用户可预设 OSS 路径
- **Bucket 管理**：新建 / 删除、ACL、碎片（Multipart）管理
- **文件管理**：浏览目录与对象，增删改查，复制 / 移动 / 重命名，拖拽上传，预览
- **传输**：上传 / 下载任务面板，支持断点续传；右下角传输坞可查看进度
- **地址栏**：`oss://` 协议、前进后退、刷新、首页跳转、收藏
- **授权**：简化 RAM Policy、生成临时授权码
- **其他**：归档存储解冻、自定义域名（CNAME）、请求者付费等

## 本仓库相对上游的定制点

- 界面统一为克制的素色风格，Bucket / 文件列表、工具栏、传输面板等已做视觉整理
- 界面文案固定为中文，文案字典见 `node/i18n/zh-CN.js`
- **已移除自动升级**相关逻辑与入口
- 「保存为首页」按钮默认隐藏；可在 **设置 → 系统设置 → 显示设为首页** 中开启
- 文件列表多选以复选框为准；名称点击用于打开 / 预览

## 支持平台

Windows 7 及以上、macOS、Linux。不建议在 Windows XP / Windows Server 上使用。

## 客户端下载（官方发布包）

最新官方包版本 `1.18.0`，解压即可使用：

| 平台        | 下载                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Windows x32 | [下载](https://oss-attachment.oss-cn-zhangjiakou.aliyuncs.com/ossbrowser/1.18.0/oss-browser-win32-ia32.zip) |
| Windows x64 | [下载](https://oss-attachment.oss-cn-zhangjiakou.aliyuncs.com/ossbrowser/1.18.0/oss-browser-win32-x64.zip)  |
| macOS       | [下载](https://oss-attachment.oss-cn-zhangjiakou.aliyuncs.com/ossbrowser/1.18.0/oss-browser-darwin-x64.zip) |
| Linux x32   | [下载](https://oss-attachment.oss-cn-zhangjiakou.aliyuncs.com/ossbrowser/1.18.0/oss-browser-linux-ia32.zip) |
| Linux x64   | [下载](https://oss-attachment.oss-cn-zhangjiakou.aliyuncs.com/ossbrowser/1.18.0/oss-browser-linux-x64.zip)  |

更多历史版本见 [all-releases.md](all-releases.md)。

> 本仓库自行修改后的效果，需本地开发运行或自行打包，不以上述官方下载包为准。

## 开发环境

### 依赖

- Node.js（官方 `package.json` 标注引擎为 `8.2.1`；实际开发中也可用较新 Node，注意兼容提示）
- npm / cnpm
- Windows 下建议安装 Git Bash；若使用 `make`，需自行准备 `make.exe`

### 安装依赖

```bash
# 推荐使用 cnpm 加速
cnpm i

# 或
npm i
```

### 构建前端到 dist

```bash
# 使用 Makefile（需 make）
make build CUSTOM=./custom

# 或直接调用 gulp（Windows PowerShell 示例）
node node_modules\gulp\bin\gulp.js build --custom=./custom
```

### 开发模式运行

监听源码变更并启动 Electron：

```bash
# Makefile
make run CUSTOM=./custom

# Windows PowerShell 可拆成两步
node node_modules\gulp\bin\gulp.js watch --custom=./custom
$env:NODE_ENV="development"; node_modules\electron\dist\electron.exe .
```

说明：

- 开发模式下修改 `app/`、`node/i18n/` 等一般会自动编译到 `dist/`
- 修改 **主进程** `main.js` 或入口 `index.html` 后，通常需要**重启 Electron**
- 调试：macOS 可用 Command+Option+I；Windows / Linux 一般可用 F12。也可连续点击左上角图标约 10 次打开调试面板

### 单独重建常用产物

```bash
node node_modules\gulp\bin\gulp.js js --custom=./custom
node node_modules\gulp\bin\gulp.js templates --custom=./custom
node node_modules\gulp\bin\gulp.js css --custom=./custom
node node_modules\gulp\bin\gulp.js copy-i18n --custom=./custom
```

### 打包

```bash
make win64 CUSTOM=./custom   # 可选：win32 / mac / linux64 / linux32 / all
```

产物目录：

- `dist/`：前端构建结果（运行时加载）
- `build/`：Electron 打包应用
- `releases/`：压缩包（绿色免安装）

自定义名称、图标、关于页等，见 [custom/Readme.md](custom/Readme.md)。

## 目录结构

```
oss-browser/
 ├── app/                 # 渲染进程前端（AngularJS）
 │    ├── z-mac-theme.css # 素色 / Apple 风格主题
 │    ├── main/           # 主界面、文件列表、传输、设置等
 │    └── components/     # 服务、指令等
 ├── custom/              # 应用名、图标等定制配置
 ├── node/                # 前端调用的 Node 模块
 │    ├── crc64/          # 完整性校验
 │    ├── ossstore/       # 上传 / 下载任务
 │    └── i18n/           # 中文文案（zh-CN）
 ├── vendor/              # 前端 SDK 等依赖
 ├── dist/                # gulp 构建输出
 ├── build/               # electron-packager 输出
 ├── gulpfile.js          # 构建任务
 ├── package.json         # 依赖与脚本
 └── main.js              # Electron 主进程入口
```

## 设置项摘要

设置面板可调整上传下载并发、超时、分片大小、缩略图开关、列举数量等。

与本定制相关：

- **是否显示图片缩略**：列表中显示图片缩略（会消耗流量）
- **显示设为首页**：开启后，地址栏显示「保存为首页」按钮

## 注意事项

- 使用中尽量避免本机代理 / VPN 干扰 OSS 请求
- 排障时可打开调试面板查看控制台日志；更细的调试说明见 [debug.md](debug.md)
- 上游贡献、Issue 流程可参考原仓库；本仓库以本地定制维护为主

## 相关文档

- [开发备忘](dev.md)
- [授权码说明](authToken.md)
- [调试说明](debug.md)
- [SMTP 设置](smtpSetting.md)
- [自定义构建](custom/Readme.md)
- 官方帮助：[ossbrowser 文档](https://help.aliyun.com/document_detail/61872.html)

## 开源协议

[Apache License 2.0](LICENSE)
