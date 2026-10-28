"""Measure independent plane offsets before applying the known 3 m height."""
from pathlib import Path
import json
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"重建小样/room_editable_v1"
data=np.load(OUT/"analysis_samples.npz");basis=np.load(OUT/"manhattan_basis.npy")
q=data["points"]@basis.T;n=data["normals"]@basis.T;c=data["colors"]


def peaks(values,step=.12,min_distance=.5,limit=8):
    low,high=np.quantile(values,[.005,.995]);edges=np.arange(low,high+step,step)
    hist,edges=np.histogram(values,bins=edges);found=[]
    for i in np.argsort(hist)[::-1]:
        center=(edges[i]+edges[i+1])/2
        if all(abs(center-v[0])>min_distance for v in found):
            selected=values[abs(values-center)<step*1.5]
            found.append([float(np.median(selected)),int(hist[i])])
        if len(found)>=limit:break
    return found


profiles={}
for axis in range(3):
    for side in [-1,1]:
        mask=(abs(n[:,axis])>.9)&(q[:,axis]*side>0)
        profiles[f"axis{axis}_{side}"]=peaks(q[mask,axis])
(OUT/"offset_profiles.json").write_text(json.dumps(profiles,indent=2))
floor=profiles["axis1_-1"][0][0];ceiling=profiles["axis1_1"][0][0]
window=profiles["axis2_-1"][0][0];end=profiles["axis2_1"][0][0]
left=profiles["axis0_-1"][0][0];right=profiles["axis0_1"][0][0]
scale=3.0/(ceiling-floor)
result={"raw_plane_offsets":{"floor":floor,"ceiling":ceiling,"window_end":window,"door_end":end,"side_a":left,"side_b":right},"uniform_scale_m_per_raw_unit":scale,"height_calibration_m":3.0,"estimated_length_m":(end-window)*scale,"estimated_width_m":(right-left)*scale,"known_length_m":4.0,"known_width_m":1.8,"length_error_m":(end-window)*scale-4,"width_error_m":(right-left)*scale-1.8,"status":"candidate_planes_require_visual_confirmation"}
(OUT/"candidate_dimensions.json").write_text(json.dumps(result,indent=2))
# Aligned diagnostic top view: horizontal = distance toward double door, vertical = width.
xyz=np.column_stack([(q[:,2]-window)*scale,(q[:,0]-left)*scale,(q[:,1]-floor)*scale])
fig=Image.new("RGB",(1800,1000),"#101827");draw=ImageDraw.Draw(fig)
for view,(zlo,zhi,title) in enumerate([(-.35,.45,"Floor slice"),(.45,2.6,"Wall slice")]):
    mask=(xyz[:,2]>zlo)&(xyz[:,2]<zhi)&(xyz[:,0]>-.6)&(xyz[:,0]<5)&(xyz[:,1]>-.6)&(xyz[:,1]<3)
    xy=xyz[mask,:2]*[150,-150]+[60+view*900,700]
    for p,color in zip(xy,c[mask]):
        draw.ellipse((p[0]-1,p[1]-1,p[0]+1,p[1]+1),fill=tuple(color))
    draw.text((30+view*900,20),title+" | height-calibrated candidate planes",fill="white")
    for a in np.arange(0,4.1,.5):
        x=60+view*900+a*150;draw.line((x,720,x,730),fill="#8da5bc");draw.text((x,740),f"{a:g}",fill="white")
    draw.rectangle((60+view*900,700-1.8*150,60+view*900+4*150,700),outline="#50c8c1",width=2)
fig.save(OUT/"aligned_plan_diagnostics.jpg",quality=93)
print(json.dumps(profiles,indent=2));print(json.dumps(result,indent=2))
