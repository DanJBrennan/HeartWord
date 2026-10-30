param(
    [switch]$CaptureClipboard,
    [string[]]$ExperimentArgs = @()
)
# Session credentials stay outside the repository, encrypted with this Windows
# user's DPAPI identity. Refresh explicitly after Desktop rotates its token.
$ErrorActionPreference = 'Stop'
$ltxCredentialFolder = Join-Path $env:LOCALAPPDATA 'HeartWord\credentials'
$ltxCredentialFile = Join-Path $ltxCredentialFolder 'ltx-desktop-192.168.77.2.dpapi'
if ($CaptureClipboard) {
    $ltxClipboardValue = (ssh -o BatchMode=yes -o ConnectTimeout=8 danieljbrennan@192.168.77.2 'pbpaste')
    if ([string]::IsNullOrWhiteSpace($ltxClipboardValue)) { throw 'Mac clipboard is empty; no token saved.' }
    [System.IO.Directory]::CreateDirectory($ltxCredentialFolder) | Out-Null
    $ltxSecureToken = ConvertTo-SecureString -String $ltxClipboardValue.Trim() -AsPlainText -Force
    [System.IO.File]::WriteAllText($ltxCredentialFile, (ConvertFrom-SecureString -SecureString $ltxSecureToken))
    Remove-Variable ltxClipboardValue,ltxSecureToken
    Write-Output 'Saved the LTX session token with Windows account-bound encryption.'
}
if ($ExperimentArgs.Count -eq 0) { return }
if (-not (Test-Path -LiteralPath $ltxCredentialFile)) { throw 'No encrypted LTX session token. Copy it on the Mac and run this script with -CaptureClipboard.' }
$ltxPreviousToken = $env:LTX_TOKEN
try {
    $ltxSecureToken = ConvertTo-SecureString -String ([System.IO.File]::ReadAllText($ltxCredentialFile))
    $env:LTX_TOKEN = [System.Net.NetworkCredential]::new('', $ltxSecureToken).Password
    & npm.cmd run ltx:lipsync -- @ExperimentArgs
    if ($LASTEXITCODE -ne 0) { throw 'LTX experiment did not complete successfully; inspect its retained status before retrying.' }
} finally {
    $env:LTX_TOKEN = $ltxPreviousToken
    Remove-Variable ltxSecureToken,ltxPreviousToken -ErrorAction SilentlyContinue
}
