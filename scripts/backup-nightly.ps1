param(
    [string]$StagingRoot = 'C:\Users\danbr\HeartWordBackupStaging',
    [string]$SyncRoot = $(if ($env:OneDrive) { Join-Path $env:OneDrive 'HeartWordBackups' } else { '' }),
    [switch]$CloudCapacityConfirmed
)
$ErrorActionPreference = 'Stop'
if (-not $CloudCapacityConfirmed) {
    throw 'Confirm at least 750 GiB free in the selected OneDrive account before enabling nightly uploads.'
}
if (-not $SyncRoot) { throw 'No OneDrive sync root is configured. Select and verify the intended account first.' }
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$backupName = Get-Date -Format 'yyyyMMdd-HHmmss'
$stagedBackup = Join-Path $StagingRoot $backupName
$syncBackup = Join-Path $SyncRoot $backupName
# Stop production, imports and external editor/render writers for this maintenance
# window. The runtime checks active jobs and refuses changed media. Never kill a
# paid provider job or mark it interrupted just to obtain a backup.
& node --import tsx scripts/disaster-backup.ts stage $stagedBackup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node --import tsx scripts/disaster-backup.ts publish $stagedBackup $syncBackup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Warning 'Cloud upload pending. Confirm OneDrive remotely; a local sync folder is not disk-loss protection.'
# No automatic pruning: proposed retention is three daily and four weekly copies.
# Remove superseded backup copies only after verifying a newer cloud restore.
