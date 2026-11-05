"""Prepare a local video for PlanarGS; never infer metric dimensions from monocular SfM."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import time


def prepare(video: Path, output: Path, frames: int = 80, max_size: int = 960):
    import cv2
    import numpy as np
    import pycolmap

    if not video.is_file():
        raise ValueError(f"Video not found: {video}")
    if output.exists():
        raise ValueError("Choose a new output directory; existing reconstruction data will not be overwritten.")
    if not 20 <= frames <= 300 or not 320 <= max_size <= 1920:
        raise ValueError("Use 20–300 frames and a 320–1920 pixel maximum dimension.")
    output.mkdir(parents=True)
    report = {'status': 'preparing', 'video': str(video), 'units': 'arbitrary',
              'metric_scale_applied': False, 'frames_requested': frames, 'max_size': max_size,
              'pycolmap': pycolmap.__version__}
    started = time.monotonic()
    report_path = output / 'preparation.json'
    try:
        digest = hashlib.sha256()
        with video.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        report['video_sha256'] = digest.hexdigest()
        images = output / 'frames'
        images.mkdir()
        capture = cv2.VideoCapture(str(video))
        try:
            total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = capture.get(cv2.CAP_PROP_FPS)
            if not capture.isOpened() or total < 20 or fps <= 0:
                raise ValueError("Cannot decode this video, or it contains fewer than 20 frames.")
            report.update(video_frames=total, video_fps=fps, duration_seconds=total / fps)
            sampled = []
            for index, frame_id in enumerate(np.linspace(0, total - 1, min(total, frames), dtype=int)):
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_id))
                ok, frame = capture.read()
                if not ok:
                    raise ValueError(f"Video decode failed at frame {frame_id}.")
                scale = min(1.0, max_size / max(frame.shape[:2]))
                if scale < 1:
                    frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
                name = f'{index:06d}.jpg'
                if not cv2.imwrite(str(images / name), frame, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                    raise OSError(f"Failed to save {name}")
                sampled.append({'image': name, 'video_frame': int(frame_id),
                                'seconds': float(frame_id / fps)})
            report['sampled_frames'] = sampled
        finally:
            capture.release()

        threads = min(8, os.cpu_count() or 4)
        database = output / 'database.db'
        print('Extracting features and estimating cameras on CPU...', flush=True)
        pycolmap.extract_features(
            str(database), str(images), camera_mode=pycolmap.CameraMode.SINGLE,
            reader_options={'camera_model': 'SIMPLE_RADIAL'},
            sift_options={'num_threads': threads, 'max_image_size': max_size, 'max_num_features': 8192},
            device=pycolmap.Device.cpu)
        pycolmap.match_exhaustive(str(database), sift_options={'num_threads': threads},
                                 device=pycolmap.Device.cpu)
        sparse = output / 'colmap'
        sparse.mkdir()
        models = pycolmap.incremental_mapping(str(database), str(images), str(sparse),
                                             options={'num_threads': threads})
        if not models:
            raise RuntimeError('COLMAP could not reconstruct camera poses. Try slower movement and more overlapping views.')
        index, best = max(models.items(), key=lambda item: item[1].num_reg_images())
        registered = best.num_reg_images()
        report.update(registered_images=registered, sparse_points=best.num_points3D(),
                      coverage=registered / len(sampled), fragments=len(models),
                      mean_reprojection_error_px=best.compute_mean_reprojection_error())
        from export_sparse import export_sparse
        export_sparse(output, report)
        if registered < 15 or report['coverage'] < 0.7:
            report.update(status='partial', training_started=False,
                          reason='Too few frames registered in one connected model; sparse fragments are available.')
            return report
        scene = output / 'scene'
        pycolmap.undistort_images(str(scene), str(sparse / str(index)), str(images),
                                 output_type='COLMAP')
        for name in ('cameras.bin', 'images.bin', 'points3D.bin'):
            if not (scene / 'sparse' / name).is_file():
                raise RuntimeError(f'Missing undistorted COLMAP output: {name}')
        report.update(status='prepared', scene=str(scene))
    except Exception as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        report['elapsed_seconds'] = round(time.monotonic() - started, 2)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--frames', type=int, default=80)
    parser.add_argument('--max-size', type=int, default=960)
    args = parser.parse_args()
    prepare(args.video.resolve(), args.output.resolve(), args.frames, args.max_size)
