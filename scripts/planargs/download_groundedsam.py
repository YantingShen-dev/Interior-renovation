"""Fetch pinned GroundedSAM source only, without multi-GB demo assets."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path, PurePosixPath
import time
import urllib.request
import subprocess

COMMIT = '126abe633ffe333e16e4a0a4e946bc1003caf757'
REPO = 'IDEA-Research/Grounded-Segment-Anything'


def read(url):
    for attempt in range(5):
        try:
            if 'cdn.jsdelivr.net/gh/' in url:
                host = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'testingcf.jsdelivr.net', 'cdn.jsdelivr.net'][attempt]
                request_url = url.replace('cdn.jsdelivr.net', host)
            else:
                request_url = url
            return subprocess.run(['curl', '-fLs', '--connect-timeout', '10', '--max-time', '45', request_url],
                                  check=True, stdout=subprocess.PIPE).stdout
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--tree', type=Path)
    args = parser.parse_args()
    root = args.output.resolve()
    tree = json.loads(args.tree.read_text() if args.tree else read(f'https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1'))
    if tree.get('truncated'):
        raise RuntimeError('Incomplete Git tree')
    entries = [x for x in tree['tree'] if x['type'] == 'blob' and
               x['path'].split('/')[0] in ('GroundingDINO', 'segment_anything') and
               PurePosixPath(x['path']).suffix not in ('.png', '.jpg', '.gif', '.mp4', '.ipynb')]
    def fetch(entry):
        relative = PurePosixPath(entry['path'])
        target = root.joinpath(*relative.parts)
        if not target.resolve().is_relative_to(root):
            raise RuntimeError('Unsafe source path')
        def valid(data):
            return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == entry['sha']
        if target.exists():
            if not valid(target.read_bytes()):
                raise RuntimeError(f'Preserving modified source: {target}')
            return
        data = read(f'https://cdn.jsdelivr.net/gh/{REPO}@{COMMIT}/{entry["path"]}')
        if not valid(data):
            raise RuntimeError('Git blob checksum mismatch')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        print('Verified ' + entry['path'], flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(fetch, entries))
    (root / 'LOCAL_SOURCE.json').write_text(json.dumps({'repository': REPO, 'commit': COMMIT,
        'files': len(entries), 'verification': 'Git blob SHA1 for every source file'}, indent=2))
    print(f'Installed {len(entries)} verified source files at {root}')


if __name__ == '__main__':
    main()
