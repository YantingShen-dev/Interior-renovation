#!/usr/bin/env bash
set -euo pipefail
RUNTIME="${PLANARGS_RUNTIME:-/home/ting/planargs-runtime}"
export PATH="$RUNTIME/env/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$RUNTIME/env/lib:${LD_LIBRARY_PATH:-}"
export MPLBACKEND=Agg
export OMP_NUM_THREADS=4
export PYTHONUNBUFFERED=1
export PLANARGS_BERT_PATH="$RUNTIME/checkpoints/bert-base-uncased"
export HF_HOME="$RUNTIME/cache/huggingface"
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
exec "$RUNTIME/env/bin/python" "$@"
