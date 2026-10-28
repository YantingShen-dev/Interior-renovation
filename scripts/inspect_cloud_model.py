"""Inspect a returned mesh archive without assigning guessed room dimensions."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import stat
import zipfile

import numpy as np
import trimesh


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("archive",type=Path)
    args=parser.parse_args()
    archive=args.archive.resolve()
    output=(archive.parent/"unpacked").resolve()
    output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        if sum(i.file_size for i in zipped.infolist())>2*1024**3:
            raise ValueError("Archive exceeds the 2 GiB inspection limit.")
        for item in zipped.infolist():
            if stat.S_ISLNK(item.external_attr>>16):
                raise ValueError("Archive contains a symbolic link.")
            name=item.filename.replace("\\","/")
            target=(output/name).resolve()
            if not target.is_relative_to(output):
                raise ValueError("Archive entry leaves the output directory.")
            if item.is_dir():
                target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with zipped.open(item) as src,target.open("wb") as dst:
                    import shutil
                    shutil.copyfileobj(src,dst)
    candidates=[]
    for suffix in (".glb",".gltf",".obj",".ply"):
        candidates.extend(sorted(output.rglob("*"+suffix)))
    if not candidates:
        raise ValueError("No recognized mesh file was returned.")
    for candidate in candidates:
        if candidate.suffix==".ply":
            with candidate.open("rb") as handle:
                header=handle.read(4096)
            if b"f_dc_0" in header or b"scale_0" in header:
                continue  # Gaussian parameters are not a geometric mesh.
        loaded=trimesh.load_scene(candidate,process=False)
        mesh=loaded.to_geometry()
        if not isinstance(mesh,trimesh.Trimesh) or len(mesh.faces)==0:
            continue
        if not np.isfinite(mesh.vertices).all():
            raise ValueError("Mesh contains non-finite vertices.")
        info={"source":str(candidate.relative_to(archive.parent)),"vertices":len(mesh.vertices),
              "faces":len(mesh.faces),"bounds":mesh.bounds.tolist(),"extents":mesh.extents.tolist(),
              "metric_scale_validated":False,"scene_geometry_objects":len(loaded.geometry),
              "visual_kind":mesh.visual.kind}
        camera_files=sorted(output.rglob("cameras.json"))
        if camera_files:
            cameras=json.loads(camera_files[0].read_text(encoding="utf-8"))
            info["returned_camera_records"]=len(cameras)
            info["camera_alignment_verified"]=False
        (archive.parent/"mesh_report.json").write_text(json.dumps(info,indent=2),encoding="utf-8")
        # Sampling makes geometry inspectable without implying semantic walls or furniture.
        count=20000
        pts,faces=trimesh.sample.sample_surface(mesh,count,seed=0)
        visual=mesh.visual.to_color() if hasattr(mesh.visual,"to_color") else mesh.visual
        if visual.kind=="vertex":
            colors=np.asarray(visual.vertex_colors)[mesh.faces[faces],:3].mean(axis=1)
        else:
            colors=np.asarray(visual.face_colors)[faces,:3]
        trimesh.points.PointCloud(pts,colors=np.clip(colors,0,255).astype(np.uint8)).export(archive.parent/"surface_points.ply")
        preview={"kind":"surface_sample","metric_scale_applied":False,"units":"unverified",
                 "model_id":"cloud","points":np.column_stack([pts,colors]).round(6).tolist(),"cameras":[]}
        (archive.parent/"surface_sample.json").write_text(json.dumps(preview),encoding="utf-8")
        print(json.dumps(info))
        return
    raise ValueError("Archive has no usable triangle mesh; Gaussian PLY alone is not accepted as a room mesh.")


if __name__ == "__main__":
    main()
