$ErrorActionPreference = 'Stop'
$studioRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$studioUrl = 'http://127.0.0.1:8765'
$studioConnections = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
if ($studioConnections.Count -gt 0) {
    $studioHealth = Invoke-RestMethod -Uri ($studioUrl + '/api/health') -TimeoutSec 3
    if ($studioHealth.app -ne 'space-studio') { throw 'Port 8765 is used by another application.' }
    $studioProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $studioConnections[0].OwningProcess)
    if ($studioProcess.Name -ne 'node.exe' -or $studioProcess.CommandLine -notmatch 'scripts[\\/]studio[\\/]server\.cjs') {
        throw 'The listener is not the expected studio server. Nothing was stopped.'
    }
    $studioResult = Invoke-CimMethod -InputObject $studioProcess -MethodName Terminate
    if ($studioResult.ReturnValue -ne 0) { throw ('Could not stop studio: ' + $studioResult.ReturnValue) }
    for ($studioAttempt = 0; $studioAttempt -lt 20; $studioAttempt++) {
        if (-not (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
    if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8765 is still busy.' }
}
Start-Process -FilePath node -ArgumentList @('--use-env-proxy','scripts/studio/server.cjs') -WorkingDirectory $studioRoot -WindowStyle Hidden
$studioReady = $false
for ($studioAttempt = 0; $studioAttempt -lt 30; $studioAttempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $studioHealth = Invoke-RestMethod -Uri ($studioUrl + '/api/health') -TimeoutSec 1
        if ($studioHealth.app -eq 'space-studio') { $studioReady = $true; break }
    } catch {}
}
if (-not $studioReady) { throw 'Studio did not become ready on port 8765.' }
Write-Output ('Studio restarted: ' + $studioUrl)
