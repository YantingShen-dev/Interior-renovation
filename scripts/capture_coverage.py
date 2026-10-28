"""Annotate a sample of video views with actual local SfM registration."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
sample=ROOT/"重建小样"/"local_v2"
capture=json.loads((sample/"capture_report.json").read_text(encoding="utf-8"))
report=json.loads((sample/"sparse"/"reconstruction_report.json").read_text(encoding="utf-8"))
membership={name:m["id"] for m in report["models"] for name in m["images"]}
features={p["image"]:p["count"] for p in report["features"]}
selected=np.linspace(0,len(capture["frames"])-1,15).astype(int)
w,h,cols=216,448,5
sheet=Image.new("RGB",(w*cols,3*h+70),"#101827")
draw=ImageDraw.Draw(sheet)
draw.text((12,12),"LOCAL SfM COVERAGE | fragments are independent / NOT metric",fill="white")
draw.text((12,35),"Blue = fragment 0; gold = fragment 1; gray = not registered",fill="#c4d0de")
for n,i in enumerate(selected):
    frame=capture["frames"][int(i)]
    path=Path(frame["file"])
    name=path.relative_to("images").as_posix()
    fragment=membership.get(name)
    color={0:"#75c9f0",1:"#e4b36f"}.get(fragment,"#7d899b")
    x,y=(n%cols)*w,70+(n//cols)*h
    draw.rectangle((x+2,y,x+w-3,y+h-3),outline=color,width=3)
    with Image.open(sample/path) as im:
        im.thumbnail((w-12,370))
        sheet.paste(im,(x+(w-im.width)//2,y+5))
    draw.text((x+8,y+383),f"{frame['sample_time_s']:.2f}s | {path.name}",fill="white")
    draw.text((x+8,y+402),f"SIFT features: {features.get(name,0)}",fill="#c4d0de")
    draw.text((x+8,y+422),f"fragment {fragment}" if fragment is not None else "not registered",fill=color)
sheet.save(sample/"capture_coverage.jpg",quality=92)
video_names={Path(f["file"]).relative_to("images").as_posix() for f in capture["frames"]}
summary={"video_frames":len(video_names),"registered_video_frames_union":len(video_names & membership.keys()),
         "unregistered_video_frames":len(video_names-membership.keys()),
         "largest_model_images":max(m["registered_images"] for m in report["models"]),
         "total_input_images":report["input_images"]}
(sample/"coverage_summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
print(json.dumps(summary))
