"""Resume a saved cloud task, download it, and inspect a returned triangle mesh.

This watcher only polls an existing task; it never submits or bills a new scan.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--method",choices=["photo","3dgs"],default="3dgs")
    parser.add_argument("--input",choices=["video","images"],default="images")
    parser.add_argument("--timeout",type=int,default=3600)
    parser.add_argument("--interval",type=int,default=30)
    args=parser.parse_args()
    folder=ROOT/"重建小样"/("kiri_"+args.method+("_images" if args.input=="images" else ""))
    if not (folder/"task.json").exists():
        raise SystemExit("No existing task to watch. Submit a task explicitly first.")
    state_path=folder/"watcher_state.json"
    state={"started_at":datetime.now(timezone.utc).isoformat(),"phase":"polling","method":args.method,"input":args.input}
    def save(phase):
        state.update(phase=phase,last_checked_at=datetime.now(timezone.utc).isoformat())
        state_path.write_text(json.dumps(state,indent=2),encoding="utf-8")
    deadline=time.monotonic()+args.timeout
    last=None
    while time.monotonic()<deadline:
        result=subprocess.run([sys.executable,"-u",str(ROOT/"scripts"/"reconstruct_kiri.py"),"--poll","--method",args.method,"--input",args.input],capture_output=True,text=True)
        message=(result.stdout+result.stderr).strip()
        if message!=last:
            print(message,flush=True);last=message
        if result.returncode:
            save("poll_error")
            raise SystemExit(result.returncode)
        if (folder/"model.zip").exists():
            save("inspecting")
            check=subprocess.run([sys.executable,str(ROOT/"scripts"/"inspect_cloud_model.py"),str(folder/"model.zip")])
            if check.returncode:
                save("archive_requires_review")
                raise SystemExit(check.returncode)
            preview=subprocess.run([sys.executable,str(ROOT/"scripts"/"build_preview.py"),"--sparse",str(folder),"--data","surface_sample.json"])
            if preview.returncode:
                save("preview_error")
                raise SystemExit(preview.returncode)
            save("downloaded_and_previewed")
            print("Cloud mesh archive inspected; geometry preview generated. Metric accuracy remains unverified.",flush=True)
            return
        save("polling")
        time.sleep(min(max(args.interval,5),30))
    save("waiting_for_cloud")
    print("Polling window elapsed; saved task can be resumed without resubmission.",flush=True)


if __name__=="__main__":
    main()
