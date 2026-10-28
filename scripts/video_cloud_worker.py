"""Watch only the current video project's task and keep cloud results isolated."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,subprocess,sys,time

ROOT=Path(__file__).resolve().parents[1]


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);p.add_argument('--timeout',type=int,default=3600);args=p.parse_args()
    project=args.project.resolve();cloud=project/'cloud';manifest=json.loads((project/'project.json').read_text(encoding='utf-8'));task=json.loads((cloud/'task.json').read_text())
    expected={Path(f['file']).name:f['sha256'] for f in manifest['frames']}
    actual={f['file']:f['sha256'] for f in task['input_image_manifest']}
    if actual!=expected:raise ValueError('Cloud upload inputs do not match the video-derived frame pool.')
    state={'source':'single_video','uploaded_frames':len(actual),'extra_photos':0,'started_at_utc':datetime.now(timezone.utc).isoformat()}
    def save(phase):
        state.update(phase=phase,last_checked_at_utc=datetime.now(timezone.utc).isoformat());(cloud/'worker_state.json').write_text(json.dumps(state,indent=2))
    until=time.monotonic()+args.timeout;last=None;failures=0
    while time.monotonic()<until:
        result=subprocess.run([sys.executable,str(ROOT/'scripts/reconstruct_kiri.py'),'--poll','--no-download','--output-dir',str(cloud)],capture_output=True,text=True)
        message=(result.stdout+result.stderr).strip()
        if message!=last:print(message,flush=True);last=message
        task=json.loads((cloud/'task.json').read_text())
        if task.get('status') in (1,4):save('cloud_failed');raise SystemExit(1)
        if result.returncode:
            failures+=1;save('poll_retry')
            if failures>=3:raise SystemExit(result.returncode)
            time.sleep(15);continue
        failures=0
        if task.get('status')==2:
            save('downloading')
            if not (cloud/'model.zip').exists():
                subprocess.run([sys.executable,'-u',str(ROOT/'scripts/download_kiri_ranges.py'),'--folder',str(cloud),'--chunk-mib','2'],check=True)
            save('inspecting')
            subprocess.run([sys.executable,str(ROOT/'scripts/inspect_cloud_model.py'),str(cloud/'model.zip')],check=True)
            subprocess.run([sys.executable,str(ROOT/'scripts/build_preview.py'),'--sparse',str(cloud),'--data','surface_sample.json','--contact-sheet','../structure_contact_sheet.jpg'],check=True)
            save('model_ready')
            print('Video-only cloud model downloaded and inspected.',flush=True);return
        save('cloud_processing');time.sleep(30)
    save('pending_external_compute');print('Task still processing; resume this worker without submitting another scan.',flush=True)


if __name__=='__main__':main()
