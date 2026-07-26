# HYH OSS Browser（定制版）

[![Release](https://img.shields.io/github/v/release/HyhBlazing/hyh-aliyun-oss-browser)](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases)
[![License](https://img.shields.io/github/license/HyhBlazing/hyh-aliyun-oss-browser)](LICENSE)

基于阿里云开源项目 [aliyun/oss-browser](https://github.com/aliyun/oss-browser) 的 **非官方定制客户端**。

> **重要声明**  
> 本项目不是阿里云官方产品。遵循 Apache License 2.0，详见 [LICENSE](LICENSE)、[NOTICE](NOTICE)。请妥善保管 AccessKey。

## 版本说明

| 系列 | 技术栈 | 目录 | 状态 |
| --- | --- | --- | --- |
| **3.x（推荐开发）** | Tauri 2 + Vue 3 + Vite + Node sidecar | [`apps/`](apps/) | 重写中 / MVP |
| **2.x** | Electron 1.8 + AngularJS 1.5 | [`legacy/`](legacy/) | 已发布定制包 |

![列表页](img/列表页.png)

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
CI 工作流：[`.github/workflows/build-desktop-v3.yml`](.github/workflows/build-desktop-v3.yml)

## 2.x（legacy）

```bash
cd legacy
npm install
# 按 legacy/README.md 与原 gulp/electron 流程构建
```

已发布安装包见 [Releases · v2.0.0](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases/tag/v2.0.0)。

## 界面预览（2.x）

### 设置

![设置功能](img/设置功能.png)

### 收藏管理

![收藏管理](img/收藏管理.png)

### 子用户

![子用户](img/子用户.png)

### 获取访问链接 / 二维码

![获取二维码或者访问链接](img/获取二维码或者访问链接.png)

### 图片预览

![图片预览](img/图片预览.png)

### 视频预览

![视频预览](img/视频预览.png)

## 架构（3.x）

- **Vue 3**：登录、Bucket/对象浏览、传输坞、设置
- **Tauri 2**：窗口、文件对话框、会话安全存储、拉起 sidecar
- **transfer-sidecar**：Fastify + `ali-oss`，负责登录校验、列举、CRUD、分片上传下载与 SSE 进度

数据目录：`~/.hyh-oss-browser/`（设置、sidecar 元信息、传输状态）。

## 合规与贡献

- 请保留 LICENSE / NOTICE
- 欢迎 Issue / PR；合入官方请前往 [aliyun/oss-browser](https://github.com/aliyun/oss-browser)
- 请勿提交真实 AccessKey

## License

[Apache License 2.0](LICENSE)

Copyright 2016 Aliyun.com  
Copyright 2026 HyhBlazing（本仓库修改部分）
