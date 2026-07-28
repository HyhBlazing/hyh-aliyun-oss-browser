# hyh-aliyun-oss-browser

[![Release](https://img.shields.io/github/v/release/HyhBlazing/hyh-aliyun-oss-browser)](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases)
[![License](https://img.shields.io/github/license/HyhBlazing/hyh-aliyun-oss-browser)](LICENSE)

基于阿里云开源项目 [aliyun/oss-browser](https://github.com/aliyun/oss-browser) 的 **非官方 3.x 桌面客户端**（Tauri 2 + Vue 3）。

> **重要声明（请先阅读）**  
> - 本仓库 **不是** 阿里云 / 阿里云 OSS 官方产品，与阿里云无隶属或背书关系。  
> - 上游原作为 [aliyun/oss-browser](https://github.com/aliyun/oss-browser)，版权归原作者 **Aliyun.com**（Apache License 2.0）。  
> - 本仓库为在上游理念与兼容需求上的 **3.x 重写与定制**；修改部分版权见 [NOTICE](NOTICE)。  
> - 「阿里云」「Alibaba Cloud」「OSS」等为相应权利人商标，仅用于说明兼容性与来源。  
> - 请遵守当地法律法规与云服务商协议；请勿提交或泄露真实 AccessKey。

## 下载

请从 [Releases](https://github.com/HyhBlazing/hyh-aliyun-oss-browser/releases) 获取最新 **3.x** 安装包：

| 平台 | 说明 |
| --- | --- |
| Windows x64 | NSIS `.exe` / `.msi` |
| macOS | **Apple Silicon（M 芯片，aarch64）** |
| Linux | deb / AppImage 等（以 Release 附件为准） |

安装包已内置传输服务（sidecar），**安装后可直接运行，无需再安装 Node.js**。

## 界面预览

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

## 功能一览（3.x）

### 登录与账号

- AccessKey 登录（AccessKeyId / AccessKeySecret，可选备注）
- Auth Token（Base64）登录：解析展示账号、OSS 路径、权限与过期时间
- 记住秘钥、保持登录（二者独立；仅「保持登录」会静默恢复会话）
- 多 AccessKey 历史：查看、选用、备注、删除、清空；支持多账号切换
- STS / 受限路径登录；只读权限下禁用写入操作
- 桌面版自动拉起传输服务；异常时在登录页提示

### 浏览与导航

- Bucket / 对象列表（名称、大小、存储类型、修改时间等）
- `oss://` 地址栏跳转；前进 / 后退 / 上级 / 首页 / 刷新
- 快捷键：地址栏聚焦、导航、刷新等
- 当前目录搜索、列排序、多选、右键菜单
- 分页「加载更多」；归档等存储类型区分展示
- 收藏夹（按账号隔离）：收藏当前目录 / 跳转 / 移除

### 上传、下载与传输

- 上传文件、上传文件夹；桌面端支持拖入上传
- 下载所选（文件 / 文件夹递归）；下载目录「每次询问」或「固定目录」
- 桌面端支持拖拽对象到本地资源管理器
- 传输坞：上传 / 下载 / 移动·复制 三类任务
- 进度、速度、状态筛选、搜索；启动 / 暂停 / 清空；面板高度可调并记忆
- 同名覆盖策略、分片上传下载、重试与并发可配置
- 关闭窗口时可选择最小化到托盘以继续传输

### 地址与二维码

- 单个对象获取地址：公开直链 / 私有签名（有效期、重新生成）
- 域名选择（默认、自定义、传输加速）；复制地址、浏览器打开、复制加速链接
- 二维码展示、复制图片、下载 PNG
- 批量获取地址：目录自动展开；复制全部地址或「路径 + 地址」

### 预览

- 图片预览（同目录浏览）；可选列表缩略图
- 文本预览（常见文本类型；过大文件提示下载）
- 视频内嵌播放（倍速）
- 音频内嵌播放 + 频谱可视化
- 其他类型：浏览器打开 / 复制地址

### Bucket / 对象操作

- 新建 / 删除 Bucket；Bucket ACL
- 新建文件夹、重命名、删除
- 剪切（移动）/ 复制 + 粘贴（后台队列）
- 对象 ACL、HTTP 头与用户元数据
- 归档对象解冻（可设可读天数）
- 创建软链接
- 未完成分片上传管理（列出 / 刷新 / 中止删除）

### 设置与窗口

- 主窗口关闭策略：最小化到托盘 / 退出 / 每次询问
- 默认下载目录、图片缩略图开关
- 上传下载并发、分片大小、重试、列举上限、覆盖同名
- 网络代理（HTTP/HTTPS/SOCKS5，仅作用于 OSS）、超时、私有云不安全 TLS（可选）
- 窗口最小尺寸 1024×640；位置 / 尺寸 / 最大化记忆
- 系统托盘：显示主窗口 / 退出

## 架构

| 部分 | 技术 | 职责 |
| --- | --- | --- |
| 桌面壳 | Tauri 2 | 窗口、托盘、文件对话框、安全会话、拉起 sidecar |
| 界面 | Vue 3 + Vite + Arco Design | 登录、浏览、传输坞、设置、预览 |
| 传输服务 | Node Fastify + `ali-oss`（打包为独立二进制） | 登录校验、列举、CRUD、分片传输与进度 |

数据目录：`~/.hyh-oss-browser/`（设置、sidecar 元信息、传输状态、窗口位置等）。

## 开发

### 环境

- Node.js 20+
- Rust stable（[rustup](https://rustup.rs/)）
- Windows：WebView2、MSVC Build Tools

### 启动

```bash
# 完整桌面开发（会自动拉起 sidecar）
npm --prefix apps/transfer-sidecar install
npm --prefix apps/desktop install
npm run desktop:dev

# 可选：仅浏览器调试 UI
npm run desktop:ui

# 可选：单独启动 sidecar
npm run sidecar
```

默认 sidecar：`http://127.0.0.1:17823`，开发 token：`dev-token`。

### 打包

```bash
npm run desktop:build
```

产物目录：`apps/desktop/src-tauri/target/release/bundle/`。  
打包前执行 `scripts/pack-sidecar.cjs`，将 sidecar 打成独立可执行文件并随安装包分发。  
CI：[`.github/workflows/build-desktop-v3.yml`](.github/workflows/build-desktop-v3.yml)

## 合规与贡献

- 请完整保留 [LICENSE](LICENSE)、[NOTICE](NOTICE) 及上游版权声明
- 向官方上游贡献请前往 [aliyun/oss-browser](https://github.com/aliyun/oss-browser)
- 欢迎对本仓库提 Issue / PR；请勿提交真实 AccessKey 或密钥材料

## License

[Apache License 2.0](LICENSE)

Copyright 2016 Aliyun.com（上游原作）  
Copyright 2026 HyhBlazing（本仓库修改与 3.x 重写部分）
