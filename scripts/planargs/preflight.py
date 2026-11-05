"""Report the real CUDA/runtime readiness, without claiming a reconstruction succeeded."""
import argparse
import importlib
import json
import platform
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--checkpoints', type=Path)
    args = parser.parse_args()
    report = {'python': sys.version, 'platform': platform.platform(), 'checks': {}, 'ready': False,
              'model_loading_verified': False, 'reconstruction_verified': False}
    repo = args.repo.resolve()
    sys.path.insert(0, str(repo))
    for name in ['torch', 'torchvision', 'pycolmap', 'open3d', 'cv2', 'simple_knn._C',
                 'diff_plane_rasterization', 'pytorch3d.ops', 'groundingdino._C', 'segment_anything']:
        try:
            module = importlib.import_module(name)
            report['checks'][name] = {'ok': True, 'version': str(getattr(module, '__version__', 'compiled/module'))}
        except Exception as error:
            report['checks'][name] = {'ok': False, 'error': str(error)}
    if report['checks']['torch']['ok']:
        import torch
        report['torch_cuda'] = torch.version.cuda
        report['gpu_available'] = torch.cuda.is_available()
        if torch.cuda.is_available():
            report['gpu'] = torch.cuda.get_device_name()
            report['vram_gib'] = round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)
            report['compute_capability'] = torch.cuda.get_device_capability()
            try:
                x = torch.randn(512, 512, device='cuda', requires_grad=True)
                (x @ x.T).square().mean().backward()
                torch.cuda.synchronize()
                assert torch.isfinite(x.grad).all()
                report['checks']['cuda_forward_backward'] = {'ok': True}
            except Exception as error:
                report['checks']['cuda_forward_backward'] = {'ok': False, 'error': str(error)}
            if report['checks']['simple_knn._C']['ok']:
                try:
                    from simple_knn._C import distCUDA2
                    distance = distCUDA2(torch.rand(2048, 3, device='cuda'))
                    torch.cuda.synchronize()
                    assert torch.isfinite(distance).all() and (distance >= 0).all()
                    report['checks']['knn_cuda_kernel'] = {'ok': True}
                except Exception as error:
                    report['checks']['knn_cuda_kernel'] = {'ok': False, 'error': str(error)}
    for filename in ['dust3r-hf/model.safetensors', 'groundingdino_swint_ogc.pth', 'sam_vit_h_4b8939.pth', 'bert-base-uncased/model.safetensors']:
        file = (args.checkpoints or repo / 'ckpt') / filename
        report['checks']['checkpoint:' + filename] = {'ok': file.is_file() and file.stat().st_size > 100_000_000, 'bytes': file.stat().st_size if file.is_file() else 0}
    for filename in ['dust3r-hf/config.json', 'bert-base-uncased/config.json', 'bert-base-uncased/vocab.txt']:
        report['checks']['config:' + filename] = {'ok': ((args.checkpoints or repo / 'ckpt') / filename).is_file()}
    model_report = Path(__file__).resolve().parents[2] / '.cache/planargs-setup/model-smoke.json'
    try:
        verification = json.loads(model_report.read_text(encoding='utf-8'))
        files = verification['checkpoint_files']
        verified = verification.get('ready') is True and len(files) == 4 and all(
            (p := (args.checkpoints or repo / 'ckpt') / name).is_file() and
            p.stat().st_size == info['bytes'] and p.stat().st_mtime_ns == info['mtime_ns']
            for name, info in files.items())
        verified = verified and verification['torch_version'] == report['checks']['torch']['version']
    except (OSError, KeyError, ValueError):
        verified = False
    report['model_loading_verified'] = verified
    report['checks']['verified_model_inference'] = {'ok': verified}
    report['ready'] = report.get('gpu_available', False) and all(c['ok'] for c in report['checks'].values())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['ready'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
