"""KIRI video adapter. Keys stay local; submissions are never retried implicitly.

Official endpoints: https://docs.kiriengine.app/
Use --check, then --submit, then --poll as needed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://api.kiriengine.app/api/v1/open"


def load_key() -> str:
    key = os.environ.get("KIRI_API_KEY", "").strip()
    path = ROOT / ".env.local"
    if not key and path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.strip().startswith("KIRI_API_KEY="):
                key = line.split("=",1)[1].strip().strip("\"'")
    if not key or key in {"YOUR_API_KEY", "your_api_key_here"}:
        raise ValueError("Set KIRI_API_KEY in the project .env.local file first.")
    return key


class ApiRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname != "api.kiriengine.app":
            raise ValueError("Unexpected API redirect; authorization was not forwarded.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def api(path: str, key: str, data: bytes | None = None, content_type: str | None = None) -> dict:
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(BASE+path, data=data, headers=headers)
    try:
        with urllib.request.build_opener(ApiRedirectHandler()).open(request, timeout=180) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"KIRI HTTP {e.code}; inspect your account access or credits.") from None
    success = (payload.get("code") == 0 and payload.get("ok") is not False) or (payload.get("code") == 200 and payload.get("ok") is True)
    if not success:
        message = str(payload.get("msg", "Unknown API error")).replace(key, "[REDACTED]")[:300]
        raise RuntimeError(f"KIRI code {payload.get('code')}: {message}")
    return payload["data"]


def multipart(video: Path, method: str, images: list[Path] | None = None) -> tuple[bytes, str]:
    boundary = "CodexSample" + uuid.uuid4().hex
    fields = {"isMask":"0", "fileFormat":"glb"}
    if method == "photo":
        fields.update({"modelQuality":"0", "textureQuality":"1", "textureSmoothing":"0"})
    else:
        fields["isMesh"] = "1"
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    files = [("imagesFiles",p,p.parent.name+"_"+p.name,"image/jpeg") for p in images] if images else [("videoFile",video,"capture.mp4","video/mp4")]
    for field,path,name,mime in files:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
        parts.extend([path.read_bytes(), b"\r\n"])
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--balance", action="store_true")
    action.add_argument("--submit", action="store_true")
    action.add_argument("--poll", action="store_true")
    parser.add_argument("--method", choices=["photo", "3dgs"], default="photo")
    parser.add_argument("--input", choices=["video", "images"], default="video")
    parser.add_argument("--images-dir", type=Path, help="Use this generated frame directory instead of the historical mixed-image sample.")
    parser.add_argument("--output-dir", type=Path, help="Keep this task isolated from earlier trials.")
    parser.add_argument("--no-download", action="store_true", help="Query status only; download can be resumed separately.")
    args = parser.parse_args()
    key = load_key()
    if args.check:
        print("KIRI key configured locally. Value is hidden. No API request was made.")
        return
    if args.balance:
        result = api("/balance",key)
        print("Available KIRI credits:", result["balance"])
        return
    output = args.output_dir.resolve() if args.output_dir else ROOT / "重建小样" / ("kiri_" + args.method + ("_images" if args.input == "images" else ""))
    output.mkdir(parents=True, exist_ok=True)
    task_path = output / "task.json"
    marker_path = output / "submission_pending.json"
    if args.submit and not task_path.exists():
        video = ROOT / "重建小样" / "upload_h264.mp4"
        images = None
        if args.input == "images":
            image_root = args.images_dir.resolve() if args.images_dir else ROOT / "重建小样" / "local_v2" / "images"
            images = sorted(image_root.rglob("*.jpg"))
            if not 20 <= len(images) <= 300:
                raise ValueError("KIRI image input requires 20 to 300 prepared images.")
        elif not video.exists():
            raise ValueError("Prepared upload_h264.mp4 is missing.")
        if marker_path.exists():
            raise ValueError("An earlier submission has uncertain status. Check KIRI tasks before retrying; no duplicate request was sent.")
        balance = api("/balance",key)["balance"]
        print("Available KIRI credits:", balance, flush=True)
        if float(balance) < 1:
            raise ValueError("No available scan credit. No video was uploaded and no recharge was attempted.")
        hasher = hashlib.sha256()
        for source in images or [video]:
            hasher.update(source.read_bytes())
        digest = hasher.hexdigest()
        body, content_type = multipart(video, args.method, images)
        marker_path.write_text(json.dumps({"source_sha256":digest, "method":args.method}), encoding="utf-8")
        result = api(f"/{'photo' if args.method == 'photo' else '3dgs'}/{'image' if images else 'video'}", key, body, content_type)
        task = {"serialize":result["serialize"], "method":args.method, "input":args.input, "source_sha256":digest}
        if images:
            task["input_image_manifest"]=[{"file":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()} for p in images]
        task_path.write_text(json.dumps(task, indent=2), encoding="utf-8")
        marker_path.unlink()
        print("Submission accepted. Task ID saved locally.", flush=True)
    if not task_path.exists():
        raise ValueError("No saved task. Use --submit first.")
    task = json.loads(task_path.read_text(encoding="utf-8"))
    query = "?" + urllib.parse.urlencode({"serialize":task["serialize"]})
    result = api("/model/getStatus"+query,key)
    status = int(result["status"])
    task["status"] = status
    task_path.write_text(json.dumps(task, indent=2), encoding="utf-8")
    print("KIRI status:", {-1:"uploading",0:"processing",1:"failed",2:"successful",3:"queued",4:"expired"}.get(status,status), flush=True)
    if status in (1,4):
        raise RuntimeError("Cloud reconstruction did not complete successfully; no repeat submission was sent.")
    if status != 2:
        print("Run --poll later to retrieve the result. Existing task will be reused.")
        return
    if args.no_download:
        print("Cloud result is ready; automatic download was not requested.")
        return
    target = output / "model.zip"
    if target.exists():
        print("Existing model.zip retained.")
        return
    result = api("/model/getModelZip"+query,key)
    url = result["modelUrl"]
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError("Model download must use HTTPS.")
    partial = output / "model.zip.part"
    # Download requests have no API authorization header and URLs are not logged.
    with urllib.request.urlopen(url,timeout=180) as response, partial.open("wb") as handle:
        shutil.copyfileobj(response,handle)
    partial.replace(target)
    print("Model archive downloaded. Geometry still needs inspection and metric calibration.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, urllib.error.URLError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
