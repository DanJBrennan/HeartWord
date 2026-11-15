$ErrorActionPreference = 'Stop'
$repository = 'C:\Users\danbr\OneDrive\Documents\HeartWord'
Set-Location -LiteralPath $repository
$capturePid = 227308
$captureFolder = 'C:\Users\danbr\HeartWordBackupStaging\20261024-first-personal'
$cloudFolder = 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\20261024-first-personal'
$restoreFolder = 'C:\Users\danbr\HeartWordRecoveryDrill\20261024-personal-cloud'
$restoreApplication = $restoreFolder + '-application'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HeartWordBackupPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint state); }'
[HeartWordBackupPower]::SetThreadExecutionState([uint32]2147483649) | Out-Null
function Update-Deployment([string]$phase) {
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = $phase
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record | ConvertTo-Json -Depth 10 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
}
try {
    $captureProcess = Get-Process -Id $capturePid -ErrorAction SilentlyContinue
    $expectedStart = if ($captureProcess) { $captureProcess.StartTime } else { $null }
    $captureDeadline = [DateTime]::UtcNow.AddHours(6)
    while ($captureProcess -and $captureProcess.StartTime -eq $expectedStart) {
        if ([DateTime]::UtcNow -gt $captureDeadline) { throw 'Capture is taking more than six hours. It has not been killed; inspect its saved progress.' }
        Start-Sleep -Seconds 30
        $captureProcess = Get-Process -Id $capturePid -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath (Join-Path $captureFolder 'backup.json'))) { throw 'Capture stopped without a completion marker. Keep the partial snapshot and inspect its log.' }
    Update-Deployment 'publishing'
    & (Join-Path $repository 'outputs/publish-personal-backup-20261024.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Publication did not complete successfully.' }
    $uploadDeadline = [DateTime]::UtcNow.AddHours(24)
    do {
        & python outputs/probe-onedrive-backup-20261024.py outputs/disaster-backup-manifest-20261024.json $cloudFolder *> outputs/disaster-backup-cloud-probe-latest-20261024.log
        if ($LASTEXITCODE -ne 0) { throw 'Cloud Files metadata probe failed; inspect its output.' }
        $cloudState = Get-Content outputs/disaster-backup-cloud-state-20261024.json -Raw | ConvertFrom-Json
        if ($cloudState.allInSync -and $cloudState.allCloudOnly) { break }
        if ([DateTime]::UtcNow -gt $uploadDeadline) { throw 'OneDrive did not finish the complete cloud-only upload within 24 hours. No remote protection is claimed.' }
        Start-Sleep -Seconds 60
    } while ($true)
    Copy-Item outputs/disaster-backup-cloud-state-20261024.json outputs/disaster-backup-cloud-only-before-restore-20261024.json
    Update-Deployment 'restoring-cloud-copy'
    # The restricted restoration cannot read or write the live production root.
    $env:HEARTWORD_DATA_DIR = $restoreFolder
    $env:DOTENV_CONFIG_PATH = Join-Path $repository 'outputs/nonexistent-recovery-credentials.env'
    foreach ($key in @('GEMINI_API_KEY','ELEVENLABS_API_KEY','KLING_API_KEY_1','OPENAI_API_KEY','LTX_TOKEN')) { Remove-Item -LiteralPath ('Env:' + $key) -ErrorAction SilentlyContinue }
    $restoreArgs = @('--max-old-space-size=8192','--permission',
        ('--allow-fs-read=' + $repository),('--allow-fs-read=' + $cloudFolder),
        ('--allow-fs-read=' + $restoreFolder),('--allow-fs-read=' + $restoreApplication),
        ('--allow-fs-write=' + $restoreFolder),('--allow-fs-write=' + $restoreApplication),
        ('--allow-fs-write=' + (Join-Path $repository 'outputs')),
        (Join-Path $repository 'outputs/cloud-restore-proof-20261024.mjs'),$cloudFolder,$restoreFolder)
    & node @restoreArgs *> outputs/disaster-backup-cloud-restore-20261024.log
    if ($LASTEXITCODE -ne 0) { throw 'Cloud restoration/proof failed. Keep the immutable cloud backup and isolated restore; inspect the log.' }
    $proof = Get-Content outputs/disaster-backup-cloud-restore-proof-20261024.json -Raw | ConvertFrom-Json
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = 'restored-awaiting-workflow-check'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record.remoteRecoveryVerified = $true
    $record | Add-Member -NotePropertyName cloudRestoreProof -NotePropertyValue $proof -Force
    $record | ConvertTo-Json -Depth 10 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    Write-Output 'Cloud copy restored and verified; normal producer workflow check and final setup remain.'
} catch {
    $message = $_.Exception.Message
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = 'needs-attention'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record | Add-Member -NotePropertyName actionableError -NotePropertyValue $message -Force
    $record | ConvertTo-Json -Depth 10 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    Write-Error $message
    exit 1
} finally {
    [HeartWordBackupPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null
}
