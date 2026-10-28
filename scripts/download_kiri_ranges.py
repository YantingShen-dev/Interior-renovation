"""Resume an immutable KIRI task archive using verified HTTP byte ranges."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
import json
from pathlib import Path
import shutil
import time
import urllib.parse
import urllib.request
import zipfile

import reconstruct_kiri as kiri


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--folder",type=Path,default=kiri.ROOT/"重建小样"/"kiri_3dgs_images")
    parser.add_argument("--chunk-mib",type=int,default=2)
    args=parser.parse_args()
    folder=args.folder.resolve()
    task=json.loads((folder/"task.json").read_text(encoding="utf-8"))
    result=kiri.api("/model/getModelZip?"+urllib.parse.urlencode({"serialize":task["serialize"]}),kiri.load_key())
    url=result["modelUrl"]
    if urllib.parse.urlsplit(url).scheme!="https":raise ValueError("HTTPS required.")
    probe=urllib.request.Request(url,headers={"Range":"bytes=0-0"})
    with urllib.request.urlopen(probe,timeout=60) as response:
        if response.status!=206:raise ValueError("Server does not support byte ranges.")
        total=int(response.headers["Content-Range"].split("/")[-1])
        response.read()
    chunk=max(1,args.chunk_mib)*1024**2
    partial=folder/"model.zip.part"
    prefix=min((partial.stat().st_size//chunk)*chunk,total) if partial.exists() else 0
    parts=folder/"download_parts"
    parts.mkdir(exist_ok=True)
    prefix_path=parts/"prefix.bin"
    def fetch(start,end,path):
        expected=end-start+1
        if path.exists() and path.stat().st_size==expected:return path
        for attempt in range(3):
            try:
                req=urllib.request.Request(url,headers={"Range":f"bytes={start}-{end}"})
                with urllib.request.urlopen(req,timeout=60) as response,path.open("wb") as handle:
                    if response.status!=206 or response.headers.get("Content-Range")!=f"bytes {start}-{end}/{total}":
                        raise ValueError("Unexpected range response.")
                    shutil.copyfileobj(response,handle,1024**2)
                if path.stat().st_size!=expected:raise OSError("Incomplete range.")
                return path
            except (OSError,ValueError):
                if attempt==2:raise
                time.sleep(2)
    if prefix:
        # Confirm the reused prefix belongs to the same returned archive.
        check=parts/"prefix_check.bin"
        end=min(prefix,65536)-1
        fetch(0,end,check)
        with partial.open("rb") as handle:
            if handle.read(end+1)!=check.read_bytes():raise ValueError("Existing prefix is from another archive.")
            handle.seek(0)
            with prefix_path.open("wb") as saved:
                remaining=prefix
                while remaining:
                    block=handle.read(min(1024**2,remaining))
                    if not block:raise OSError("Existing prefix is incomplete.")
                    saved.write(block);remaining-=len(block)
    ranges=[(a,min(a+chunk-1,total-1),parts/f"range_{a:012d}.bin") for a in range(prefix,total,chunk)]
    print(f"Archive bytes: {total}; reused prefix: {prefix}; ranges: {len(ranges)}",flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(fetch,a,b,p) for a,b,p in ranges]
        for i,f in enumerate(as_completed(futures),1):
            f.result()
            print(f"Downloaded range {i}/{len(ranges)}",flush=True)
    merged=folder/"model.ranged.zip.part"
    with merged.open("wb") as handle:
        if prefix:
            with prefix_path.open("rb") as source:shutil.copyfileobj(source,handle)
        for _,_,path in ranges:
            with path.open("rb") as source:shutil.copyfileobj(source,handle)
    if merged.stat().st_size!=total:raise ValueError("Archive byte count mismatch.")
    with zipfile.ZipFile(merged) as archive:
        bad=archive.testzip()
        if bad:raise ValueError("Archive CRC check failed.")
    merged.replace(folder/"model.zip")
    (folder/"download_report.json").write_text(json.dumps({"bytes":total,"reused_prefix_bytes":prefix,"range_count":len(ranges),"zip_crc_checked":True},indent=2),encoding="utf-8")
    print("Archive assembled and CRC verified.",flush=True)


if __name__=="__main__":
    main()
