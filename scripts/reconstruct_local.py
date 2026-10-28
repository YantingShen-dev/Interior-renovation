"""Run CPU COLMAP on the sample; report coverage without assuming metric scale."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sqlite3
import time

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
import pycolmap


def preview_scene(index: int, rec: pycolmap.Reconstruction) -> dict:
    points = [p for p in rec.points3D.values() if p.track.length() >= 3 and p.error <= 2.0]
    return {"metric_scale_applied": False, "units": "arbitrary", "model_id": index,
            "points": [[*[round(float(v),6) for v in p.xyz], *[int(v) for v in p.color]] for p in points],
            "cameras": [{"image": im.name, "position": im.projection_center().tolist()} for im in rec.images.values() if im.has_pose]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=Path, default=Path(__file__).resolve().parents[1] / "重建小样" / "local_v1")
    parser.add_argument("--map-only", action="store_true")
    parser.add_argument("--output-name", default="sparse")
    parser.add_argument("--method", choices=["incremental", "global"], default="incremental")
    parser.add_argument("--relaxed", action="store_true", help="Compare weaker initialization/registration thresholds; requires additional geometry validation.")
    parser.add_argument("--images-dir",type=Path)
    parser.add_argument("--video-only",action="store_true")
    parser.add_argument("--project",type=Path)
    args = parser.parse_args()
    sample = args.sample.resolve()
    images = args.images_dir.resolve() if args.images_dir else sample / "images"
    known_dimensions={"length":4.0,"width":1.8,"height":None}
    if args.project:known_dimensions=json.loads(args.project.read_text(encoding='utf-8'))['measurements_m']
    db = sample / "database.db"
    if args.method == "global":
        global_db = sample / "database_global.db"
        if global_db.exists():
            raise SystemExit("Global database already exists; choose a fresh sample directory.")
        shutil.copy2(db, global_db)
        db = global_db
    out = sample / args.output_name
    out.mkdir(parents=True, exist_ok=True)
    threads = min(8, os.cpu_count() or 4)
    started = time.monotonic()
    pycolmap.logging.minloglevel = 1
    if not args.map_only:
        print("Extracting SIFT features...", flush=True)
        video_names = [p.relative_to(images).as_posix() for p in sorted(images.rglob("*.jpg") if args.video_only else (images / "video").glob("*.jpg"))]
        photo_names = [] if args.video_only else [p.relative_to(images).as_posix() for p in sorted((images / "photos").glob("*.jpg"))]
        pycolmap.extract_features(
            db, images,
            image_names=video_names,
            camera_mode=pycolmap.CameraMode.SINGLE,
            reader_options={"camera_model": "SIMPLE_RADIAL"},
            extraction_options={"max_image_size": 1600, "num_threads": threads,
                                "sift": {"max_num_features": 8192}},
            device=pycolmap.Device.cpu,
        )
        if photo_names:
            pycolmap.extract_features(
                db, images, image_names=photo_names,
                camera_mode=pycolmap.CameraMode.PER_IMAGE,
                reader_options={"camera_model": "SIMPLE_RADIAL"},
                extraction_options={"max_image_size": 1600, "num_threads": threads,
                                    "sift": {"max_num_features": 8192}},
                device=pycolmap.Device.cpu,
            )
        print("Matching all image pairs...", flush=True)
        pycolmap.match_exhaustive(
            db, matching_options={"num_threads": threads},
            device=pycolmap.Device.cpu,
        )
    print("Estimating cameras and sparse geometry...", flush=True)
    if args.method == "global":
        calibrated = pycolmap.calibrate_view_graph(db)
        print(f"View graph calibration: {calibrated}", flush=True)
        models = pycolmap.global_mapping(db, images, out, options={
            "num_threads": threads, "random_seed": 0,
            "mapper": {"num_threads": threads, "random_seed": 0,
                       "global_positioning": {"use_gpu": False},
                       "bundle_adjustment": {"ceres": {"use_gpu": False}}},
        })
    else:
        mapping_options={"num_threads": threads, "random_seed": 0}
        if args.relaxed:
            mapping_options["mapper"]={"init_min_tri_angle":4.0,"init_min_num_inliers":50,
                                       "abs_pose_min_num_inliers":15,"abs_pose_min_inlier_ratio":0.15,
                                       "ba_local_min_tri_angle":2.0}
        models = pycolmap.incremental_mapping(db, images, out, options=mapping_options)
    with sqlite3.connect(db) as con:
        total = con.execute("select count(*) from images").fetchone()[0]
        feature_rows = con.execute("select i.name,k.rows from images i join keypoints k on i.image_id=k.image_id order by i.name").fetchall()
        pairs = con.execute("select count(*),coalesce(max(rows),0) from two_view_geometries where rows>0").fetchone()
    report = {"engine": f"pycolmap {pycolmap.__version__}", "device": "cpu", "method": args.method, "relaxed_registration":args.relaxed,
              "input_images": total, "verified_pairs": pairs[0], "max_pair_inliers": pairs[1],
              "metric_scale_applied": False, "units": "arbitrary",
              "known_dimensions_m": known_dimensions,
              "models": [], "features": [{"image": n, "count": c} for n,c in feature_rows]}
    ranked = sorted(models.items(), key=lambda pair: (pair[1].num_reg_images(), pair[1].num_points3D()), reverse=True)
    for index, rec in ranked:
        rec.write_text(out / str(index))
        rec.export_PLY(out / str(index) / "points.ply")
        report["models"].append({"id": index, "registered_images": rec.num_reg_images(),
                                  "points": rec.num_points3D(), "mean_reprojection_error_px": rec.compute_mean_reprojection_error(),
                                  "mean_track_length": rec.compute_mean_track_length(),
                                  "images": sorted(im.name for im in rec.images.values() if im.has_pose)})
    if ranked:
        index, best = ranked[0]
        scene = preview_scene(index,best)
        scene["fragments"] = [preview_scene(i,rec) for i,rec in ranked[1:]]
        (out / "preview_data.json").write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8")
        report["preview_filtered_points"] = len(scene["points"])
        report["largest_model_coverage"] = round(best.num_reg_images()/total, 4) if total else 0
    report["elapsed_seconds"] = round(time.monotonic()-started, 2)
    (out / "reconstruction_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in ("features",)}, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
