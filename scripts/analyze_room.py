"""Inspect dominant surface planes and a robust camera cluster before room cleanup."""
from __future__ import annotations
import json
from pathlib import Path
import os
os.environ.setdefault("OPENBLAS_NUM_THREADS","1")
import numpy as np
import trimesh
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"重建小样/kiri_3dgs_images/unpacked"
OUT=ROOT/"重建小样/room_editable_v1"


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    scene=trimesh.load_scene(SOURCE/"3DModel.glb",process=False)
    node=scene.graph.nodes_geometry[0]
    node_transform=scene.graph[node][0]
    mesh=scene.to_geometry()
    points,faces=trimesh.sample.sample_surface(mesh,180000,seed=11)
    normals=mesh.face_normals[faces]
    visual=mesh.visual.to_color()
    colors=np.asarray(visual.vertex_colors)[mesh.faces[faces],:3].mean(axis=1).astype(np.uint8)
    cameras=json.loads((SOURCE/"cameras.json").read_text())
    positions=trimesh.transform_points(np.array([c["position"] for c in cameras]),node_transform)
    ups=np.array([-node_transform[:3,:3]@np.asarray(c["rotation"])[:,1] for c in cameras])
    distances=np.linalg.norm(positions[:,None]-positions[None,:],axis=2)
    np.fill_diagonal(distances,np.inf)
    nn=np.min(distances,axis=1)
    eps=float(np.median(nn)*8)
    adjacent=distances<eps
    seen=set();groups=[]
    for i in range(len(cameras)):
        if i in seen:continue
        stack=[i];seen.add(i);group=[]
        while stack:
            v=stack.pop();group.append(v)
            for w in np.flatnonzero(adjacent[v]):
                if int(w) not in seen: seen.add(int(w));stack.append(int(w))
        groups.append(group)
    core=max(groups,key=len)
    up=np.median(ups[core],axis=0);up/=np.linalg.norm(up)
    up_consistency=np.degrees(np.arccos(np.clip(ups[core]@up,-1,1)))
    lower,upper=np.quantile(positions[core],[.02,.98],axis=0)
    margin=max(np.linalg.norm(upper-lower)*.5,.5)
    near=((points>=lower-margin)&(points<=upper+margin)).all(axis=1)
    camera_crop_valid=bool(near.sum()>1000)
    if not camera_crop_valid:
        near=np.ones(len(points),dtype=bool)
    p=points[near];n=normals[near]
    rng=np.random.default_rng(4)
    candidates=n[rng.choice(len(n),min(1200,len(n)),replace=False)]
    # Opposing normals belong to the same structural plane family.
    sampled=n[rng.choice(len(n),min(20000,len(n)),replace=False)]
    supports=(np.abs(candidates@sampled.T)>np.cos(np.deg2rad(8))).sum(axis=1)
    order=np.argsort(supports)[::-1]
    modes=[]
    for i in order:
        candidate=candidates[i]
        if modes and max(abs(candidate@m["normal"]) for m in modes)>np.cos(np.deg2rad(18)):continue
        keep=np.abs(n@candidate)>np.cos(np.deg2rad(10))
        selected=n[keep].copy();selected[(selected@candidate)<0]*=-1
        average=np.mean(selected,axis=0);average/=np.linalg.norm(average)
        offsets=p[keep]@average
        hist,edges=np.histogram(offsets,bins=120)
        peaks=np.argsort(hist)[-12:][::-1]
        modes.append({"normal":average,"near_points":int(keep.sum()),"angle_to_camera_up_deg":float(np.degrees(np.arccos(np.clip(abs(average@up),0,1)))),"offset_peaks":[[float((edges[j]+edges[j+1])/2),int(hist[j])] for j in peaks]})
        if len(modes)==8:break
    summary={"source_transform":node_transform.tolist(),"sample_points":len(points),"camera_cluster_epsilon":eps,"camera_cluster_sizes":sorted([len(g) for g in groups],reverse=True),"camera_core_indices":core,"camera_robust_bounds":[lower.tolist(),upper.tolist()],"camera_up":up.tolist(),"camera_up_deviation_median_deg":float(np.median(up_consistency)),"camera_crop_valid":camera_crop_valid,"near_margin":margin,"near_points":int(near.sum()),"plane_families":[{**m,"normal":m["normal"].tolist()} for m in modes]}
    (OUT/"analysis.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    np.savez_compressed(OUT/"analysis_samples.npz",points=points,normals=normals,colors=colors,cameras=positions,core=np.array(core),up=up,near=near)
    canvas=Image.new("RGB",(1800,850),"#101827");draw=ImageDraw.Draw(canvas)
    for k,(a,b) in enumerate([(0,1),(0,2),(1,2)]):
        lo=np.minimum(p.min(axis=0),positions[core].min(axis=0));hi=np.maximum(p.max(axis=0),positions[core].max(axis=0))
        center=(lo+hi)/2;scale=520/max(hi[a]-lo[a],hi[b]-lo[b])
        for point,color in zip(p[::2],colors[near][::2]):
            x=k*600+300+(point[a]-center[a])*scale;y=420-(point[b]-center[b])*scale
            draw.point((x,y),fill=tuple(color))
        for i in core:
            point=positions[i];x=k*600+300+(point[a]-center[a])*scale;y=420-(point[b]-center[b])*scale
            draw.ellipse((x-2,y-2,x+2,y+2),fill="#f0a349")
        draw.text((k*600+20,20),f"Raw axes {a}/{b} | local camera cluster / broad crop",fill="white")
    canvas.save(OUT/"diagnostic_near_views.jpg",quality=92)
    print(json.dumps({k:v for k,v in summary.items() if k not in ["camera_core_indices","plane_families"]},indent=2))
    print("PLANE FAMILIES",json.dumps(summary["plane_families"],indent=2))

if __name__=="__main__":main()
