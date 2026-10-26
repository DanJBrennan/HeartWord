# Read the current LTX Desktop backend token from Dan's Mac over the existing
# passwordless SSH connection. The token is never printed or written to Git.
param(
    [string]$MacUser = $(if ($env:LTX_SSH_USER) { $env:LTX_SSH_USER } else { 'danieljbrennan' }),
    [string]$MacHost = $(if ($env:LTX_SSH_HOST) { $env:LTX_SSH_HOST } else { '192.168.77.2' })
)

$ErrorActionPreference = 'Stop'
if ($MacUser -notmatch '^[A-Za-z0-9_][A-Za-z0-9_.-]*$' -or
    $MacHost -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$') {
    throw 'Invalid LTX SSH destination.'
}
$destination = "$MacUser@$MacHost"
$processes = & ssh -o BatchMode=yes -o ConnectTimeout=10 $destination 'ps -Ao pid=,command='
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Mac LTX Desktop process.' }
$backends = @($processes | Where-Object { $_ -match '^\s*\d+\s+.*?/backend/ltx2_server\.py(?:\s|$)' })
if ($backends.Count -ne 1) { throw "Expected one LTX Desktop backend; found $($backends.Count)." }
$backendPid = [regex]::Match($backends[0], '^\s*(\d+)').Groups[1].Value
$processEnvironment = & ssh -o BatchMode=yes -o ConnectTimeout=10 $destination "ps eww -p $backendPid"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the current LTX Desktop backend environment.' }
$match = [regex]::Match(($processEnvironment -join ' '), '(?:^|\s)LTX_AUTH_TOKEN=([^\s]+)')
if (-not $match.Success -or $match.Groups[1].Value -match '[\r\n]' -or
    $match.Groups[1].Value.Length -lt 20) {
    throw 'The current LTX Desktop backend token was not available.'
}
$token = $match.Groups[1].Value
$tokenPath = Join-Path $env:LOCALAPPDATA 'HeartWord\ltx-desktop-session.token'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $tokenPath) | Out-Null
[System.IO.File]::WriteAllText($tokenPath, $token, [System.Text.UTF8Encoding]::new($false))
$env:LTX_TOKEN = $token
Write-Output "LTX Desktop token refreshed in the current shell and $tokenPath"
