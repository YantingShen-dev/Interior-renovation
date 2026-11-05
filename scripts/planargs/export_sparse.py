"""Export COLMAP fragments independently, without inventing alignment or metric scale."""
import argparse
import json
import math
from pathlib import Path


def export_sparse(preparation, report):
    import pycolmap
    preparation = Path(preparation)
    times = {frame['image']: frame['seconds'] for frame in report['sampled_frames']}
    fragments = []
    for folder in sorted((preparation / 'colmap').iterdir()):
        if not folder.is_dir() or not (folder / 'points3D.bin').is_file():
            continue
        model = pycolmap.Reconstruction(str(folder))
        points = [list(map(float, p.xyz)) + list(map(int, p.color))
                  for p in model.points3D.values() if all(math.isfinite(float(v)) for v in p.xyz)]
        if not points:
            continue
        names = sorted(image.name for image in model.images.values() if image.has_pose)
        seconds = sorted(times[name] for name in names if name in times)
        # Keep the full finite cloud in PLY; only cap the browser preview.
        ply = preparation / f'fragment-{folder.name}.ply'
        with ply.open('w', encoding='ascii') as stream:
            stream.write('ply\nformat ascii 1.0\nelement vertex %d\n' % len(points))
            stream.write('property float x\nproperty float y\nproperty float z\n')
            stream.write('property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n')
            for p in points:
                stream.write(' '.join(map(str, p)) + '\n')
        step = max(1, math.ceil(len(points) / 12000))
        fragments.append({'id': folder.name, 'points': points[::step], 'point_count': len(points),
                          'registered_images': len(names), 'image_names': names,
                          'seconds': seconds, 'ply': ply.name,
                          'mean_reprojection_error_px': model.compute_mean_reprojection_error()})
    if not fragments:
        raise RuntimeError('No finite COLMAP points are available for preview.')
    fragments.sort(key=lambda item: (item['registered_images'], item['point_count']), reverse=True)
    best = fragments[0]
    preview = {'points': best['points'], 'planes': [], 'frame': 'colmap', 'units': 'arbitrary',
               'registered': False, 'kind': 'sparse', 'partial': True,
               'selected_fragment': best['id'], 'fragments': fragments,
               'sampled_images': len(report['sampled_frames']),
               'source_video_sha256': report['video_sha256']}
    (preparation / 'sparse-preview.json').write_text(json.dumps(preview), encoding='utf-8')
    return preview


def recover(project):
    """Recover only stopped coverage failures; preserve their original diagnostic report."""
    project = Path(project)
    job_path = project.parent / 'webjob.json'
    job = json.loads(job_path.read_text(encoding='utf-8'))
    report = json.loads((project / 'preparation/preparation.json').read_text(encoding='utf-8'))
    if job['status'] != 'failed' or 'Too few frames registered' not in report.get('error', ''):
        raise ValueError('Recovery is restricted to stopped COLMAP coverage failures.')
    if (project / 'project.json').exists():
        raise ValueError('An existing project manifest must not be overwritten.')
    preview = export_sparse(project / 'preparation', report)
    manifest = {'backend': 'planargs', 'input': {'video_sha256': report['video_sha256']},
                'units': 'arbitrary', 'metric_scale_applied': False, 'status': 'partial',
                'training_started': False, 'coverage': report['coverage'],
                'recovered_from': report['error']}
    (project / 'project.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    job.update(status='review', message='已恢复局部稀疏点云；片段未连通，未执行完整房间训练。可分别查看片段。')
    job_path.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps([{k: v for k, v in f.items() if k not in ('points', 'image_names')}
                      for f in preview['fragments']], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recover-project', type=Path, required=True)
    recover(parser.parse_args().recover_project)
