"""Create an editable room from measured constraints and video-assisted layout review."""
from pathlib import Path
import argparse,base64,json,math,subprocess,os,html
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]


def read(path):return json.loads(path.read_text(encoding='utf-8'))


def create_scene(project):
    manifest=read(project/'project.json');dimensions=manifest['measurements_m'];L,W,H=[dimensions[k] for k in ('length','width','height')]
    if not all(v is not None and v>0 for v in (L,W,H)):raise ValueError('A measured length, width and height are required for this room outline.')
    walls=[]
    for identifier,label,start,end,outward in [
        ('wall_side_a','侧墙 A · 小门侧',[0,0],[L,0],[0,-1]),
        ('wall_side_b','侧墙 B · 电梯侧',[0,W],[L,W],[0,1]),
        ('wall_window','窗端墙',[0,0],[0,W],[-1,0]),
        ('wall_door_end','防火门端墙',[L,0],[L,W],[1,0])]:
        walls.append({'id':identifier,'label':label,'kind':'wall','start':start,'end':end,'outward':outward,'height':H,'thickness':.08,
            'status':'user_dimension_constrained','thickness_status':'display_default_not_measured'})
    layout=read(project/'room_layout.review.json') if (project/'room_layout.review.json').exists() else {'openings':[]}
    if layout.get('source_video_sha256',manifest['input']['video_sha256'])!=manifest['input']['video_sha256']:raise ValueError('Layout review belongs to another video.')
    frame_map={f['id']:f for f in manifest['frames']};openings=[]
    for source in layout['openings']:
        o={k:v for k,v in source.items() if k not in ('note','evidence_frames')}
        refs=[frame_map[fid] for fid in source['evidence_frames']]
        o.update({'status':'video_assisted_unverified_candidate','dimensions_verified':False,'placement_verified':False,
            'parameter_source':'assistant_visual_estimate_not_automatic_scan_measurement','evidence_images':[Path(f['file']).name for f in refs],
            'evidence_frames':[{'frame_id':f['id'],'source_timestamp_seconds':f['source_timestamp_seconds'],'sha256':f['sha256']} for f in refs],
            'evidence_note':source['note']+' 来源时间：'+'、'.join(f"{f['source_timestamp_seconds']:.3f} 秒" for f in refs)+'。'})
        openings.append(o)
    return {'schema_version':'room-pilot-1','units':'meter','coordinate_system':'RH_Z_UP','origin':'window_end_side_a_floor',
        'room':{'length':L,'width':W,'height':H,'dimension_source':'user_confirmed_interior_measurements','height_confirmed':True},
        'walls':walls,'openings':openings,'provenance':{'model_type':'video_assisted_measured_constraint_vector_room',
            'input_type':'single_video','source_video_sha256':manifest['input']['video_sha256'],'extra_source_photos':0,
            'initial_user_confirmed_interior_dimensions_m':[L,W,H],'auto_extraction_claim':False,'scan_horizontal_validation_passed':False,
            'geometry_basis':'Room boundary from user measurements; opening types and relative layout reviewed from video. Opening numeric parameters are manual unverified estimates.',
            'default_wall_thickness_m':.08,'wall_thickness_measured':False,'scan_overlay_registered':False}}


