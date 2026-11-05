#!/usr/bin/env bash
# Run only inside the dedicated WSL runtime; never install into system Python.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO="${PLANARGS_REPO:-$(dirname "$APP")/PlanarGS}"
RUNTIME="${PLANARGS_RUNTIME:-/home/ting/planargs-runtime}"
export PATH="$RUNTIME/env/bin:/usr/bin:/bin"
export CONDA_PREFIX="$RUNTIME/env"
export CUDA_HOME="$CONDA_PREFIX"
export CC="$CONDA_PREFIX/bin/x86_64-conda-linux-gnu-gcc"
export CXX="$CONDA_PREFIX/bin/x86_64-conda-linux-gnu-g++"
export TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST:-12.0}"
export MAX_JOBS="${MAX_JOBS:-4}"
export FORCE_CUDA=1
export CUB_HOME="$CONDA_PREFIX/targets/x86_64-linux/include"
for headers in "$CONDA_PREFIX"/lib/python3.10/site-packages/nvidia/*/include; do
  export CPATH="$headers:${CPATH:-}"
done
export CPATH="$CONDA_PREFIX/targets/x86_64-linux/include:$CPATH"
mkdir -p "$RUNTIME/logs"
python "$APP/scripts/planargs/apply_compatibility.py" --repo "$REPO"
for component in simple-knn diff-plane-rasterization pytorch3d groundedsam/segment_anything groundedsam/GroundingDINO; do
  echo "Building $component for CUDA $TORCH_CUDA_ARCH_LIST"
  name="${component//\//-}"
  python -m pip install --no-build-isolation --no-deps "$REPO/submodules/$component" > "$RUNTIME/logs/build-$name.log" 2>&1 || {
    tail -60 "$RUNTIME/logs/build-$name.log"
    exit 1
  }
done
echo 'Extensions installed. Run model_smoke.py and preflight.py to verify readiness.'
