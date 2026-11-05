# PlanarGS 本地部署与视频重建

## 这次修复的是什么

网页原来只检查 `Interior-renovation/.venv/Scripts/python.exe`，而 PlanarGS 使用的是另一套 WSL Linux 环境。此前只有 Python、PyTorch 和部分权重，分割源码及 CUDA 扩展没有安装完成。因此“网页能打开”并不代表视频重建环境可用。

现在本地视频入口通过项目内的 `planargs.local.json` 选择 WSL PlanarGS，提交前执行真实环境检查；缺少依赖、权重或模型推理验证时会列出缺项，不再仅凭 Windows `.venv` 是否存在判断。KIRI 云重建仍是独立流程，需要用户勾选并配置密钥，也仍需要其 Windows Python 依赖。

## 文件与环境位置

| 内容 | 位置 |
| --- | --- |
| 网页和部署脚本 | `E:\Studio\79【分享类】室内改造skill\Interior-renovation` |
| 固定版本 PlanarGS 源码 | 同级 `PlanarGS` 子文件夹 |
| 本机配置 | 项目根目录 `planargs.local.json`，模板为 `planargs.local.example.json` |
| 项目专用 Linux 环境 | Ubuntu：`/home/ting/planargs-runtime/env` |
| 模型权重、编译日志 | `/home/ting/planargs-runtime/checkpoints`、`logs` |
| Windows 查看 Linux 文件 | `\\wsl.localhost\Ubuntu\home\ting\planargs-runtime` |
| 环境和模型验证报告 | 项目 `.cache/planargs-setup/` |
| 网页上传及重建结果 | 项目 `单视频流程/网页任务/<任务ID>/` |

环境属于本项目，未安装到系统 Python。CUDA 编译和 Linux 二进制运行在 WSL 文件系统；项目代码、配置和任务结果留在这个项目文件夹里。不要把 Linux 环境复制到 Windows `.venv`，也不要用 Windows Python 安装这些 CUDA 扩展。删除项目文件夹不会自动删除 WSL 中的大型环境与权重。

## 已安装组合

本机检查已通过：`preflight.json` 的 `ready`、`model_loading_verified` 均为 `true`。真实画面模型推理及光栅化/PyTorch3D CUDA 反向验证通过。`reconstruction_verified` 仍为 `false`，因为整段用户视频尚未通过下文的相机覆盖检查。

- Windows + WSL2 Ubuntu，RTX 5070 Ti，约 16GB 显存。
- Python 3.10.22、PyTorch 2.7.1+cu128、torchvision 0.22.1+cu128、CUDA nvcc 12.8、GCC 13。
- pycolmap 3.12.6、Open3D 0.19.0、OpenCV 4.10、NumPy 1.26.4、Transformers 4.44.2。
- 针对 `sm_120` 本机编译 simple-knn、diff-plane-rasterization、PyTorch3D、GroundingDINO，并安装 SAM。
- DUSt3R 使用作者发布的 safetensors 权重；GroundingDINO、SAM、BERT 和分词器均使用本地文件。运行入口关闭 Hugging Face 在线查询，不会在上传视频后临时下载模型。

PlanarGS 固定版本为 `a68f22043e95146c4f1c52cc0e471a6a90e86f73`；GroundedSAM 固定版本为 `126abe633ffe333e16e4a0a4e946bc1003caf757`。两处 `LOCAL_SOURCE.json` 记录源码来源。安装过程中针对新版工具链补了标准头文件、GroundingDINO scalar_type 调用、DUSt3R safetensors 共享权重加载和本地 BERT 路径；这些改动集中保存在 `scripts/planargs/apply_compatibility.py`，可以重复应用。

## 怎么启动和检查

在项目文件夹运行：

```powershell
node scripts/planargs/check-runtime.cjs
npm start
```

打开 `http://127.0.0.1:8765/`，进入空间重建，选视频，不勾选云重建。接口 `GET /api/reconstruction/runtime` 可查看当前检查结果。

`ready: true` 表示依赖、GPU 算子、权重文件和真实模型推理验证已通过，**不保证任意视频都能重建成功**。网页默认执行 30,000 次训练并导出网格，耗时取决于视频和可用显存；同一时刻只接受一个本地 PlanarGS 任务。

完整流程为：抽帧 → CPU COLMAP 恢复相机并去畸变 → DUSt3R 几何先验 → GroundingDINO/SAM 平面先验 → PlanarGS 训练 → 网格导出 → 网页扫描参考。网页中的扫描参考需要用户勾绘和实测校准，不会把扫描点自动冒充精确的墙、门、窗参数。

## 现有视频实测

测试输入是本文件夹上级的 `video.mp4`，约 35.4 秒、540×960。记录位于 `.cache/planargs-video-20261031-v2/preparation.json`。

80 帧抽取、特征提取和匹配已实际执行。COLMAP 得到 4 个片段，最大片段仅注册 24/80 帧，约 1009 个稀疏点，平均重投影误差约 0.654 像素。**整段视频尚未通过连通覆盖检查，因此没有将其报告为完整房间重建成功，也没有继续以碎片训练一个假完整房间。**

网页接口也已使用同一视频实测：任务 `335fb342-db99-47b8-a3be-6ffad528e121` 正常从 Windows 启动 WSL，抽帧与 COLMAP 后返回最大片段 20/80 帧（25%），没有误报“环境未安装”或“重建成功”。多线程相机求解存在波动，两次均不达覆盖要求。该任务原视频、诊断和 `worker.log` 保留在任务目录中。

