# Interior-renovation
This platform utilizes multiple AI algorithms to facilitate interior design. It includes features such as 3D space reconstruction, automated design suggestions, and AI-powered rendering, all aimed at helping users predict the costs associated with their design decisions

一个本地运行的室内轻改造工作台。当前原型把「空间复刻 → 家具摆放 → AI 设计与渲染」串成可编辑、可保存的流程。

## 当前功能

- Three.js / WebGL 2 三维视图，支持透视、正交平面和人视漫游。
- 家具选择、移动、旋转、缩放、锁轴、吸附、测距、复制、撤销及重做。
- 11 件带商品参考图、尺寸、人民币参考价、查询时间和官网链接的宜家家具。
- 平面图隐藏顶装家具；文字模式显示家具名称。
- 视频上传和后台重建，展示扫描点与几何平面分组，核对净尺寸、门窗和已有家具。
- Tripo 图片重建家具，以及独立 GLB 导入与实测尺寸归一化。
- 对话模型生成可审查的家具操作提案，确认后作为一条可撤销操作应用。
- 捕获当前视角，通过参考图编辑接口生成效果图；JSON / GLB / PNG 导出。

这是功能验证原型。样例房间为 4 × 1.8 × 3 米。完整物体语义分割、扫描与矢量房间可靠配准、任意视频自动恢复准确门窗和家具尺寸仍未完成。宜家模型是简化参数模型，部分灯具外包络需要再次确认。

## 快速启动

需要 Node.js 24，以及支持 WebGL 2 的现代浏览器。首次检出后先安装依赖并构建：

```sh
npm ci
npm run build:studio
npm start
```

打开 <http://127.0.0.1:8765>。Windows 下安装和构建完成后，也可双击 `启动工作台.cmd`。

构建生成的 `打开家具布置.html` 等入口可离线编辑。上传、Tripo、AI 对话和渲染通过本机服务调用；云功能不支持直接在 `file://` 页面使用。离线页面与服务页面的浏览器草稿相互独立，可通过导出 / 导入 JSON 迁移。

## 配置模型服务

复制 `.env.example` 为 `.env.local`，或使用页面中的「AI 设计与渲染 → 模型与 API 设置」。

| 功能 | 环境变量 | 接口要求 |
| --- | --- | --- |
| KIRI 空间重建 | `KIRI_API_KEY` | 勾选云重建并点击提交才调用 |
| Tripo 家具重建 | `TRIPO_API_KEY`、`TRIPO_MODEL` | 官方 v3 文件、生成和任务接口 |
| AI 对话设计 | `CHAT_API_BASE`、`CHAT_MODEL`、`CHAT_API_KEY` | Chat Completions，支持 JSON 输出 |
| AI 图像渲染 | `IMAGE_API_BASE`、`IMAGE_MODEL`、`IMAGE_API_KEY` | Images Edits，支持 multipart 参考图片输入 |

API Base 填到版本路径，例如服务商要求的 `/v1`；代码会追加 `/chat/completions` 或 `/images/edits`。使用账户实际可用的模型 ID。专有异步图像接口需要另加适配器。密钥只保存于本机，网页不会回读明文密钥。API 调用可能消耗各服务商额度，仓库不包含额度或凭据。

## 视频重建环境

当前网页启动重建任务的 Python 路径按 Windows 项目环境设置。先创建虚拟环境，再安装依赖：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-reconstruction.txt
```

也可直接运行单视频流程：

```powershell
.\run-video-only.ps1 -Video 'D:\your-video.mp4' -Length 4 -Width 1.8 -Height 3
```

如需 KIRI 云重建，加 `-Cloud`。不加该选项不会提交云任务。局部 COLMAP 点云不天然具有真实尺度，尺寸需人工确认；几何平面分组不等于完整语义分割。

仓库保留代码与最小参数化房间样例，**不含真实办公室视频、额外照片、私有扫描采样、下载的云模型、任务结果和编译后的本地页面**。因此全新检出的示例可直接摆家具，但不会展示原办公室的扫描点。扫描显示逻辑使用合成平面夹具验证；导入自己的视频后才展示自己的重建结果。

## 验证与目录

```sh
npm run build:studio
npm run test:studio
npm run test:workflow
npm run test:geometry
```

这组检查覆盖状态、真实 Three.js 场景图、DOM 交互、导出、AI 提案及本机 HTTP 接口。外部服务请求采用模拟响应，不提交付费任务；不能替代实际账户联调或浏览器 GPU 视觉验收。GitHub Actions 也执行上述构建与检查。

- `scripts/studio/`：界面、场景、交互、构建和本地 API 服务。
- `scripts/*video*.py` 等：视频抽帧、局部 / 云重建、平面拟合和结果整理。
- `tests/`：自动检查；部分历史端到端检查需要自行生成的扫描结果。
- `单视频流程/试验01/`：用于当前工作台的最小参数化样例。
- `01-…md` 至 `08-…md`：原型阶段记录，部分内容提及未随仓库分发的本地采集结果；当前流程见 `08-空间复刻家具与AI流程.md`。

项目代码沿用仓库现有 MIT 许可证。宜家图片、品牌及其他第三方材料的权利归各自所有者，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
