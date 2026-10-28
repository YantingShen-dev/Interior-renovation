"""Render the dominant plane families to distinguish floors from walls visually."""
from pathlib import Path
import json
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"重建小样/room_editable_v1"
data=np.load(OUT/"analysis_samples.npz")
points,normals,colors=data["points"],data["normals"],data["colors"]
analysis=json.loads((OUT/"analysis.json").read_text())
v0=np.asarray(analysis["plane_families"][0]["normal"])
v1=np.asarray(analysis["plane_families"][1]["normal"]);v1-=v0*(v0@v1);v1/=np.linalg.norm(v1)
v2=np.cross(v0,v1)
basis=np.array([v0,v1,v2])
q=points@basis.T
np.save(OUT/"manhattan_basis.npy",basis)
canvas=Image.new("RGB",(2100,1500),"#111827");draw=ImageDraw.Draw(canvas)
summary=[]
for axis in range(3):
    n=basis[axis]
    keep=np.abs(normals@n)>np.cos(np.deg2rad(12))
    values=q[keep,axis]
    hist,edges=np.histogram(values,bins=180)
    peaks=[]
    for index in np.argsort(hist)[::-1]:
        center=(edges[index]+edges[index+1])/2
        if all(abs(center-c)>.7 for c in peaks):peaks.append(center)
        if len(peaks)==3:break
    for row,offset in enumerate(peaks):
        mask=keep&(abs(q[:,axis]-offset)<.28)
        uv=[k for k in range(3) if k!=axis]
        selected=q[mask][:,uv];c=colors[mask]
        lo,hi=np.quantile(selected,[.01,.99],axis=0)
        scale=min(640/(hi[0]-lo[0]),410/(hi[1]-lo[1]))
        origin=np.array([axis*700+350,row*500+270])
        xy=(selected-(lo+hi)/2)*np.array([scale,-scale])+origin
        for pixel,rgb in zip(xy,c):
            x,y=pixel
            if axis*700<x<(axis+1)*700 and row*500+50<y<(row+1)*500-10:
                draw.ellipse((x-2,y-2,x+2,y+2),fill=tuple(rgb))
        label=f"normal axis {axis} | offset {offset:.3f} | points {int(mask.sum())} | axes {uv}"
        draw.text((axis*700+15,row*500+12),label,fill="white")
        summary.append({"axis":axis,"offset":float(offset),"sample_points":int(mask.sum()),"projection_bounds":[lo.tolist(),hi.tolist()],"mean_rgb":c.mean(axis=0).tolist()})
canvas.save(OUT/"plane_candidates.jpg",quality=93)
(OUT/"plane_candidates.json").write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
