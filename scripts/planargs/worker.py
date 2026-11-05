"""Execute one upstream stage and record this process's peak CUDA allocation."""
import json
from pathlib import Path
import runpy
import sys
import time

metrics, script, *arguments = sys.argv[1:]
script = str(Path(script).resolve())
sys.path.insert(0, str(Path(script).parent))
sys.argv = [script, *arguments]
started = time.monotonic()
report = {'script': script, 'status': 'failed'}
try:
    runpy.run_path(script, run_name='__main__')
    report['status'] = 'complete'
except SystemExit as error:
    if error.code in (None, 0):
        report['status'] = 'complete'
    raise
finally:
    report['elapsed_seconds'] = round(time.monotonic() - started, 2)
    torch = sys.modules.get('torch')
    if torch and torch.cuda.is_initialized():
        report['peak_torch_allocated_mib'] = round(torch.cuda.max_memory_allocated() / 1024**2, 2)
        report['peak_torch_reserved_mib'] = round(torch.cuda.max_memory_reserved() / 1024**2, 2)
        report['memory_scope'] = 'PyTorch allocator in this worker; excludes other applications and non-PyTorch allocations'
    Path(metrics).write_text(json.dumps(report, indent=2), encoding='utf-8')