完整 PlanarGS 训练要求一个连通模型覆盖至少 70% 抽取帧，且至少 15 帧。**这个门槛只控制是否继续完整训练，不再阻止展示已经算出的稀疏点云。** 存在有效 COLMAP 点时，先导出各片段；覆盖不足返回 `partial`，网页任务进入 `review`，明确显示局部结果和暂停完整重建的原因。没有相机模型或有效点才报告点云生成失败。

网页“查看上次点云”可恢复最近一次已有点云的任务，不必重新上传。下拉框切换独立片段；未对齐片段不合并显示，也不显示米制网格或虚构拟合平面。任意尺度点云按自身边界自动适配视角。完整训练成功后仍优先展示网格采样结果。

用户任务 `861b0d1a-daf8-4305-8a52-689b8c59a970` 已从保留的二进制 COLMAP 数据恢复：三个片段分别为 24 帧 / 747 点、19 帧 / 759 点、3 帧 / 229 点。片段之间可能使用重复帧，点数不能作为同一个完整房间的点数相加。最大相机片段涉及约 0–6.2 秒、17.9–20.1 秒、29.9–30.8 秒，第二片段主要涉及约 9.8–14.3 秒、22.3–25.5 秒。相机解未把这些片段连成同一个模型；“24/80”不是只成功解码了 24 帧。检查到未注册画面含低纹理墙面、反光电梯门；这些是匹配困难的可能因素，不能仅凭覆盖率断定唯一原因。

恢复结果位于任务的 `project/preparation/sparse-preview.json`，完整有限坐标点分别保存在 `fragment-0.ply`、`fragment-1.ply`、`fragment-2.ply`。原 `preparation.json` 失败诊断保留，`project.json` 记录恢复来源、`status: partial`、`training_started: false`。后续新任务直接输出局部预览，无需手动恢复。

最大相机片段还存在极远的退化三角化点：Z 坐标中位数约 11，最大约 910 万（均为任意单位），低重投影误差并不保证三维深度可靠。预览使用点坐标中位数及中位距离聚焦主体，避免极远点把正常点挤成一个像素；不删除原始点，PLY 保留完整有限坐标集合。预览同时隐藏示意地面，避免遮挡尚未对齐的扫描。

环境就绪和视频质量是两项独立检查。重新拍摄时缓慢移动并保留连续重叠视角，包含实际平移，避免只站在原地旋转；白墙、反光、模糊和跨门进出都可能造成断片。单目重建单位是任意尺度，必须用已知墙长校准，层高也应实测。

## 重装、升级和排错

如果目标是尽快获得可摆家具的编辑空间，可先使用 [视频辅助建房试用](10-视频辅助建房试用.md)。它使用视频帧与人工墙面标注建立门窗构件，不要求点云连通，也不依赖完整 PlanarGS 训练完成。

详细命令见 [部署脚本说明](scripts/planargs/README.md)。Python 包清单为 `scripts/planargs/requirements-trial.txt`。不要混用根目录旧的 Windows reconstruction requirements；它与本地 PlanarGS 使用不同 COLMAP/NumPy 版本。

工具链精确版本及下载哈希保存在 `scripts/planargs/environment-linux64.lock.txt`。最终 `pip check` 通过，没有未满足的包依赖；GroundingDINO 的 OpenCV 依赖已统一为无界面版本，避免重复安装两个提供 cv2 的包。

- `preflight.json`：模块、GPU、KNN、权重以及模型验证记录。`server-preflight.json` 是网页启动检查的结果。
- `model-smoke.json`：真实画面的 DUSt3R、GroundingDINO、SAM 推理，以及 CUDA KNN/光栅化相关验证。检查记录与权重大小、修改时间及 torch 版本关联；更换权重或 torch 后必须重跑。
- WSL `checkpoints/verified-weights.json`：DUSt3R、DINO、BERT 与发布者 SHA256 的比对结果。
- WSL `logs/build-*.log`：每个 CUDA 扩展的构建日志。
- 任务 `worker.log`、`project/preparation/preparation.json`、`project/reconstruction/*.log` 和 `trial.json`：具体视频失败的阶段与原因。

原始视频只在本机处理。本地 PlanarGS 不需要 API Key；首次安装要下载开源权重。重启网页服务会中断正在运行的任务，输入和中间文件保留；命令行试跑必须使用新输出目录，防止覆盖已有结果。

## 来源

- [PlanarGS 官方仓库](https://github.com/SJTU-ViSYS-team/PlanarGS)
- [GroundedSAM 官方仓库](https://github.com/IDEA-Research/Grounded-Segment-Anything)
- [NAVER DUSt3R 权重与 SHA256](https://huggingface.co/naver/DUSt3R_ViTLarge_BaseDecoder_512_dpt/blob/main/model.safetensors)
- [GroundingDINO 作者权重与 SHA256](https://huggingface.co/ShilongLiu/GroundingDINO/blob/main/groundingdino_swint_ogc.pth)
- [BERT 权重与 SHA256](https://huggingface.co/google-bert/bert-base-uncased/blob/main/model.safetensors)

网络不可达时安装脚本可从镜像下载，再核对发布者哈希；不把镜像来源视作校验替代品。上游主仓库与各依赖许可分别适用，DUSt3R/高斯相关依赖含非商业研究限制。
