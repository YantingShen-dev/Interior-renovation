"""Build an offline, dependency-free viewer of measured COLMAP sparse points."""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


TEMPLATE = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>空间重建小样 · 稀疏点云</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0d1420;color:#e7edf6;font:14px system-ui,"Microsoft YaHei",sans-serif}header{padding:20px 26px;border-bottom:1px solid #293346}h1{font-size:22px;margin:0 0 8px}p{color:#adbdcf;margin:6px 0;line-height:1.7}.row{display:flex;gap:18px;padding:18px 26px;align-items:center;flex-wrap:wrap}button{background:#203b53;color:#e7f7ff;border:1px solid #46718e;padding:8px 14px;border-radius:7px;cursor:pointer}canvas{display:block;width:100%;height:68vh;touch-action:none}label{cursor:pointer}.note{max-width:1100px;margin:auto;padding:16px 26px}a{color:#8dc7f0}.status{color:#e7c088}</style>
<header><h1>现有素材重建小样</h1><p id="stats"></p><p class="status" id="status">稀疏重建 · 未定标 · 非完整墙体模型</p></header>
<div class="row">__SELECT__<button id="reset">重置视角</button><button id="xy">XY 投影</button><button id="xz">XZ 投影</button><button id="yz">YZ 投影</button><label><input id="cams" type="checkbox" checked> 相机位置</label><span>拖动旋转 · 滚轮缩放</span></div>
<canvas id="view"></canvas>
<div class="note"><p id="origin">这些点来自照片之间的特征匹配与三角测量。空白区域表示没有恢复到足够几何，不等于该处没有墙或物体。坐标轴尚未与房间方向对齐，点云尺寸没有强行套用 4 米 × 1.8 米。</p><p id="camera-note">青色点和连线表示视频相机位置的估计；照片相机单独标记。相机和点云可能存在局部错误，需对照素材判断。</p><p><a href="reconstruction_report.json">重建指标</a> · <a href="../video_contact_sheet.jpg">视频抽帧总览</a></p></div>
<script>const scene=__DATA__;const canvas=document.querySelector('#view'),ctx=canvas.getContext('2d');
document.querySelector('#stats').textContent=`参与本模型的视角 ${scene.cameras.length} 个 · 预览筛选点 ${scene.points.length} 个 · 坐标单位尚未确定`;
if(scene.kind==='surface_sample'){document.querySelector('#stats').textContent=`网格表面采样 ${scene.points.length} 个点 · 尺寸尚未验证`;document.querySelector('#status').textContent='云端网格表面预览 · 未定标 · 尚未提取墙体语义';document.querySelector('#origin').textContent='这些点采样自云端返回的三角网格，用于查看几何外形。显示颜色为材质的近似采样，原始模型另行保留。坐标与真实尺寸仍需核对，没有强行套用 4 米 × 1.8 米。';document.querySelector('#camera-note').textContent='压缩包内含相机记录，但其与 GLB 的坐标变换尚待核对；该预览暂不显示相机路径。'}
let coords=scene.points.map(p=>p.slice(0,3));const sorted=[0,1,2].map(k=>coords.map(p=>p[k]).sort((a,b)=>a-b));const lo=sorted.map(a=>a[Math.floor(a.length*.01)]),hi=sorted.map(a=>a[Math.floor(a.length*.99)]);const center=lo.map((v,k)=>(v+hi[k])/2);const extent=Math.max(...hi.map((v,k)=>v-lo[k]),.001);let yaw=.6,pitch=-.35,zoom=1,drag=null;
function project(p){let [x,y,z]=p.map((v,k)=>(v-center[k])/extent);let a=x*Math.cos(yaw)+z*Math.sin(yaw),b=-x*Math.sin(yaw)+z*Math.cos(yaw),c=y*Math.cos(pitch)-b*Math.sin(pitch),d=y*Math.sin(pitch)+b*Math.cos(pitch);return [canvas.width/2+a*canvas.height*.8*zoom,canvas.height/2+c*canvas.height*.8*zoom,d]}
function draw(){const dpr=devicePixelRatio||1;const r=canvas.getBoundingClientRect();canvas.width=r.width*dpr;canvas.height=r.height*dpr;ctx.fillStyle='#0d1420';ctx.fillRect(0,0,canvas.width,canvas.height);let ps=scene.points.filter(p=>p.slice(0,3).every((v,k)=>v>=lo[k]&&v<=hi[k])).map(p=>({v:project(p.slice(0,3)),c:p.slice(3)}));ps.sort((a,b)=>a.v[2]-b.v[2]);for(const p of ps){ctx.fillStyle=`rgb(${p.c.map(v=>Math.min(255,v*1.15+15)).join(',')})`;ctx.fillRect(p.v[0],p.v[1],2*dpr,2*dpr)}if(document.querySelector('#cams').checked){let prev=null;const cams=[...scene.cameras].sort((a,b)=>a.image.localeCompare(b.image));for(const c of cams){let v=project(c.position),isVideo=c.image.startsWith('video/');ctx.strokeStyle='#55c5c4';if(isVideo&&prev){ctx.beginPath();ctx.moveTo(prev[0],prev[1]);ctx.lineTo(v[0],v[1]);ctx.stroke()}ctx.fillStyle=isVideo?'#55e0dc':'#ffa65a';ctx.beginPath();ctx.arc(v[0],v[1],3*dpr,0,Math.PI*2);ctx.fill();prev=isVideo?v:null}}}
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;pitch+=(e.clientY-drag[1])*.008;drag=[e.clientX,e.clientY];draw()};canvas.onpointerup=()=>drag=null;canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.1,Math.min(12,zoom*Math.exp(-e.deltaY*.001)));draw()};document.querySelector('#reset').onclick=()=>{yaw=.6;pitch=-.35;zoom=1;draw()};document.querySelector('#xy').onclick=()=>{yaw=0;pitch=0;draw()};document.querySelector('#xz').onclick=()=>{yaw=0;pitch=Math.PI/2;draw()};document.querySelector('#yz').onclick=()=>{yaw=Math.PI/2;pitch=0;draw()};document.querySelector('#cams').onchange=draw;window.onresize=draw;draw();</script></html>'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sparse", type=Path, default=Path(__file__).resolve().parents[1] / "重建小样" / "local_v1" / "sparse")
    parser.add_argument("--data", default="preview_data.json")
    parser.add_argument("--contact-sheet")
    args = parser.parse_args()
    sparse = args.sparse.resolve()
    data = json.loads((sparse / args.data).read_text(encoding="utf-8"))
    fragments = data.pop("fragments",[])
    if not data["points"]:
        raise SystemExit("No filtered points available for preview.")
    scenes = [data,*fragments]
    files = ["点云预览.html",*[f"fragment_{s['model_id']}.html" for s in fragments]]
    for selected,(scene,filename) in enumerate(zip(scenes,files)):
        options = "".join(f'<option value="{html.escape(name)}" {"selected" if i == selected else ""}>片段 {s["model_id"]} · {len(s["cameras"])} 个视角</option>' for i,(s,name) in enumerate(zip(scenes,files)))
        selector = f'<label>独立片段 <select onchange="location.href=this.value">{options}</select></label>'
        if scene.get("kind")=="surface_sample":
            selector = '<span>云端网格的表面采样</span>'
        content = TEMPLATE.replace("__SELECT__",selector).replace("__DATA__",json.dumps(scene,ensure_ascii=False).replace("</","<\\/"))
        if scene.get("kind")=="surface_sample":
            content = content.replace('href="reconstruction_report.json"','href="mesh_report.json"').replace('href="../video_contact_sheet.jpg"','href="../local_v2/video_contact_sheet.jpg"')
        if args.contact_sheet:
            content=content.replace('href="../local_v2/video_contact_sheet.jpg"','href="'+html.escape(args.contact_sheet,quote=True)+'"').replace('href="../video_contact_sheet.jpg"','href="'+html.escape(args.contact_sheet,quote=True)+'"')
        (sparse / filename).write_text(content,encoding="utf-8")
    xyz = np.array([p[:3] for p in data["points"]])
    colors = np.array([p[3:] for p in data["points"]])
    camera_xyz = np.array([c["position"] for c in data["cameras"]])
    lo, hi = np.quantile(xyz, [.01, .99], axis=0)
    mask = ((xyz >= lo) & (xyz <= hi)).all(axis=1)
    canvas = Image.new("RGB", (1800, 710), "#0d1420")
    draw = ImageDraw.Draw(canvas)
    title = "CLOUD MESH SURFACE SAMPLE" if data.get("kind")=="surface_sample" else "COLMAP SPARSE RECONSTRUCTION"
    draw.text((25,15), title+" | NOT METRIC | 1%-99% DISPLAY CLIP", fill="white")
    for n, (a,b,label) in enumerate([(0,1,"XY"),(0,2,"XZ"),(2,1,"ZY")]):
        center = (lo + hi)/2
        scale = 490 / max(hi[a]-lo[a],hi[b]-lo[b],1e-8)
        def pixel(p):
            return (n*600+300+(p[a]-center[a])*scale,365+(p[b]-center[b])*scale)
        draw.text((n*600+25,55),f"{label} | {len(xyz)} filtered points",fill="#a8c4df")
        for p,c in zip(xyz[mask],colors[mask]):
            x,y=pixel(p)
            draw.ellipse((x,y,x+2,y+2),fill=tuple(int(min(255,v*1.15+15)) for v in c))
        for p in camera_xyz:
            x,y=pixel(p)
            if n*600<x<(n+1)*600 and 85<y<660:
                draw.ellipse((x-2,y-2,x+2,y+2),fill="#55dedd")
    draw.text((25,680), "Cyan = estimated cameras. Empty regions were not reconstructed. Axes are not room-aligned.",fill="#a8c4df")
    canvas.save(sparse / "pointcloud_projections.jpg",quality=92)
    print(sparse / "点云预览.html")


if __name__ == "__main__":
    main()
