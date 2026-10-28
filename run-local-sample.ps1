$ErrorActionPreference = 'Stop'
$sampleRoot = $PSScriptRoot
$samplePython = Join-Path $sampleRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $samplePython)) {
    throw 'Project environment is missing. See 03-重建小样运行说明.md.'
}
& $samplePython (Join-Path $sampleRoot 'scripts\prepare_sample.py') --output-name local_v2
if ($LASTEXITCODE -ne 0) { throw 'Video preparation failed.' }
& $samplePython (Join-Path $sampleRoot 'scripts\reconstruct_local.py') --sample (Join-Path $sampleRoot '重建小样\local_v2')
if ($LASTEXITCODE -ne 0) { throw 'Local reconstruction failed.' }
& $samplePython (Join-Path $sampleRoot 'scripts\build_preview.py') --sparse (Join-Path $sampleRoot '重建小样\local_v2\sparse')
if ($LASTEXITCODE -ne 0) { throw 'No preview was produced. Inspect reconstruction_report.json.' }