def write_editor(project,destination):
    scene=read(project/'vector_room/room.scene.json');manifest=read(project/'project.json');frames={Path(f['file']).name:f for f in manifest['frames']}
    photos={}
    for name in sorted({n for o in scene['openings'] for n in o.get('evidence_images',[])}):
        photos[name]='data:image/jpeg;base64,'+base64.b64encode((project/frames[name]['file']).read_bytes()).decode('ascii')
    template=(ROOT/'scripts/room_editor_template.html.in').read_text(encoding='utf-8')
    template=template.replace('<title>房间结构校正</title>','<title>可编辑矢量房间</title>').replace('<h1>房间结构校正</h1>','<h1>可编辑矢量房间</h1>')
    template=template.replace('实测尺寸建立轮廓 · 扫描辅助定位 · 门窗候选待确认','4 面墙、地板、顶面与独立门窗 · 实测轮廓 · 视频辅助布局')
    furniture_url=html.escape(Path(os.path.relpath(project/'furniture_layout/家具布置.html',destination.parent)).as_posix(),quote=True)
    template=template.replace('<div class="badge" id="roomBadge"></div>','<a href="'+furniture_url+'" style="color:#c9f4e9;border:1px solid #73988e;border-radius:5px;padding:8px 14px;text-decoration:none">开始摆家具 →</a><div class="badge" id="roomBadge"></div>')
    template=template.replace('查看来源照片','查看视频来源帧').replace('来源照片 ','视频来源帧 ')
    template=template.replace('<input id="showScan" type="checkbox"> 扫描对照','<input id="showScan" type="checkbox" disabled> 扫描对齐待完成')
    template=template.replace('门窗存在依据照片辅助估计的参数，当前未逐项量测。扫描对照采用统一比例，没有按长宽单独拉伸；它与规则轮廓之间的偏差会直接显示。','房间净尺寸采用你确认的实测值。门窗的类型和相对位置参考视频，数值为待确认估计，可在左侧直接修正。该结构模型尚未与变形扫描可靠配准。')
    old='扫描高度已按 3 米作统一比例校正，对侧表面检测宽度约 1.64–2.34 米，未通过 1.8 米净宽核验。当前规则房间是实测约束草模，门窗支持修改和替换。颜色用于区分构件，尚未恢复装修材质。'
    scan_link=html.escape(Path(os.path.relpath(project/'单视频结果.html',destination.parent)).as_posix(),quote=True)
    template=template.replace(old,'这是尺寸约束与视频辅助建立的矢量房间。墙体有真实开口，门窗可独立修改、删除和新增；JSON 可继续编辑，GLB 保留构件节点。门窗尺寸待确认，颜色为示意。 <a href="'+scan_link+'">查看扫描与视频证据</a>')
    geometry=(ROOT/'scripts/furniture_geometry.js').read_text(encoding='utf-8')+'\n'+(ROOT/'scripts/room_geometry.js').read_text(encoding='utf-8')
    template=template.replace('__GEOMETRY__',geometry).replace('__SCENE__',json.dumps(scene,ensure_ascii=False).replace('</','<\\/')).replace('__SCAN__','[]').replace('__PHOTOS__',json.dumps(photos))
    if any(token in template for token in ('__GEOMETRY__','__SCENE__','__SCAN__','__PHOTOS__')):raise ValueError('Editor data was not embedded.')
    destination.write_text(template,encoding='utf-8')


def font(size):return ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)


def box_vertices(box):
    points=np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]])*np.array(box['size'])/2
    a=box.get('yaw',0);r=np.array([[math.cos(a),-math.sin(a),0],[math.sin(a),math.cos(a),0],[0,0,1]])
    return points@r.T+box['center']


