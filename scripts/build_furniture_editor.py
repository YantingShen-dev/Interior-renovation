"""Build the offline furniture workbench using the current room; no provider calls."""
from pathlib import Path
import argparse,json,subprocess,os,html

ROOT=Path(__file__).resolve().parents[1]


def build(project,demo=False):
    out=project/'furniture_layout';out.mkdir(exist_ok=True);plan=out/'room.scene.json'
    if not plan.exists():
        scene=json.loads((project/'vector_room/room.scene.json').read_text(encoding='utf-8'))
        scene.update({'furniture':[],'assets':[],'layout_settings':{'clearance_m':.8,'scenario':'test_area_function_verification'}})
        scene['provenance']['furniture_stage']='dimension_placeholders_no_image_to_3d_provider_used'
        if demo:
            L,W=scene['room']['length'],scene['room']['width']
            if L<3 or W<1.6:raise ValueError('The test desk/chair preset needs a larger room; build without --demo.')
            x=L/2
            for identifier,label,asset,dimensions,position,rotation in [
                ('test_desk','测试办公桌','desk',[1.2,.6,.75],[x,.35,0],0),
                ('test_chair','测试办公椅','chair',[.55,.55,.9],[x,1.0,0],180)]:
                scene['furniture'].append({'id':identifier,'label':label,'kind':'furniture','asset_id':asset,'dimensions':dimensions,'position':position,'rotation_deg':rotation,'mount':'floor','dimension_source':'preset_unverified','purpose':'test_layout_not_final_office_plan'})
        plan.write_text(json.dumps(scene,ensure_ascii=False,indent=2),encoding='utf-8')
    scene=json.loads(plan.read_text(encoding='utf-8'));current=json.loads((project/'project.json').read_text(encoding='utf-8'))
    if scene['provenance']['source_video_sha256']!=current['input']['video_sha256']:raise ValueError('Furniture plan belongs to another source video.')
    subprocess.run(['node',str(ROOT/'scripts/export_room_model.cjs'),str(plan),str(out/'furnished_room.glb'),str(out/'structure_parts.json')],check=True)
    from build_video_room import render
    render(scene,json.loads((out/'structure_parts.json').read_text(encoding='utf-8')),out,mode='furniture')
    template=(ROOT/'scripts/furniture_editor_template.html.in').read_text(encoding='utf-8')
    for destination in [out/'家具布置.canvas.html']:
        room_url=Path(os.path.relpath(project/'vector_room/房间编辑器.html',destination.parent)).as_posix()
        content=template.replace('__ROOM_URL__',html.escape(room_url,quote=True)).replace('__FURNITURE_GEOMETRY__',(ROOT/'scripts/furniture_geometry.js').read_text(encoding='utf-8')).replace('__ROOM_GEOMETRY__',(ROOT/'scripts/room_geometry.js').read_text(encoding='utf-8')).replace('__SCENE__',json.dumps(scene,ensure_ascii=False).replace('</','<\\/')).replace('__EDITOR_CODE__',(ROOT/'scripts/furniture_editor.js').read_text(encoding='utf-8'))
        if any(token in content for token in ['__ROOM_URL__','__FURNITURE_GEOMETRY__','__ROOM_GEOMETRY__','__SCENE__','__EDITOR_CODE__']):raise ValueError('Furniture editor has unresolved build data.')
        destination.write_text(content,encoding='utf-8')
    subprocess.run(['node',str(ROOT/'scripts/studio/build.cjs'),str(project)],check=True)
    print(json.dumps({'furniture':len(scene['furniture']),'custom_assets':len(scene['assets']),'provider_calls':0,'entry':str(ROOT/'打开家具布置.html')},ensure_ascii=False))


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);p.add_argument('--demo',action='store_true');args=p.parse_args();build(args.project.resolve(),args.demo)


if __name__=='__main__':main()
