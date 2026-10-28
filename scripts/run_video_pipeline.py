"""One video, optional conversational measurements, resumable reconstruction and plane fit."""
from pathlib import Path
import argparse,json,subprocess,sys

ROOT=Path(__file__).resolve().parents[1]


def run(script,*args):
    subprocess.run([sys.executable,'-u',str(ROOT/'scripts'/script),*[str(v) for v in args]],cwd=ROOT,check=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--video',type=Path,required=True);p.add_argument('--project',type=Path,required=True)
    for name in ('length','width','height'):p.add_argument('--'+name,type=float)
    p.add_argument('--cloud',action='store_true',help='Submit one KIRI scan if needed; requires locally configured key and available credits.')
    args=p.parse_args();project=args.project.resolve();measurements=[]
    for key in ('length','width','height'):
        value=getattr(args,key)
        if value is not None:
            if value<=0:raise ValueError('Measurements must be positive.')
            measurements.extend(['--'+key,value])
    run('prepare_video_project.py','--video',args.video.resolve(),'--project',project,*measurements)
    sparse=project/'local/sparse'
    if not (sparse/'reconstruction_report.json').exists():
        try:
            run('reconstruct_local.py','--sample',project/'local','--images-dir',project/'frames','--video-only','--project',project/'project.json')
        except subprocess.CalledProcessError:
            if not args.cloud:raise
            print('Local COLMAP reconstruction failed; continuing the explicitly requested KIRI cloud reconstruction.',flush=True)
    run('link_video_evidence.py','--project',project)
    if (sparse/'preview_data.json').exists():
        run('build_preview.py','--sparse',sparse,'--contact-sheet','../../structure_contact_sheet.jpg')
    run('build_video_results.py','--project',project)
    cloud=project/'cloud'
    if args.cloud:
        if not (cloud/'task.json').exists():
            run('reconstruct_kiri.py','--submit','--method','3dgs','--input','images','--images-dir',project/'frames','--output-dir',cloud,'--no-download')
        state=json.loads((cloud/'worker_state.json').read_text()) if (cloud/'worker_state.json').exists() else {}
        if state.get('phase') not in ('model_ready','analysis_ready'):
            run('video_cloud_worker.py','--project',project)
    mesh=cloud/'unpacked/3DModel.glb'
    if mesh.exists() and not (project/'structure/observed_planes.json').exists():
        run('extract_scan_planes.py','--mesh',mesh,'--output',project/'structure')
    if (project/'structure/observed_planes.json').exists() and not (project/'structure/textured_plane_overview.jpg').exists():
        run('render_scan_planes.py','--structure',project/'structure')
    samples=project/'structure/surface_samples.npz'
    if samples.exists():
        import numpy as np
        cloud_samples=np.load(samples);stride=max(1,len(cloud_samples['points'])//16000)
        payload={'points':np.column_stack([cloud_samples['points'][::stride],cloud_samples['colors'][::stride,:3]]).round(6).tolist()}
        (project/'structure/web_sample.json').write_text(json.dumps(payload),encoding='utf-8')
    if (project/'plane_review.json').exists():
        run('review_scan_planes.py','--project',project,'--review',project/'plane_review.json')
        run('clean_video_scan.py','--project',project)
    metadata=json.loads((project/'project.json').read_text(encoding='utf-8'))
    if all(metadata['measurements_m'].get(k) for k in ('length','width','height')):
        run('build_video_room.py','--project',project)
    run('build_video_results.py','--project',project)


if __name__=='__main__':main()
