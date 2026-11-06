# Poly Lab 空间设计工作台

Poly Lab 在本机运行。可以手绘户型，也可以让视觉模型根据视频关键帧建立可编辑的房间。家具可以从仓库摆入场景，也可以通过照片生成或从 GLB 导入。完成布置后，可以保存方案、导出三维模型或生成效果图。

新仓库预置三件家具：MICKE 米克书桌、PS 2026 折叠椅、RÅSHULT 拉舍推车。示例价格是录入时的参考价。

## 本地启动

安装 Node.js **24.12 或更新版本**，使用支持 WebGL 的现代浏览器。在项目目录运行：

```sh
npm ci
npm run build:studio
npm start
```

浏览器访问 [本地工作台](http://127.0.0.1:8765/)。Windows 完成首次构建后，也可以双击 `启动工作台.cmd`。手动画房、摆放家具和导入 GLB 可直接使用。使用 AI 功能时，从首页「配置服务」填写相应的 API 凭据。

安装、建房、家具录入、混元排障、效果图及备份步骤见 [使用手册](docs/使用手册.md)。

## 开发验证

```sh
npm run build:studio
npm run test:studio
npm run test:workflow
npm run test:geometry
npm run test:furniture
```

应用入口位于 `scripts/studio/`，共享的参数化几何位于 `scripts/`，公开示例位于 `examples/`。构建生成的 `打开家具布置.html` 和运行缓存都在本地生成。密钥保存在 `.env.local`，项目和资产保存在当前浏览器的本地数据库。

[MIT 许可证](LICENSE) · [第三方材料说明](THIRD_PARTY_NOTICES.md)
