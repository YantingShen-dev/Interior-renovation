"""Extract reproducible video frames and make a visual capture report."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--fps", type=float, default=2.0)
    parser.add_argument("--output-name", default="local_v1")
    args = parser.parse_args()
    root = args.root.resolve()
    output = root / "重建小样" / args.output_name
    frame_dir = output / "images" / "video"
    photo_dir = output / "images" / "photos"
    frame_dir.mkdir(parents=True, exist_ok=True)
    photo_dir.mkdir(parents=True, exist_ok=True)
    sources = sorted((root / "现场素材" / "视频").glob("*.mp4"))
    if len(sources) != 1:
        raise SystemExit("Expected exactly one MP4 for this first sample.")
    source = sources[0]
    with source.open("rb") as handle:
        source_hash = hashlib.file_digest(handle, "sha256").hexdigest()
    prior_path = output / "capture_report.json"
    if prior_path.exists():
        previous = json.loads(prior_path.read_text(encoding="utf-8"))
        originals = sorted((root / "现场素材" / "照片").glob("*.jpg"))
        copies = sorted(photo_dir.glob("*.jpg"))
        unchanged_photos = [p.name for p in originals] == [p.name for p in copies]
        if unchanged_photos:
            unchanged_photos = all(a.read_bytes() == b.read_bytes() for a,b in zip(originals,copies))
        if previous.get("sha256") != source_hash or previous.get("sample_fps") != args.fps or not unchanged_photos:
            raise SystemExit("Inputs changed. Use a new --output-name to avoid mixing an old database with new captures.")
        existing = list(frame_dir.glob("frame_*.jpg"))
        if len(existing) != previous.get("frame_count"):
            raise SystemExit("Frame set is incomplete. Use a new --output-name.")
        print(json.dumps({"output":str(output), "reused":True, "frames":len(existing)},ensure_ascii=False))
        return
    report = {
        "source": str(source.relative_to(root)),
        "sha256": source_hash,
        "sample_fps": args.fps,
        "known_dimensions_m": {"length": 4.0, "width": 1.8, "height": None},
        "metric_scale_applied": False,
        "frames": [],
    }
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
           "-y", "-i", str(source), "-vf", f"fps={args.fps}", "-q:v", "2",
           str(frame_dir / "frame_%04d.jpg")]
    subprocess.run(cmd, check=True)
    for path in sorted(frame_dir.glob("frame_*.jpg")):
        with Image.open(path) as im:
            rgb = np.asarray(im.convert("RGB"))
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        report["frames"].append({
            "file": str(path.relative_to(output)),
            "sample_time_s": round((int(path.stem.split("_")[-1]) - 0.5) / args.fps, 3),
            "width": int(rgb.shape[1]), "height": int(rgb.shape[0]),
            "laplacian_variance": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
        })
    for path in sorted((root / "现场素材" / "照片").glob("*.jpg")):
        shutil.copy2(path, photo_dir / path.name)
    report["frame_count"] = len(report["frames"])
    report["photo_count"] = len(list(photo_dir.glob("*.jpg")))
    (output / "capture_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    samples = np.linspace(0, len(report["frames"]) - 1, min(15, len(report["frames"]))).astype(int)
    w, h, cols = 216, 412, 5
    sheet = Image.new("RGB", (cols*w, ((len(samples)+cols-1)//cols)*h), "#151b26")
    draw = ImageDraw.Draw(sheet)
    for n, i in enumerate(samples):
        frame = report["frames"][int(i)]
        with Image.open(output / frame["file"]) as im:
            im.thumbnail((w-8, h-30))
            x, y = (n % cols)*w, (n // cols)*h
            sheet.paste(im, (x + (w-im.width)//2, y))
        draw.text((x+6, y+h-24), f"{frame['sample_time_s']:.2f}s  {Path(frame['file']).name}", fill="white")
    sheet.save(output / "video_contact_sheet.jpg", quality=90)
    print(json.dumps({"output": str(output), "frames": report["frame_count"], "photos": report["photo_count"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
