# PlanarGS 项目专属本地环境

已补齐依赖、CUDA 扩展、权重，并通过真实画面推理检查。网页通过项目根目录 `planargs.local.json` 对接 WSL。完整说明见 [09-PlanarGS本地部署与视频重建](../../09-PlanarGS本地部署与视频重建.md)。

## 验证结果（2026-10-31）

- Python 3.10 / torch 2.7.1+cu128 / RTX 5070 Ti；CUDA 前向、反向、KNN、PyTorch3D KNN、平面光栅化前向反向均通过。
- DUSt3R、GroundingDINO、SAM 使用用户视频真实抽帧，离线推理通过；检测到门、窗、墙、地面。这不是识别准确率评估。
- 检查约 16 秒，PyTorch 分配器显存峰值约 5798 MiB，不代表完整训练的显存需求。
- DUSt3R / DINO / BERT 已与发布者 SHA256 比对。源码、权重、编译和检查记录见主部署文档。
- 整段视频没有重建成功：80 帧中最大片段只注册 24 帧，共 4 个片段。未通过 70% 连通覆盖门槛，因此没有继续训练假完整房间。

## 环境和检查

项目代码在当前目录，PlanarGS 源码在同级 `PlanarGS`。项目专属环境为 Ubuntu `/home/ting/planargs-runtime/env`，权重在 `checkpoints`，构建日志在 `logs`。没有安装到系统 Python。

Windows 项目目录执行 `node scripts/planargs/check-runtime.cjs`；`npm start` 启动网页。接口 `GET /api/reconstruction/runtime` 返回真实状态。换电脑需调整 `planargs.local.json`，模板为 `planargs.local.example.json`。

## WSL 复跑命令

在 Ubuntu 中执行；输出目录必须是新目录，防止覆盖已有结果。

```bash
APP='/mnt/e/Studio/79【分享类】室内改造skill/Interior-renovation'
REPO='/mnt/e/Studio/79【分享类】室内改造skill/PlanarGS'
RUNTIME=/home/ting/planargs-runtime
PY="$RUNTIME/env/bin/python"
CKPT="$RUNTIME/checkpoints"

bash "$APP/scripts/planargs/launch.sh" "$APP/scripts/planargs/preflight.py" \
  --repo "$REPO" --checkpoints "$CKPT" --output "$APP/.cache/planargs-setup/preflight.json"

bash "$APP/scripts/planargs/launch.sh" "$APP/scripts/planargs/prepare_video.py" \
  --video '/mnt/e/path/to/room.mp4' --output "$APP/.cache/my-video-01" --frames 80 --max-size 960

# 仅在相机恢复通过后执行。默认 1000 次只检查兼容性。
bash "$APP/scripts/planargs/launch.sh" "$APP/scripts/planargs/run_trial.py" \
  --repo "$REPO" --scene "$APP/.cache/my-video-01/scene" \
  --output "$APP/.cache/my-video-01/smoke" --checkpoints "$CKPT"
# 完整训练换一个输出目录，加 --full：30000 次并导出网格。
```

`launch.sh` 设置专属 Python、动态库、本地 BERT、4 个 OMP 线程及离线模式。直接运行上游脚本时必须自行配置这些变量。

## 依赖维护

本机已有 CUDA nvcc 12.8、GCC/G++ 13、CMake、Ninja、FFmpeg。Blackwell 编译目标为 `TORCH_CUDA_ARCH_LIST=12.0`，不要用上游旧 CUDA 11.8 命令覆盖，也不要混用根目录旧 Windows reconstruction requirements。

工具链精确锁文件为 `environment-linux64.lock.txt`。新建环境时，在 Ubuntu 安装 micromamba 后执行 `micromamba create -y -p /home/ting/planargs-runtime/env -f "$APP/scripts/planargs/environment-linux64.lock.txt"`，再执行下列 pip 与源码步骤；已有环境不要重复创建。锁文件是 Linux 专用，不能在 Windows conda 中使用。

在专属 Python 3.10 + CUDA 12.8 环境内：

```bash
"$PY" -m pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cu128
"$PY" -m pip install -r "$APP/scripts/planargs/requirements-trial.txt"
# PyPI 不通可添加 --index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 仅源码缺失时下载，已修改源码会受到保护。
"$PY" "$APP/scripts/planargs/download_groundedsam.py" --output "$REPO/submodules/groundedsam"
bash "$APP/scripts/planargs/build_extensions.sh"

# 权重到位后校验发布者 SHA256，并补齐配置和分词器。
"$PY" "$APP/scripts/planargs/finalize_weights.py" --checkpoints "$CKPT"

bash "$APP/scripts/planargs/launch.sh" "$APP/scripts/planargs/model_smoke.py" \
  --repo "$REPO" --checkpoints "$CKPT" --image '/mnt/e/path/to/frame.jpg' \
  --output "$APP/.cache/planargs-setup/model-smoke.json"
```

安装顺序：环境和 torch → Python 依赖 → 固定版本源码 → 兼容补丁和 CUDA 编译 → 权重下载与校验 → 模型推理检查 → preflight。更换 torch 或权重后重跑模型检查，记录绑定权重大小、修改时间和 torch 版本。

兼容补丁统一保存在 `apply_compatibility.py`，构建脚本会重复安全应用。可选 RoPE2D CUDA 扩展未单独编译，采用上游 PyTorch 实现，已通过 GPU 推理检查；速度提示不是必需依赖缺失。

`download_weights.py URL TARGET --sha256 HASH` 支持验证 HTTP 范围的分段续传。来源和哈希见 `finalize_weights.py` 和主部署文档；SAM 为官方 `sam_vit_h_4b8939.pth`。未完成的 `.part` / `.chunks` 留作续传，不会加载。

输入、COLMAP 数据、Gaussian PLY、网格及逐阶段日志保留在 `单视频流程/网页任务/<任务ID>/`。有有效 COLMAP 点时先导出 `project/preparation/sparse-preview.json` 和每片段的 `fragment-*.ply`。覆盖不足（最大连通片段少于 15 帧或低于 70%）以 `partial` 返回局部预览，跳过完整训练；网页可切换片段，不将它们直接叠加。完整训练成功后优先展示实际网格采样。仍需用户勾绘并实测校准，单目任意尺度不能直接当作米。此次尚无整段用户视频训练成功记录。

旧版因覆盖率检查失败但已保存 COLMAP 数据的任务，可运行 `launch.sh export_sparse.py --recover-project <任务的project目录>`（脚本使用绝对路径）。恢复工具只允许已停止的覆盖率失败任务，保留原诊断，不覆盖已有项目清单。网页点击“查看上次点云”即可载入最近一次可预览任务。

来源：[PlanarGS](https://github.com/SJTU-ViSYS-team/PlanarGS)、[GroundedSAM](https://github.com/IDEA-Research/Grounded-Segment-Anything)。主仓库 MIT 不覆盖全部依赖；DUSt3R 和部分高斯代码含非商业研究限制。
