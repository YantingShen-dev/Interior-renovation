"""Build a measured-constraint room, with explicitly unverified opening candidates."""
from __future__ import annotations
from pathlib import Path
import base64
import json
import math
import subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"重建小样/room_editable_v1"


def initial_scene():
    walls=[]
    for id,label,start,end,outward in [
        ("wall_side_a","侧墙 A · 16 标识与小门",[0,0],[4,0],[0,-1]),
        ("wall_side_b","侧墙 B · 电梯侧",[0,1.8],[4,1.8],[0,1]),
        ("wall_window","窗户端墙",[0,0],[0,1.8],[-1,0]),
        ("wall_door_end","双扇门端墙",[4,0],[4,1.8],[1,0]),
    ]:
        walls.append({"id":id,"label":label,"kind":"wall","start":start,"end":end,"outward":outward,"height":3.0,"thickness":.08,"status":"user_dimension_constrained","thickness_status":"display_default_not_measured"})
    openings=[]
    for id,label,subtype,wall,u,width,height,angle,images in [
        ("door_stair","侧墙小门 · 候选","hinged","wall_side_a",.12,.85,2.20,0,["3.jpg"]),
        ("door_double","双扇门 · 候选","double_hinged","wall_door_end",.10,1.60,2.20,80,["1.jpg","2.jpg"]),
        ("door_lift_a","电梯门 A · 候选","elevator","wall_side_b",.65,1.0,2.18,0,["4.jpg"]),
        ("door_lift_b","电梯门 B · 候选","elevator","wall_side_b",2.25,1.0,2.18,0,["1.jpg"]),
    ]:
        openings.append({"id":id,"label":label,"kind":"door","subtype":subtype,"wall_id":wall,"u":u,"width":width,"bottom":0,"height":height,"open_angle_deg":angle,"status":"photo_assisted_candidate","dimensions_verified":False,"evidence_images":images,"evidence_note":"依据原始照片与校正后的扫描立面辅助设置；位置、宽高和开启角度均需确认。电梯侧扫描有明显变形，候选未作为自动测量结果。"})
    openings.append({"id":"window_end","label":"窗户组合 · 候选","kind":"window","subtype":"assembly","wall_id":"wall_window","u":.05,"width":1.74,"bottom":.34,"height":2.56,"status":"scan_frame_candidate_photo_reviewed","dimensions_verified":False,"evidence_images":["3.jpg","4.jpg"],"evidence_note":"网格窗框/栏杆暗色点候选约 6845 个，结合照片确认窗户语义。边界有残缺，宽高待复测，内部分格仅作示意。"})
    return {"schema_version":"room-pilot-1","units":"meter","coordinate_system":"RH_Z_UP","origin":"window_end_side_a_floor","room":{"length":4.0,"width":1.8,"height":3.0,"dimension_source":"user_confirmed_interior_measurements","height_confirmed":True},"walls":walls,"openings":openings,"provenance":{"creation_date":"2026-10-28","model_type":"measured_constraint_structural_draft","auto_extraction_claim":False,"room_orientation":"mesh_plane_families_with_visual_floor_ceiling_window_confirmation","scan_horizontal_validation_passed":False,"scan_transform_reference":"cleanup_report.json","opening_review":"all_opening_dimensions_require_confirmation","default_wall_thickness_m":.08,"wall_thickness_measured":False,"source_scan":"../kiri_3dgs_images/unpacked/3DModel.glb","preserve_original_scan":True}}


def vertices(box):
    v=np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],dtype=float)*np.array(box["size"])/2
    a=box.get("yaw",0);r=np.array([[math.cos(a),-math.sin(a),0],[math.sin(a),math.cos(a),0],[0,0,1]])
    return v@r.T+box["center"]