def render(scene,parts,out,mode='room'):
    L,W,H=[scene['room'][k] for k in ('length','width','height')];yaw=-.78;pitch=.68
    right=np.array([math.cos(yaw),math.sin(yaw),0]);forward=np.array([-math.sin(yaw),math.cos(yaw),0]);up=-math.sin(pitch)*forward+[0,0,math.cos(pitch)];depth=math.cos(pitch)*forward+[0,0,math.sin(pitch)]
    scale=min(1100/(L+W+1),650/(H+W+1));center=np.array([L/2,W/2,H/2]);walls={w['id']:w for w in scene['walls']};quads=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    image=Image.new('RGB',(1300,940),'#edf2f5');draw=ImageDraw.Draw(image)
    title='宜家家具测试摆放' if mode=='furniture' else '可编辑矢量房间'
    draw.text((50,30),title,font=font(34),fill='#1b3e4e');draw.text((50,86),f'{L:g} × {W:g} × {H:g} 米 · 门窗位置与尺寸待确认',font=font(22),fill='#647d8e')
    faces=[]
    for part in parts:
        if part['role']=='ceiling':continue
        opening=next((o for o in scene['openings'] if o['id']==part['parent']),None) if mode=='furniture' else None
        wall=walls.get(opening['wall_id'] if opening else part['parent'])
        if wall and np.dot(wall['outward'],depth[:2])>.02:continue
        for box in part['boxes']:
            vertices=box_vertices(box)
            for q in quads:
                xyz=vertices[q];n=np.cross(xyz[1]-xyz[0],xyz[2]-xyz[0]);n/=np.linalg.norm(n)
                shade=.72+.28*max(0,n[2]*.8-n[0]*.3-n[1]*.25);color=[v*255*shade for v in part['color'][:3]];alpha=part['color'][3]
                color=tuple(round(v*alpha+238*(1-alpha)) for v in color);relative=xyz-center
                layer=0 if part['role']=='floor' else 2 if mode=='furniture' and part['role']=='furniture' else 1
                xy=np.column_stack([relative@right*scale+650,-relative@up*scale+480]);faces.append((layer,float((relative@depth).mean()),xy,color))
    for _,_,xy,color in sorted(faces,key=lambda f:(f[0],f[1])):draw.polygon([tuple(p) for p in xy],fill=color,outline='#7a909d')
    draw.text((50,850),'桌椅与手推车使用官网尺寸简模，可拖动、旋转、改尺寸并随方案保存。' if mode=='furniture' else '4 面墙 + 地板 + 顶面 + 独立门窗；剖视仅隐藏前方墙，导出模型保留全部构件。',font=font(20),fill='#46616d')
    draw.text((50,889),'参考图和商品链接保存在家具库中；当前测试摆放不是最终办公室采购方案。' if mode=='furniture' else '轮廓来自实测尺寸，门窗参考视频辅助建模；未声称由扫描自动恢复完整房间。',font=font(18),fill='#6c838e');image.save(out/('furniture_preview.png' if mode=='furniture' else 'vector_room_preview.png'))
    scale=min(850/L,360/W);ox,oy=140,580
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">','<rect width="1200" height="760" fill="#f4f7f8"/>','<style>text{font-family:Microsoft YaHei,sans-serif;fill:#264c5d}</style>','<text x="60" y="55" font-size="28">矢量平面图 · 门窗候选待确认</text>']
    for part in parts:
        if part['role']=='ceiling':continue
        color='#'+''.join(f'{round(v*255):02x}' for v in part['color'][:3]);svg.append(f'<g id="{part["id"]}" data-parent="{part["parent"]}">')
        for box in part['boxes']:
            if part['role'] not in ('floor','furniture') and not box['center'][2]-box['size'][2]/2<=1<=box['center'][2]+box['size'][2]/2:continue
            xy=box_vertices(box)[:4,:2]*[scale,-scale]+[ox,oy];points=' '.join(f'{x:.2f},{y:.2f}' for x,y in xy)
            svg.append(f'<polygon points="{points}" fill="{color}" stroke="#456578"/>')
        svg.append('</g>')
    for x,y,text in [(ox+L*scale/2-40,oy+60,f'长 {L:g} m'),(35,oy-W*scale/2,f'宽 {W:g} m'),(60,700,f'净高 {H:g} m；墙厚为显示默认值；门窗数值可在编辑器修改。')]:svg.append(f'<text x="{x}" y="{y}" font-size="22">{html.escape(text)}</text>')
    svg.append('</svg>');(out/('furniture_plan.svg' if mode=='furniture' else 'vector_plan.svg')).write_text('\n'.join(svg),encoding='utf-8')


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();project=args.project.resolve();out=project/'vector_room';out.mkdir(exist_ok=True)
    scene_file=out/'room.scene.json'
    if not scene_file.exists():scene_file.write_text(json.dumps(create_scene(project),ensure_ascii=False,indent=2),encoding='utf-8')
    scene=read(scene_file)
    if scene['provenance']['source_video_sha256']!=read(project/'project.json')['input']['video_sha256']:raise ValueError('Saved room belongs to another video.')
    subprocess.run(['node',str(ROOT/'scripts/export_room_model.cjs'),str(scene_file),str(out/'editable_room.glb'),str(out/'structure_parts.json')],check=True)
    from build_furniture_editor import build as build_furniture
    build_furniture(project)
    write_editor(project,out/'房间编辑器.html')
    render(scene,read(out/'structure_parts.json'),out);print('Editable vector room, GLB, SVG and preview written.',flush=True)


if __name__=='__main__':main()
