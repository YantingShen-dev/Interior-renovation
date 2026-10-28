"""Metric orthographic elevations from the measured-height aligned scan."""
from pathlib import Path
import json
import numpy as np
import trimesh
import cv2
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"重建小样/room_editable_v1"
report=json.loads((OUT/"cleanup_report.json").read_text())
mesh=trimesh.load_scene(ROOT/"重建小样/kiri_3dgs_images/unpacked/3DModel.glb",process=False).to_geometry()
mesh.apply_transform(np.array(report["world_to_metric_transform"]))
centers=mesh.triangles_center;normals=mesh.face_normals
colors=np.asarray(mesh.visual.to_color().vertex_colors)[:,:3]
targets=[("wall_a",1,[-.12,.18],[0,2],[-.15,-.05],[4.3,3.15],False),
         ("wall_b",1,[1.25,2.70],[0,2],[-.15,-.05],[4.7,3.15],True),
         ("door_end",0,[3.5,4.85],[1,2],[-.15,-.05],[2.7,3.15],True)]
sheet=Image.new("RGB",(1500,1800),"#111827");draw=ImageDraw.Draw(sheet)
for k,(name,axis,depth,uv,lo,hi,reverse) in enumerate(targets):
    lo=np.array(lo);hi=np.array(hi)
    mask=(centers[:,axis]>depth[0])&(centers[:,axis]<depth[1])&(abs(normals[:,axis])>.55)
    selected=np.flatnonzero(mask)
    selected=selected[np.argsort(centers[selected,axis])]
    if reverse:selected=selected[::-1]
    tile=np.full((540,1450,3),[17,24,39],dtype=np.uint8)
    scale=min(1400/(hi[0]-lo[0]),500/(hi[1]-lo[1]))
    for idx in selected:
        vertices=mesh.faces[idx];p=mesh.vertices[vertices][:,uv]
        xy=(p-(lo+hi)/2)*[scale,-scale]+[725,270]
        if (xy[:,0].max()<0 or xy[:,0].min()>1450 or xy[:,1].max()<0 or xy[:,1].min()>540):continue
        cv2.fillConvexPoly(tile,np.round(xy).astype(np.int32),tuple(int(v) for v in colors[vertices].mean(axis=0)))
    tile_image=Image.fromarray(tile)
    tile_image.save(OUT/f"{name}_observed.jpg",quality=95)
    sheet.paste(tile_image,(25,k*600+35))
    draw.text((25,k*600+10),f"{name} | horizontal {lo[0]:.2f} .. {hi[0]:.2f} m | vertical {lo[1]:.2f} .. {hi[1]:.2f} m",fill="white")
sheet.save(OUT/"observed_elevations.jpg",quality=94)
print("Metric elevations generated.")
