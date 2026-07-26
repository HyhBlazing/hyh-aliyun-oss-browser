# Electron 2.x 定制版（legacy）

本目录为原 Electron + AngularJS 实现，对应已发布的 **v2.0.0** 定制包。

## 运行

```bash
cd legacy
npm install
# 需要 gulp 构建到 dist 后，再 electron 启动
npx gulp build --custom=./custom
npx cross-env NODE_ENV=development electron .
```

更完整说明见仓库根目录 README 的「2.x」章节。

3.x 重写版在 `../apps/`（Tauri 2 + Vue 3）。