def font(size):
    path=Path("C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path),size) if path.exists() else ImageFont.load_default()


def render_review(scene,parts,scan):
    image=Image.new("RGB",(2200,1020),"#eef2f5");draw=ImageDraw.Draw(image)
    yaw=-.78;pitch=.68;right=np.array([math.cos(yaw),math.sin(yaw),0]);fwd=np.array([-math.sin(yaw),math.cos(yaw),0]);up=-math.sin(pitch)*fwd+np.array([0,0,math.cos(pitch)]);depth=math.cos(pitch)*fwd+np.array([0,0,math.sin(pitch)])
    center=np.array([2,.9,1.5]);scale=162
    def project(p,column):
        relative=np.asarray(p)-center
        return np.column_stack([relative@right*scale+550+column*1100,-relative@up*scale+540,relative@depth])
    draw.text((40,24),"方向校正与结构草模",font=font(32),fill="#1d394c")
    draw.text((50,95),"保守清理后的扫描",font=font(24),fill="#405e72")
    draw.text((1150,95),"按实测尺寸建立的可编辑草模",font=font(24),fill="#405e72")
    order=np.argsort(scan[:,0]*depth[0]+scan[:,1]*depth[1]+scan[:,2]*depth[2]);xy=project(scan[:,:3],0)
    for i in order:
        x,y=xy[i,:2]
        if 20<x<1080 and 145<y<910:draw.ellipse((x-1.3,y-1.3,x+1.3,y+1.3),fill=tuple(scan[i,3:].astype(int)))
    wall_map={w["id"]:w for w in scene["walls"]};faces=[]
    quads=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    for part in parts:
        if part["role"]=="ceiling":continue
        w=wall_map.get(part["parent"])
        if w and np.dot(w["outward"],depth[:2])>.02:continue
        for box in part["boxes"]:
            v=vertices(box)
            for q in quads:
                p=v[q];normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=np.linalg.norm(normal)
                shade=.72+.28*max(0,normal[2]*.8-normal[0]*.3-normal[1]*.25)
                rgb=tuple(round(x*255*shade) for x in part["color"][:3])
                projected=project(p,1)
                faces.append((projected[:,2].mean(),projected[:,:2],rgb,part["color"][3]))
    for _,p,rgb,alpha in sorted(faces,key=lambda x:x[0]):
        polygon=[tuple(v) for v in p]
        if alpha<1:rgb=tuple(round(v*alpha+238*(1-alpha)) for v in rgb)
        draw.polygon(polygon,fill=rgb,outline="#6b8597")
    draw.line((1100,155,1100,910),fill="#c6d3dc",width=2)
    draw.text((60,925),"统一比例按层高 3 m 定标；扫描仍有局部变形。",font=font(22),fill="#5c7180")
    draw.text((1160,925),"4.00 × 1.80 × 3.00 m；门窗均为待确认候选。",font=font(22),fill="#5c7180")
    image.save(OUT/"cleanup_and_editable_review.png")


def render_plan(scene,parts):
    width,height=1100,740;scale=200;origin=np.array([120,540])
    def to_px(p):return np.asarray(p)*[scale,-scale]+origin
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">','<rect width="100%" height="100%" fill="#f6f8fa"/>','<style>text{font-family:Microsoft YaHei,sans-serif;fill:#28465c}</style>','<text x="60" y="55" font-size="27">室内平面草模 · 门窗候选待确认</text>']
    image=Image.new("RGB",(width,height),"#f6f8fa");draw=ImageDraw.Draw(image);draw.text((60,25),"室内平面草模 · 门窗候选待确认",font=font(27),fill="#28465c")
    for part in parts:
        if part["role"]=="ceiling":continue
        color=tuple(round(v*255) for v in part["color"][:3]);hexc='#'+''.join(f'{v:02x}' for v in color)
        svg.append(f'<g id="{part["id"]}" data-parent="{part["parent"]}">')
        for box in part["boxes"]:
            if part["role"]!='floor' and not box["center"][2]-box["size"][2]/2<=1.0<=box["center"][2]+box["size"][2]/2:continue
            xy=to_px(vertices(box)[:4,:2]);polygon=[tuple(v) for v in xy]
            draw.polygon(polygon,fill=color,outline="#456174")
            points=' '.join(f'{x:.2f},{y:.2f}' for x,y in xy)
            svg.append(f'<polygon points="{points}" fill="{hexc}" stroke="#456174" stroke-width="1"/>')
        svg.append('</g>')
    labels=[(480,590,"4.00 m"),(22,345,"1.80 m"),(120,655,"层高 3.00 m · 墙厚为模型显示默认值 · 门窗位置和尺寸需复核")]
    for x,y,text in labels:
        draw.text((x,y),text,font=font(21 if y<620 else 17),fill="#28465c")
        svg.append(f'<text x="{x}" y="{y+22}" font-size="{21 if y<620 else 17}">{text}</text>')
    annotation=[(275,118,"电梯门 A 候选",(350,175)),(605,118,"电梯门 B 候选",(670,175)),(165,613,"小门候选",(229,545)),(940,315,"双扇门候选",(925,365)),(15,260,"窗候选",(115,320))]
    for x,y,text,target in annotation:
        draw.text((x,y),text,font=font(17),fill="#28465c")
        end=(x+30,y+22)
        draw.line((target,end),fill="#8095a5",width=1)
        svg.append(f'<text x="{x}" y="{y+18}" font-size="17">{text}</text><path d="M{target[0]} {target[1]}L{end[0]} {end[1]}" fill="none" stroke="#8095a5"/>')
    draw.line((120,570,920,570),fill="#456174",width=2)
    draw.line((90,180,90,540),fill="#456174",width=2)
    svg+=['<path d="M120 570H920 M90 180V540" fill="none" stroke="#456174"/>','</svg>']
    (OUT/"editable_plan.svg").write_text('\n'.join(svg),encoding="utf-8")
    image.save(OUT/"editable_plan.png")


def main():
    scene_path=OUT/"room.scene.json"
    if not scene_path.exists():scene_path.write_text(json.dumps(initial_scene(),ensure_ascii=False,indent=2),encoding="utf-8")
    scene=json.loads(scene_path.read_text(encoding="utf-8"))
    scene['provenance'].setdefault('initial_user_confirmed_interior_dimensions_m',[4.0,1.8,3.0])
    scene_path.write_text(json.dumps(scene,ensure_ascii=False,indent=2),encoding="utf-8")
    subprocess.run(['node',str(ROOT/"scripts/export_room_model.cjs"),str(scene_path),str(OUT/"editable_room.glb"),str(OUT/"structure_parts.json")],check=True)
    points=json.loads((OUT/"cleaned_points.json").read_text())
    geometry=(ROOT/"scripts/furniture_geometry.js").read_text(encoding="utf-8")+'\n'+(ROOT/"scripts/room_geometry.js").read_text(encoding="utf-8")
    template=(ROOT/"scripts/room_editor_template.html.in").read_text(encoding="utf-8")
    photos={p.name:'data:image/jpeg;base64,'+base64.b64encode(p.read_bytes()).decode('ascii') for p in (ROOT/"现场素材/照片").glob('*.jpg')}
    html=template.replace('__GEOMETRY__',geometry).replace('__SCENE__',json.dumps(scene,ensure_ascii=False).replace('</','<\\/')).replace('__SCAN__',json.dumps(points)).replace('__PHOTOS__',json.dumps(photos))
    (OUT/"房间编辑器.html").write_text(html,encoding="utf-8")
    (ROOT/"打开房间编辑器.html").write_text(html,encoding="utf-8")
    parts=json.loads((OUT/"structure_parts.json").read_text())
    render_review(scene,parts,np.asarray(points))
    render_plan(scene,parts)
    print('Editable scene, offline editor, GLB and plan exported.')


if __name__=="__main__":main()
