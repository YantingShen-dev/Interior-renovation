"""Load real model weights and run CUDA inference on a local frame."""
import argparse
import gc
import json
import os
from pathlib import Path
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--checkpoints', type=Path, required=True)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo, ckpt = args.repo.resolve(), args.checkpoints.resolve()
    os.chdir(repo)
    sys.path.insert(0, str(repo))
    sys.path.insert(0, str(repo / 'submodules/dust3r'))
    os.environ['PLANARGS_BERT_PATH'] = str(ckpt / 'bert-base-uncased')
    report = {'ready': False, 'model_loading_verified': False, 'inference_verified': False,
              'reconstruction_verified': False, 'checks': {}, 'image': str(args.image)}
    import torch
    import numpy as np
    from PIL import Image
    started = time.monotonic()
    try:
        from pytorch3d.ops import knn_points
        x = torch.rand(1, 64, 3, device='cuda', requires_grad=True)
        result = knn_points(x, x, K=3)
        result.dists.sum().backward()
        assert torch.isfinite(x.grad).all()
        report['checks']['pytorch3d_cuda_backward'] = True
        from diff_plane_rasterization import GaussianRasterizer, GaussianRasterizationSettings
        from common_utils.graphics_utils import getProjectionMatrix
        settings = GaussianRasterizationSettings(image_height=32, image_width=32, tanfovx=1., tanfovy=1.,
            bg=torch.zeros(3, device='cuda'), scale_modifier=1., viewmatrix=torch.eye(4, device='cuda'),
            projmatrix=getProjectionMatrix(.01, 100., np.pi/2, np.pi/2).T.cuda(), sh_degree=0,
            campos=torch.zeros(3, device='cuda'), prefiltered=False, render_geo=False, debug=False)
        xyz = torch.tensor([[0., 0., 2.], [.2, .1, 2.5], [-.2, -.1, 3.]], device='cuda', requires_grad=True)
        colors = torch.ones((3, 3), device='cuda', requires_grad=True)
        rendered = GaussianRasterizer(settings)(means3D=xyz, means2D=torch.zeros_like(xyz, requires_grad=True),
            means2D_abs=torch.zeros_like(xyz, requires_grad=True), opacities=torch.full((3, 1), .8, device='cuda'),
            colors_precomp=colors, scales=torch.full((3, 3), .1, device='cuda'),
            rotations=torch.tensor([[1., 0., 0., 0.]] * 3, device='cuda'))
        assert torch.isfinite(rendered[0]).all() and rendered[0].sum() > 0 and (rendered[1] > 0).any()
        rendered[0].sum().backward()
        assert torch.isfinite(xyz.grad).all() and torch.isfinite(colors.grad).all()
        report['checks']['plane_rasterizer_cuda_backward'] = True
        from dust3r.model import AsymmetricCroCo3DStereo
        model = AsymmetricCroCo3DStereo.from_pretrained(str(ckpt / 'dust3r-hf/model.safetensors')).cuda().eval()
        rgb = np.array(Image.open(args.image).convert('RGB').resize((256, 256))).copy()
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).float().cuda()[None] / 127.5 - 1
        view = {'img': tensor, 'true_shape': torch.tensor([[256, 256]], device='cuda'), 'instance': ['smoke-frame']}
        with torch.no_grad():
            outputs = model(view, view)
        assert all(torch.isfinite(v).all() for output in outputs for v in output.values() if torch.is_tensor(v))
        report['checks']['dust3r_inference'] = True
        del model, outputs, tensor, view
        gc.collect(); torch.cuda.empty_cache()
        from lp3.run_groundedsam import GroundingDINO, SAM
        detector = GroundingDINO('cuda')
        detector.load_model(str(ckpt / 'groundingdino_swint_ogc.pth'))
        detector.load_image(str(args.image))
        boxes, labels = detector.get_detection_output('wall. floor. door. window.', with_logits=False)
        assert torch.isfinite(boxes).all()
        report['checks']['groundingdino_inference'] = True
        report['detected_labels'] = labels
        del detector
        gc.collect(); torch.cuda.empty_cache()
        from segment_anything import sam_model_registry, SamPredictor
        model = sam_model_registry['vit_h'](checkpoint=str(ckpt / 'sam_vit_h_4b8939.pth')).cuda().eval()
        predictor = SamPredictor(model)
        rgb = np.array(Image.open(args.image).convert('RGB'))
        predictor.set_image(rgb)
        h, w = rgb.shape[:2]
        masks, scores, logits = predictor.predict(box=np.array([w*.1, h*.1, w*.9, h*.9]), multimask_output=False)
        assert masks.shape[1:] == (h, w) and np.isfinite(scores).all() and np.isfinite(logits).all()
        report['checks']['sam_inference'] = True
        torch.cuda.synchronize()
        report.update(ready=True, model_loading_verified=True, inference_verified=True)
        report['checkpoint_files'] = {str(p.relative_to(ckpt)): {'bytes': p.stat().st_size, 'mtime_ns': p.stat().st_mtime_ns}
            for p in [ckpt / 'dust3r-hf/model.safetensors', ckpt / 'groundingdino_swint_ogc.pth',
                      ckpt / 'sam_vit_h_4b8939.pth', ckpt / 'bert-base-uncased/model.safetensors']}
        report['torch_version'] = torch.__version__
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        report['elapsed_seconds'] = round(time.monotonic() - started, 2)
        report['peak_torch_allocated_mib'] = round(torch.cuda.max_memory_allocated() / 1024**2, 2)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
