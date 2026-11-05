"""Resume official weights with verified HTTP ranges; never promote partial files."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import shutil
import time
import urllib.request


def download(url, target, workers=12, sha256=None):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'Range': 'bytes=0-0', 'Accept-Encoding': 'identity'})
    with urllib.request.urlopen(request, timeout=60) as response:
        match = re.fullmatch(r'bytes 0-0/(\d+)', response.headers.get('Content-Range', ''))
        if response.status != 206 or not match:
            raise RuntimeError('Server does not support verified range requests')
        total = int(match[1])
        resolved_url = response.url
    if target.exists():
        if target.stat().st_size != total:
            raise RuntimeError('Existing target has the wrong size; preserving it')
        print(f'Already downloaded: {target}', flush=True)
        return
    partial = target.with_name(target.name + '.part')
    start = partial.stat().st_size if partial.exists() else 0
    if start > total:
        raise RuntimeError('Partial file is larger than remote file')
    chunks = target.with_name(target.name + '.chunks')
    chunks.mkdir(exist_ok=True)
    metadata = {'url': url, 'bytes': total, 'prefix_bytes': start}
    manifest = chunks / 'source.json'
    if manifest.exists() and json.loads(manifest.read_text()) != metadata:
        raise RuntimeError('Resume source changed; preserving previous chunks')
    manifest.write_text(json.dumps(metadata))
    size = 4 * 1024 * 1024

    def fetch(offset):
        end = min(offset + size, total) - 1
        destination = chunks / str(offset)
        if destination.exists() and destination.stat().st_size == end - offset + 1:
            return end - offset + 1
        for attempt in range(5):
            try:
                req = urllib.request.Request(resolved_url, headers={'Range': f'bytes={offset}-{end}', 'Accept-Encoding': 'identity'})
                with urllib.request.urlopen(req, timeout=90) as response:
                    if response.status != 206 or response.headers.get('Content-Range') != f'bytes {offset}-{end}/{total}':
                        raise RuntimeError('Incorrect Content-Range')
                    data = response.read()
                if len(data) != end - offset + 1:
                    raise RuntimeError('Truncated chunk')
                destination.write_bytes(data)
                return len(data)
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))

    offsets = list(range(start, total, size))
    completed = start
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for future in concurrent.futures.as_completed([pool.submit(fetch, offset) for offset in offsets]):
            completed += future.result()
            print(f'{target.name}: {completed / total:.1%}', flush=True)
    assembled = target.with_name(target.name + '.assembling')
    with assembled.open('wb') as out:
        if start:
            with partial.open('rb') as source:
                shutil.copyfileobj(source, out)
        for offset in offsets:
            with (chunks / str(offset)).open('rb') as source:
                shutil.copyfileobj(source, out)
    assert assembled.stat().st_size == total
    digest = hashlib.sha256()
    with assembled.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    if sha256 and digest.hexdigest() != sha256:
        raise RuntimeError('SHA256 differs from the official published checksum; refusing promotion')
    assembled.replace(target)
    metadata['sha256'] = digest.hexdigest()
    target.with_name(target.name + '.download.json').write_text(json.dumps(metadata, indent=2))
    print(f'Complete: {target}; SHA256 {digest.hexdigest()}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('target', type=Path)
    parser.add_argument('--workers', type=int, default=12)
    parser.add_argument('--sha256')
    args = parser.parse_args()
    download(args.url, args.target, args.workers, args.sha256)
