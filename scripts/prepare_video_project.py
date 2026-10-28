"""One source video -> one frame pool with reconstruction/structure roles and provenance."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]


def parse_timeline(log: str, sample_fps: float) -> dict:
    original={};selected=[]
    pattern=re.compile(r'showinfo@(source|sample).*?n:\s*(\d+)\s+pts:.*?pts_time:\s*([\d.+-eE]+).*?\bchecksum:([0-9A-Fa-f]+)')
    for line in log.splitlines():
        match=pattern.search(line)
        if not match:continue
        role,index,pts,checksum=match.groups();item={"index":int(index),"pts_seconds":float(pts)}
        if role=='source':original.setdefault(checksum,[]).append(item)
        else:selected.append((int(index),checksum))
    result={}
    for i,checksum in selected:
        candidates=original.get(checksum,[])
        if not candidates:raise ValueError('Selected frame has no decoded-source checksum match.')
        closest=min(candidates,key=lambda f:abs(f['pts_seconds']-(i+.5)/sample_fps))
        result[i+1]={"source_frame_index":closest['index'],"source_timestamp_seconds":closest['pts_seconds'],"decoded_pixel_checksum":checksum}
    return result


def choose_structure_frames(frames,count=12):
    selected=[]
    for indices in np.array_split(np.arange(len(frames)),min(count,len(frames))):
        if len(indices):selected.append(max((frames[int(i)] for i in indices),key=lambda f:f['sharpness_laplacian_variance']))
    return selected


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--video',type=Path,required=True)
    parser.add_argument('--project',type=Path,default=ROOT/'单视频流程/试验01')
    for name in ('length','width','height'):parser.add_argument('--'+name,type=float)
    args=parser.parse_args();source=args.video.resolve();out=args.project.resolve();out.mkdir(parents=True,exist_ok=True)
    if any(getattr(args,k) is not None and getattr(args,k)<=0 for k in ('length','width','height')):raise ValueError('Measurements must be positive.')
    if not source.is_file():raise ValueError('Input video is missing.')
    digest=hashlib.sha256(source.read_bytes()).hexdigest();manifest=out/'project.json'
    if manifest.exists():
        prior=json.loads(manifest.read_text(encoding='utf-8'))
        if prior['input']['video_sha256']!=digest:raise ValueError('A different video requires a new project directory.')
        for f in prior['frames']:
            if hashlib.sha256((out/f['file']).read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Generated frame content changed.')
        changed=False
        for key in ('length','width','height'):
            value=getattr(args,key)
            if value is not None and prior['measurements_m'][key]!=value:
                prior['measurements_m'][key]=value;changed=True
        if changed:manifest.write_text(json.dumps(prior,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Existing video project verified; no extra source images were read.');return
    input_folder=out/'input';input_folder.mkdir(exist_ok=True)
    input_video=input_folder/source.name
    if input_video.resolve()!=source:
        if input_video.exists() and hashlib.sha256(input_video.read_bytes()).hexdigest()!=digest:raise ValueError('Input destination already contains another video.')
        shutil.copy2(source,input_video)
    count,duration=imageio_ffmpeg.count_frames_and_secs(str(source))
    fps=min(2.0,239.5/duration)
    frame_dir=out/'frames';frame_dir.mkdir(exist_ok=True)
    if list(frame_dir.glob('*.jpg')):raise ValueError('Unmanifested frame files already exist; use a fresh project directory.')
    command=[imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','info','-i',str(source),'-vf',f'showinfo@source,fps={fps},showinfo@sample','-q:v','2',str(frame_dir/'frame_%04d.jpg')]
    run=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
    if run.returncode:raise RuntimeError('Video extraction failed: '+run.stderr[-500:])
    timeline=parse_timeline(run.stderr,fps)
    frames=[]
    for path in sorted(frame_dir.glob('*.jpg')):
        number=int(path.stem.split('_')[-1]);rgb=np.asarray(Image.open(path).convert('RGB'));gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
        if number not in timeline:raise ValueError('Frame timestamp could not be traced to the source video.')
        frames.append({"id":f'f{number:04d}',"file":path.relative_to(out).as_posix(),"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),**timeline[number],"width":rgb.shape[1],"height":rgb.shape[0],"sharpness_laplacian_variance":round(float(cv2.Laplacian(gray,cv2.CV_64F).var()),2),"roles":["reconstruction"],"semantic_tags":[],"pose_status":"not_estimated"})
    for f in choose_structure_frames(frames):f['roles'].append('structure_reference')
    measurements={key:getattr(args,key) for key in ('length','width','height')}
    project={"schema_version":"video-room-project-2","input":{"type":"single_video","video":input_video.relative_to(out.parent).as_posix(),"video_sha256":digest,"extra_source_photos":0,"source_frame_count":count,"duration_seconds":duration},"measurements_m":measurements,"measurement_source":"conversation","sample_fps":fps,"frames":frames,"roles":{"reconstruction":[f['id'] for f in frames],"structure_reference":[f['id'] for f in frames if 'structure_reference' in f['roles']]},"camera_source_mapping":{"local_colmap":"pending","cloud_renamed_camera_files":"unverified"},"structure_policy":"Use video frames as evidence. Do not silently replace failed scan geometry with a measured rectangle."}
    manifest.write_text(json.dumps(project,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'structure_references.json').write_text(json.dumps([f for f in frames if 'structure_reference' in f['roles']],ensure_ascii=False,indent=2),encoding='utf-8')
    selected=choose_structure_frames(frames);cols=4;w,h=270,510
    sheet=Image.new('RGB',(cols*w,((len(selected)+cols-1)//cols)*h),'#101827');draw=ImageDraw.Draw(sheet)
    for i,f in enumerate(selected):
        x,y=i%cols*w,i//cols*h
        with Image.open(out/f['file']) as image:image.thumbnail((w-10,h-55));sheet.paste(image,(x+(w-image.width)//2,y))
        draw.text((x+8,y+h-45),f"{f['id']} | source {f['source_timestamp_seconds']:.3f}s",fill='white')
        draw.text((x+8,y+h-25),f"frame {f['source_frame_index']} | sharpness {f['sharpness_laplacian_variance']:.1f}",fill='#a5c2d5')
    sheet.save(out/'structure_contact_sheet.jpg',quality=93)
    print(json.dumps({'frames':len(frames),'structure_references':len(selected),'extra_photos':0,'video_frames_traced':len(timeline),'project':str(out)},ensure_ascii=False))


if __name__=='__main__':main()
