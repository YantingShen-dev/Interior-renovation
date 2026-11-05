"""Run the official PlanarGS stages in a separate local process, preserving logs."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def commands(repo: Path, scene: Path, output: Path, checkpoints: Path, full: bool):
    iterations = 30000 if full else 1000
    common = ['-s', str(scene)]
    return [
        ('environment', [str(Path(__file__).resolve().with_name('preflight.py')), '--repo', str(repo),
                         '--checkpoints', str(checkpoints), '--output', str(output / 'preflight.json')]),
        ('geometry_priors', [str(repo / 'run_geomprior.py'), *common, '--group_size', '8',
                             '--ckpt_mv', str(checkpoints / 'dust3r-hf/model.safetensors')]),
        ('planar_priors', [str(repo / 'run_lp3.py'), *common,
                           '--ckpt_det', str(checkpoints / 'groundingdino_swint_ogc.pth'),
                           '--ckpt_seg', str(checkpoints / 'sam_vit_h_4b8939.pth')]),
        ('training', [str(repo / 'train.py'), *common, '-m', str(output / 'model'),
                      '--iterations', str(iterations), '--save_iterations', str(iterations),
                      '--test_iterations', str(iterations), '--data_device', 'cpu',
                      '--max_all_points', '1500000', '--initdensify_num', '15']),
        *([('mesh', [str(repo / 'render.py'), '-m', str(output / 'model'),
                    '--iteration', str(iterations), '--voxel_size', '0.02', '--max_depth', '100'])] if full else []),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--scene', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--checkpoints', type=Path, default=Path.home() / 'planargs-runtime/checkpoints')
    parser.add_argument('--full', action='store_true', help='Run 30,000 iterations and export mesh; otherwise only a 1,000-step compatibility trial.')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    repo, scene, output, checkpoints = (p.resolve() for p in (args.repo, args.scene, args.output, args.checkpoints))
    stages = commands(repo, scene, output, checkpoints, args.full)
    if args.dry_run:
        print(json.dumps(stages, ensure_ascii=False, indent=2))
        return
    if not (repo / 'train.py').is_file():
        parser.error('PlanarGS source is incomplete.')
    if not (scene / 'sparse/images.bin').is_file():
        parser.error('Run prepare_video.py first and use its scene directory.')
    if output.exists():
        parser.error('Choose a new output directory to preserve previous trial results.')
    output.mkdir(parents=True)
    report = {'status': 'running', 'kind': 'full' if args.full else 'compatibility_only',
              'metric_scale_applied': False, 'units': 'arbitrary', 'stages': [],
              'scene': str(scene), 'source_commit': 'a68f22043e95146c4f1c52cc0e471a6a90e86f73'}
    env = dict(os.environ, MPLBACKEND='Agg', PYTHONUNBUFFERED='1', OMP_NUM_THREADS='4')
    report_path = output / 'trial.json'
    try:
        for name, arguments in stages:
            command = [sys.executable, str(Path(__file__).resolve().with_name('worker.py')),
                       str(output / (name + '-metrics.json')), *arguments]
            item = {'name': name, 'command': command, 'status': 'running'}
            report['stages'].append(item)
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'Starting {name}; log: {output / (name + ".log")}', flush=True)
            started = time.monotonic()
            with (output / (name + '.log')).open('w', encoding='utf-8') as log:
                result = subprocess.run(item['command'], cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
            item.update(returncode=result.returncode, elapsed_seconds=round(time.monotonic() - started, 2),
                        status='complete' if result.returncode == 0 else 'failed')
            if result.returncode:
                raise RuntimeError(f'{name} failed. See {output / (name + ".log")}')
        iterations = 30000 if args.full else 1000
        expected = output / 'model' / 'point_cloud' / f'iteration_{iterations}' / 'point_cloud.ply'
        if not expected.is_file():
            raise RuntimeError(f'Training returned without its expected Gaussian output: {expected}')
        report['gaussians'] = str(expected)
        if args.full:
            meshes = list((output / 'model').rglob('tsdf_fusion_post.ply'))
            if not meshes:
                raise RuntimeError('Rendering returned without the expected reconstructed mesh.')
            report['mesh'] = str(meshes[0])
        report['status'] = 'complete'
    except BaseException as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Trial finished: {report_path}', flush=True)


if __name__ == '__main__':
    main()
