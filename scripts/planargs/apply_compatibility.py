"""Idempotent compatibility patches for the pinned PlanarGS source on CUDA 12.8."""
import argparse
from pathlib import Path


def patch(path, before, after):
    text = path.read_text(encoding='utf-8')
    if after in text:
        return
    if before not in text:
        raise RuntimeError(f'Unexpected upstream source; inspect before patching: {path}')
    path.write_text(text.replace(before, after), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    root = parser.parse_args().repo
    patch(root / 'submodules/simple-knn/simple_knn.cu', '#define __CUDACC__', '#include <cfloat>\n#define __CUDACC__')
    patch(root / 'submodules/diff-plane-rasterization/cuda_rasterizer/rasterizer_impl.h', '#pragma once', '#pragma once\n#include <cstdint>')
    patch(root / 'submodules/groundedsam/GroundingDINO/groundingdino/models/GroundingDINO/csrc/MsDeformAttn/ms_deform_attn_cuda.cu',
          'AT_DISPATCH_FLOATING_TYPES(value.type(),', 'AT_DISPATCH_FLOATING_TYPES(value.scalar_type(),')
    patch(root / 'lp3/run_groundedsam.py', 'args.bert_base_uncased_path = None',
          "args.bert_base_uncased_path = os.environ.get('PLANARGS_BERT_PATH')")
    patch(root / 'submodules/groundedsam/GroundingDINO/requirements.txt', 'opencv-python\n', 'opencv-python-headless\n')
    before = 'def load_model(model_path, device, verbose=True):\n'
    after = before + '''    if str(model_path).endswith('.safetensors'):
        import json
        from safetensors.torch import load_model as load_safetensors_model
        with open(os.path.join(os.path.dirname(model_path), 'config.json')) as stream:
            config = json.load(stream)
        net = AsymmetricCroCo3DStereo(**config)
        load_safetensors_model(net, model_path, strict=True)
        return net.to(device)
'''
    patch(root / 'submodules/dust3r/dust3r/model.py', before, after)
    print('Pinned-source CUDA / local-weight compatibility patches applied.')


if __name__ == '__main__':
    main()
