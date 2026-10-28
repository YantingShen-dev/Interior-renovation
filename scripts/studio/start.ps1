$ErrorActionPreference = 'Stop'
$studioRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$studioUrl = 'http://127.0.0.1:8765'
try {
    $studioHealth = Invoke-RestMethod -Uri ($studioUrl + '/api/health') -TimeoutSec 2
    if ($studioHealth.app -ne 'space-studio') { throw 'Port is used by another application.' }
} catch {
    Start-Process -FilePath 'node' -ArgumentList @('scripts/studio/server.cjs') -WorkingDirectory $studioRoot -WindowStyle Hidden
    $studioReady = $false
    for ($studioAttempt = 0; $studioAttempt -lt 30; $studioAttempt++) {
        Start-Sleep -Milliseconds 250
        try { $studioHealth = Invoke-RestMethod -Uri ($studioUrl + '/api/health') -TimeoutSec 1; $studioReady = $studioHealth.app -eq 'space-studio'; if ($studioReady) { break } } catch {}
    }
    if (-not $studioReady) { throw 'Space Studio could not start on port 8765.' }
}
Start-Process $studioUrl
