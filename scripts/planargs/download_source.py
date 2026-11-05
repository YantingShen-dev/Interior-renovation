"""Download the pinned official source archive, excluding stale prebuilt binaries."""
import argparse
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request

COMMIT = 'a68f22043e95146c4f1c52cc0e471a6a90e86f73'
URL = f'https://codeload.github.com/SJTU-ViSYS-team/PlanarGS/tar.gz/{COMMIT}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    partial = args.archive.with_suffix('.part')
    print('Downloading ' + URL, flush=True)
    with urllib.request.urlopen(URL, timeout=120) as response, partial.open('wb') as stream:
        size = 0
        while block := response.read(1024 * 1024):
            stream.write(block)
            size += len(block)
            if size % (5 * 1024 * 1024) == 0:
                print(f'{size // 1024 // 1024} MiB downloaded', flush=True)
    partial.replace(args.archive)
    count = 0
    with tarfile.open(args.archive, 'r:gz') as archive:
        for member in archive:
            relative = PurePosixPath(member.name)
            if not relative.parts or relative.parts[0] != 'PlanarGS-' + COMMIT:
                raise ValueError('Unexpected archive root')
            relative = PurePosixPath(*relative.parts[1:])
            if not member.isfile() or relative.suffix in ('.so', '.pyc') or 'build' in relative.parts:
                continue
            target = root.joinpath(*relative.parts)
            if not target.resolve().is_relative_to(root) or '.git' in relative.parts:
                raise ValueError('Unsafe source archive path')
            data = archive.extractfile(member).read()
            if target.exists() and target.read_bytes() != data:
                raise FileExistsError(f'Preserving modified local file: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            count += 1
    manifest = {'repository': 'https://github.com/SJTU-ViSYS-team/PlanarGS', 'commit': COMMIT,
                'archive': URL, 'mode': 'source-snapshot', 'files': count,
                'excluded': ['prebuilt .so and .pyc files', 'build directories'],
                'compiled': False}
    (root / 'LOCAL_SOURCE.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Extracted {count} files. CUDA extensions still need to be compiled.', flush=True)


if __name__ == '__main__':
    main()
