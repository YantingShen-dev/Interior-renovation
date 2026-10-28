param(
    [Parameter(Mandatory=$true)][string]$Video,
    [string]$Project = '',
    [double]$Length = 0,
    [double]$Width = 0,
    [double]$Height = 0,
    [switch]$Cloud
)
$ErrorActionPreference = 'Stop'
$videoPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $videoPython)) { throw 'Missing local Python environment.' }
if (-not $Project) { $Project = Join-Path $PSScriptRoot ('单视频流程\试验-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$pipelineArguments = @((Join-Path $PSScriptRoot 'scripts\run_video_pipeline.py'), '--video', $Video, '--project', $Project)
if ($Length -gt 0) { $pipelineArguments += @('--length', $Length) }
if ($Width -gt 0) { $pipelineArguments += @('--width', $Width) }
if ($Height -gt 0) { $pipelineArguments += @('--height', $Height) }
if ($Cloud) { $pipelineArguments += '--cloud' }
& $videoPython @pipelineArguments
if ($LASTEXITCODE -ne 0) { throw 'Video pipeline stopped. The existing project can be resumed without a new submission.' }
