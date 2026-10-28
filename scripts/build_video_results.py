"""Build a standalone video-only results page; all geometry/data is embedded."""
from pathlib import Path
import argparse,json,os,subprocess

ROOT=Path(__file__).resolve().parents[1]


def read(path,default=None):return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def build(project,destination):
    manifest=read(project/'project.json');cloud=project/'cloud';structure=read(project/'structure/aligned_planes.json') or read(project/'structure/reviewed_planes.json') or read(project/'structure/observed_planes.json')
    report=read(project/'local/sparse/reconstruction_report.json',{})
    worker=read(cloud/'worker_state.json',{});surface=read(project/'structure/cleaned_sample.json') or read(project/'structure/aligned_sample.json') or read(cloud/'surface_sample.json')
    local=read(project/'local/sparse/preview_data.json',{'points':[]})
    def url(path):return Path(os.path.relpath(path,destination.parent)).as_posix()
    evidence=read(project/'structure_evidence.json',{'observations':[]});reviewed={f['frame_id']:f for f in evidence['observations']}
    refs=[]
    for f in manifest['frames']:
        if 'structure_reference' not in f['roles'] and f['id'] not in reviewed:continue
        obs=reviewed.get(f['id'],{})
        refs.append({'id':f['id'],'url':url(project/f['file']),'seconds':f['source_timestamp_seconds'],'source_frame_index':f['source_frame_index'],
            'tags':obs.get('visible_objects',[]),'note':obs.get('note','自动选出的清晰参考帧，待结构标注。')})
    cloud_status={'cloud_failed':'云端失败','cloud_processing':'云端处理中','downloading':'云端完成，正在下载','inspecting':'扫描检查中','model_ready':'云端网格已返回','analysis_ready':'云端与平面分析完成'}.get(worker.get('phase'),'云端尚未开始或等待续跑')
    count=len(structure['planes']) if structure else 0
    status=[f"本地 {len(report.get('models',[]))} 个独立片段",cloud_status,f"{count} 个扫描平面候选"]
    finding='本地点云还未形成完整房间；等待本轮云端扫描返回后提取平面。'
    if structure:finding=f'已从本轮纯视频网格拟合 {count} 个观测平面片，导出为独立对象；尚未恢复经核验的三维门窗开口。'
    dim=manifest['measurements_m'];dimension_note='尺寸记录：'+'，'.join(f"{label} {dim[key]} 米" if dim[key] is not None else f'{label}待确认' for key,label in [('length','长'),('width','净宽'),('height','层高')])+'。当前扫描未完成尺寸定标；页面没有以实测矩形替代扫描结果。'
    alignment=read(project/'structure/alignment_report.json')
    if alignment:
        dimension_note=f"已按地板和顶面候选，将方向摆正并暂以 {alignment['known_height_m']} 米层高统一缩放。长 {dim['length']} 米、净宽 {dim['width']} 米仍未通过独立核验；地板观测范围约 "+f"{alignment['floor_observed_2_98_percentile_spans_m'][0]:.2f} × {alignment['floor_observed_2_98_percentile_spans_m'][2]:.2f} 米，包含残缺或变形区域，不能当成室内净尺寸。"
    links=[]
    for path,label in [(project/'vector_room/房间编辑器.html','打开完整矢量房间'),(project/'vector_room/editable_room.glb','完整矢量房间 GLB'),(project/'vector_room/vector_plan.svg','矢量平面图 SVG'),(project/'project.json','帧来源与尺寸元数据'),(project/'frame_pose_links.json','视频帧与本地点云对应'),(project/'local/sparse/点云预览.html','本地点云'),(cloud/'点云预览.html','原始扫描采样'),(cloud/'unpacked/3DModel.glb','本轮原始扫描 GLB'),(project/'structure/cleaned_aligned_scan.glb','初步清理并摆正的扫描'),(project/'structure/aligned_planes.json','已摆正平面 JSON'),(project/'structure/aligned_planes.glb','已摆正平面 GLB'),(project/'structure/observed_planes.json','原坐标扫描平面 JSON'),(project/'structure/observed_planes.glb','原坐标扫描平面 GLB'),(project/'structure/textured_plane_overview.jpg','实际贴图平面投影'),(project/'structure/alignment_report.json','方向与尺寸核对'),(project/'structure/plane_overview.jpg','平面候选总览')]:
        if path.exists():links.append({'url':url(path),'label':label})
    points=(surface or local)['points'];stride=max(1,len(points)//10000)
    result={'duration':manifest['input']['duration_seconds'],'frame_count':len(manifest['frames']),'references':refs,'video_url':url(project.parent/manifest['input']['video']),
        'status':status,'finding':finding,'dimension_note':dimension_note,'links':links,'structure':structure,'points':points[::stride],'provisionally_aligned':bool(alignment),
        'plane_previews':{p['id']:url(project/'structure'/(p['id']+'_texture.jpg')) for p in structure['planes'] if (project/'structure'/(p['id']+'_texture.jpg')).exists()} if structure else {}}
    template=(ROOT/'scripts/video_results_template.html.in').read_text(encoding='utf-8')
    output=template.replace('__RESULT_DATA__',json.dumps(result,ensure_ascii=False).replace('</','<\\/'))
    if '__RESULT_DATA__' in output:raise ValueError('Unresolved result data.')
    destination.write_text(output,encoding='utf-8')
    print(str(destination))


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();project=args.project.resolve()
    build(project,project/'单视频结果.html');build(project,ROOT/'扫描重建与证据.html')
    if (project/'furniture_layout/room.scene.json').exists():
        subprocess.run(['node',str(ROOT/'scripts/studio/build.cjs'),str(project)],check=True)
    elif (project/'vector_room/room.scene.json').exists():
        from build_video_room import write_editor
        write_editor(project,ROOT/'打开单视频结果.html')
    else:build(project,ROOT/'打开单视频结果.html')


if __name__=='__main__':main()
