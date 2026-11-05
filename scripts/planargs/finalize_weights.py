"""Validate publisher hashes, install verified weights and small local model configs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HASHES = {
    'dust3r-hf/model.safetensors': '7c300a89534113436bde52732d3151212bcbd90f0aa3c8d1496f86d84bfe4b42',
    'groundingdino_swint_ogc.pth': '3b3ca2563c77c69f651d7bd133e97139c186df06231157a64c507099c52bc799',
    'bert-base-uncased/model.safetensors': '68d45e234eb4a928074dfd868cead0219ab85354cc53d20e772753c6bb9169d3',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoints', type=Path, required=True)
    parser.add_argument('--configs-only', action='store_true')
    args = parser.parse_args()
    root = args.checkpoints.resolve()
    candidates = {
        'dust3r-hf/model.safetensors': ['dust3r-hf/model.safetensors', 'dust3r-hf/model.safetensors.part'],
        'groundingdino_swint_ogc.pth': ['groundingdino_swint_ogc.pth', 'dino-hf/groundingdino_swint_ogc.pth'],
        'bert-base-uncased/model.safetensors': ['bert-base-uncased/model.safetensors', 'bert-fast/model.safetensors'],
    }
    report = {}
    for name, paths in candidates.items():
        if args.configs_only:
            break
        source = next((root / p for p in paths if (root / p).is_file()), None)
        if source is None:
            raise RuntimeError('Download unfinished: ' + name)
        digest = hashlib.sha256()
        with source.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != HASHES[name]:
            raise RuntimeError('Publisher SHA256 mismatch: ' + name)
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if source != target:
            shutil.copyfile(source, target.with_suffix('.verified-part'))
            target.with_suffix('.verified-part').replace(target)
        report[name] = {'sha256': digest.hexdigest(), 'bytes': target.stat().st_size, 'verified': True}
        print('Verified ' + name, flush=True)
    for repository, folder, files in [
        ('naver/DUSt3R_ViTLarge_BaseDecoder_512_dpt', 'dust3r-hf', ['config.json']),
        ('google-bert/bert-base-uncased', 'bert-base-uncased', ['config.json', 'tokenizer_config.json', 'tokenizer.json', 'vocab.txt']),
    ]:
        for name in files:
            target = root / folder / name
            if target.exists():
                continue
            partial = target.with_suffix(target.suffix + '.part')
            subprocess.run(['curl', '-fL', '--retry', '3', '--connect-timeout', '15', '--max-time', '120',
                            '-o', str(partial), f'https://hf-mirror.com/{repository}/resolve/main/{name}'], check=True)
            if name.endswith('.json'):
                json.loads(partial.read_text())
            partial.replace(target)
    if not args.configs_only:
        (root / 'verified-weights.json').write_text(json.dumps(report, indent=2))
    print('Verified weights and local model configs installed.')


if __name__ == '__main__':
    main()
