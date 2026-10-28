"""Orthographic diagnostic projections of actual textured triangles."""
from pathlib import Path
import json
import numpy as np
import trimesh
import cv2
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"重建小样/room_editable_v1"
basis=np.load(OUT/"manhattan_basis.npy")
mesh=trimesh.load_scene(ROOT/"重建小样/kiri_3dgs_images/unpacked/3DModel.glb",process=False).to_geometry()
centers=mesh.triangles_center@basis.T
normals=mesh.face_normals@basis.T
vertex_colors=np.asarray(mesh.visual.to_color().vertex_colors)[:,:3]
targets=[(0,-2.61),(0,6.0),(1,-9.725),(1,4.717),(2,-13.409),(2,5.8)]
canvas=Image.new("RGB",(1800,1800),"#111827");draw=ImageDraw.Draw(canvas)
for i,(axis,offset) in enumerate(targets):
    selected=np.flatnonzero((abs(normals[:,axis])>np.cos(np.deg2rad(18)))&(abs(centers[:,axis]-offset)<.7))
    uv=[a for a in range(3) if a!=axis]
    projected=centers[selected][:,uv]
    lo,hi=np.quantile(projected,[.005,.995],axis=0)
    scale=min(840/(hi[0]-lo[0]),500/(hi[1]-lo[1]))
    tile=np.full((560,880,3),[17,24,39],dtype=np.uint8)
    order=selected[np.argsort(abs(centers[selected,axis]-offset))[::-1]]
    for index in order:
        vertices=mesh.faces[index]
        triangle=mesh.vertices[vertices]@basis[uv].T
        xy=(triangle-(lo+hi)/2)*[scale,-scale]+[440,280]
        if xy.max()<0:continue
        color=tuple(int(v) for v in vertex_colors[vertices].mean(axis=0))
        cv2.fillConvexPoly(tile,np.round(xy).astype(np.int32),color)
    x=(i%2)*900;y=(i//2)*600
    canvas.paste(Image.fromarray(tile),(x+10,y+30))
    draw.text((x+15,y+8),f"axis {axis}, offset {offset:.3f}, projected axes {uv}, triangles {len(selected)}",fill="white")
    Image.fromarray(tile).save(OUT/f"plane_axis{axis}_{offset:.2f}.jpg",quality=94)
canvas.save(OUT/"plane_texture_diagnostics.jpg",quality=94)
print("Actual triangle projections generated.")
