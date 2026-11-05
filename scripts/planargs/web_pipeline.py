"""Run actual PlanarGS and export its mesh evidence for the local studio."""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    args = parser.parse_args()
    import os
    app = Path(__file__).resolve().parents[2]
    scripts = app / 'scripts/planargs'
    repo = app.parent / 'PlanarGS'
    runtime = Path(os.environ.get('PLANARGS_RUNTIME', '/home/ting/planargs-runtime'))
    project = args.project.resolve()
    if project.exists():
        parser.error('Choose a fresh project directory; existing results are preserved.')
    project.mkdir(parents=True)
    def run(script, *arguments):
        subprocess.run([sys.executable, str(scripts / script), *map(str, arguments)], check=True)
    run('preflight.py', '--repo', repo, '--checkpoints', runtime / 'checkpoints', '--output', project / 'preflight.json')
    print('COLMAP: preparing local video', flush=True)
    from prepare_video import prepare
    prepared = prepare(args.video.resolve(), project / 'preparation')
    manifest = {'backend': 'planargs', 'input': {'video_sha256': prepared['video_sha256']},
                'units': 'arbitrary', 'metric_scale_applied': False, 'status': 'training'}
    def save():
        (project / 'project.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if prepared['status'] == 'partial':
        manifest.update(status='partial', training_started=False, coverage=prepared['coverage'])
        save()
        print('COLMAP partial sparse cloud ready; full training skipped due to disconnected cameras.', flush=True)
        return
    save()
    run('run_trial.py', '--repo', repo, '--scene', prepared['scene'], '--output', project / 'reconstruction',
        '--checkpoints', runtime / 'checkpoints', '--full')
    trial = json.loads((project / 'reconstruction/trial.json').read_text())
    import open3d as o3d
    import numpy as np
    mesh = o3d.io.read_triangle_mesh(trial['mesh'])
    xyz = np.asarray(mesh.vertices)
    colors = np.asarray(mesh.vertex_colors)
    if not len(xyz):
        raise RuntimeError('PlanarGS returned an empty mesh; this is not a successful reconstruction.')
    indices = np.linspace(0, len(xyz) - 1, min(12000, len(xyz)), dtype=int)
    rgb = np.clip(colors[indices] * 255, 0, 255).astype(int) if len(colors) == len(xyz) else np.full((len(indices), 3), 160)
    points = np.concatenate([xyz[indices].round(6), rgb], axis=1).tolist()
    structure = project / 'structure'
    structure.mkdir()
    (structure / 'web_sample.json').write_text(json.dumps({'points': points, 'units': 'arbitrary'}))
    (structure / 'observed_planes.json').write_text(json.dumps({'planes': []}))
    manifest.update(status='complete', gaussians=trial['gaussians'], mesh=trial['mesh'],
                    wall_extraction_verified=False, metric_dimensions_verified=False)
    save()
    print('PlanarGS reconstruction complete; review and calibrate the room outline.', flush=True)


if __name__ == '__main__':
    main()
