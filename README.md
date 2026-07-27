# hyh-aliyun-oss-browser

[![Release](https://img.shields.io/github/v/release/HyhBlazing/hyh-aliyun-oss-browser)](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases)
[![License](https://img.shields.io/github/license/HyhBlazing/hyh-aliyun-oss-browser)](LICENSE)

基于阿里云开源项目 [aliyun/oss-browser](https://github.com/aliyun/oss-browser) 的 **非官方定制客户端**（仓库名：`hyh-aliyun-oss-browser`）。

> **重要声明（请先阅读）**  
> - 本仓库 **不是** 阿里云 / 阿里云 OSS 官方产品，与阿里云无隶属或背书关系。  
> - 上游原作为 [aliyun/oss-browser](https://github.com/aliyun/oss-browser)，版权归原作者 **Aliyun.com**（Apache License 2.0）。  
> - 本仓库在上游基础上进行了 UI/功能定制，以及 **3.x Tauri + Vue 重写**；修改部分版权见 [NOTICE](NOTICE)。  
> - 「阿里云」「Alibaba Cloud」「OSS」等为相应权利人商标，仅用于说明兼容性与来源。  
> - 请遵守当地法律法规与云服务商协议；请勿提交或泄露真实 AccessKey。

## 版本说明

| 系列 | 技术栈 | 目录 | 状态 |
| --- | --- | --- | --- |
| **3.x（推荐）** | Tauri 2 + Vue 3 + Vite + Node sidecar | [`apps/`](apps/) | 可用 / 持续完善 |
| **2.x** | Electron 1.8 + AngularJS 1.5 | [`legacy/`](legacy/) | 已发布定制包 |

## 界面预览（3.x）

### 列表浏览

![列表页](img/列表页.png)

### 功能设置

![功能设置](img/功能设置.png)

### 多 AccessKey 支持

![多key支持](img/多key支持.png)

![多Key支持2](img/多Key支持2.png)

### 收藏管理

![收藏管理](img/收藏管理.png)

### 获取访问链接 / 二维码

![获取二维码或者访问链接](img/获取二维码或者访问链接.png)

### 图片预览

![图片预览](img/图片预览.png)

### 视频预览

![视频预览](img/视频预览.png)

### 音频预览（频谱）

![音频预览](img/音频预览.png)

## 3.x 快速开发

### 环境

- Node.js 20+
- Rust stable（[rustup](https://rustup.rs/)）
- Windows：WebView2、MSVC Build Tools

### 安装与启动

```bash
# sidecar（OSS API + 传输）
npm --prefix apps/transfer-sidecar install
npm run sidecar

# 另开终端：仅前端（浏览器调试）
npm --prefix apps/desktop install
npm run desktop:ui

# 或启动完整桌面壳
npm run desktop:dev
```

默认 sidecar：`http://127.0.0.1:17823`，开发 token：`dev-token`。

### 打包

```bash
npm run desktop:build
```

产物在 `apps/desktop/src-tauri/target/release/bundle/`。  
打包前会将 `transfer-sidecar`（含依赖）复制到 Tauri resources；安装包运行仍需本机 **Node.js 20+**。  
CI 工作流：[`.github/workflows/build-desktop-v3.yml`](.github/workflows/build-desktop-v3.yml)

## 2.x（legacy）

```bash
cd legacy
npm install
# 按 legacy/README.md 与原 gulp/electron 流程构建
```

已发布安装包见 [Releases · v2.0.0](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases/tag/v2.0.0)。

## 架构（3.x）

- **Vue 3**：登录、Bucket/对象浏览、传输坞、设置
- **Tauri 2**：窗口、文件对话框、会话安全存储、拉起 sidecar
- **transfer-sidecar**：Fastify + `ali-oss`，负责登录校验、列举、CRUD、分片上传下载与 SSE 进度

数据目录：`~/.hyh-oss-browser/`（设置、sidecar 元信息、传输状态、窗口位置）。

## 合规与贡献

- 请完整保留 [LICENSE](LICENSE)、[NOTICE](NOTICE) 及上游版权声明
- 向官方上游贡献请前往 [aliyun/oss-browser](https://github.com/aliyun/oss-browser)
- 欢迎对本仓库提 Issue / PR；请勿提交真实 AccessKey 或密钥材料

## License

[Apache License 2.0](LICENSE)

Copyright 2016 Aliyun.com（上游原作）  
Copyright 2026 HyhBlazing（本仓库修改与 3.x 重写部分）
