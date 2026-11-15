$ErrorActionPreference = 'Stop'
$attempt = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$repository = 'C:\Users\danbr\OneDrive\Documents\HeartWord'
Set-Location -LiteralPath $repository
$cloudFolder = 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\20261024-first-personal'
$restoreFolder = 'C:\Users\danbr\HeartWordRecoveryDrill\20261024-personal-cloud'
$restoreApplication = $restoreFolder + '-application'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HeartWordRecoveryPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint state); }'
[HeartWordRecoveryPower]::SetThreadExecutionState([uint32]2147483649) | Out-Null
try {
    if ((Test-Path -LiteralPath $restoreFolder) -or (Test-Path -LiteralPath $restoreApplication)) { throw 'Restore directories already exist; inspect instead of duplicating restoration.' }
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $previousAttempts = @($record.restoreAttemptHistory | Where-Object { $null -ne $_ })
    if ($record.actionableError) { $previousAttempts += [ordered]@{at=$record.updatedAt;error=$record.actionableError} }
    $record | Add-Member -NotePropertyName restoreAttemptHistory -NotePropertyValue $previousAttempts -Force
    $record.phase = 'preparing-cloud-recall'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record.actionableError = $null
    $record | Add-Member -NotePropertyName restoreWorkerPid -NotePropertyValue $PID -Force
    $record | Add-Member -NotePropertyName restoreAttempt -NotePropertyValue $attempt -Force
    $record | Add-Member -NotePropertyName permissionRepair -NotePropertyValue 'Preflighted ancestor metadata is replayed for noLinks checks; live data content read/write remains denied. New isolated destination grants explicitly include descendants.' -Force
    $record | ConvertTo-Json -Depth 12 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    & python outputs/prepare-long-path-cloud-recall-20261025.py *> ('outputs/disaster-backup-long-path-recall-' + $attempt + '.log')
    if ($LASTEXITCODE -ne 0) { throw 'Explicit long-path cloud download preparation failed; inspect its saved report.' }
    & node outputs/preflight-recovery-boundaries-20261025.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Recovery ancestor preflight failed.' }
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = 'restoring-cloud-copy'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record | ConvertTo-Json -Depth 12 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    $env:HEARTWORD_DATA_DIR = $restoreFolder
    $env:DOTENV_CONFIG_PATH = Join-Path $repository 'outputs/nonexistent-recovery-credentials.env'
    foreach ($key in @('GEMINI_API_KEY','ELEVENLABS_API_KEY','KLING_API_KEY_1','OPENAI_API_KEY','LTX_TOKEN')) { Remove-Item -LiteralPath ('Env:' + $key) -ErrorAction SilentlyContinue }
    $restoreArgs = @('--max-old-space-size=8192','--permission',
        ('--allow-fs-read=' + $repository),('--allow-fs-read=' + $cloudFolder),
        # One scoped prefix covers the data root and its -application sibling.
        # Separate overlapping wildcard grants lose the shorter root in this
        # Node version's permission matching; live production remains excluded.
        ('--allow-fs-read=' + $restoreFolder + '*'),
        ('--allow-fs-write=' + $restoreFolder + '*'),
        ('--allow-fs-write=' + (Join-Path $repository 'outputs')),
        (Join-Path $repository 'outputs/cloud-restore-proof-20261024.mjs'),$cloudFolder,$restoreFolder)
    & node @restoreArgs --preflight-only *> ('outputs/disaster-backup-permission-preflight-' + $attempt + '.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated filesystem/SQLite permission preflight failed before full verification.' }
    & node @restoreArgs *> ('outputs/disaster-backup-cloud-restore-' + $attempt + '.log')
    if ($LASTEXITCODE -ne 0) { throw 'Resumed cloud recovery proof failed. Preserve backup and isolated output; inspect its new log.' }
    $proof = Get-Content outputs/disaster-backup-cloud-restore-proof-20261024.json -Raw | ConvertFrom-Json
    $flushed = @()
    foreach ($metadataPath in $proof.deferredMetadataFlushPaths) {
        $fullMetadataPath = [System.IO.Path]::GetFullPath([string]$metadataPath)
        $ownedMetadata = $false
        foreach ($ownedRoot in @($restoreFolder,$restoreApplication)) {
            $relativeMetadata = [System.IO.Path]::GetRelativePath($ownedRoot,$fullMetadataPath)
            if (-not [System.IO.Path]::IsPathRooted($relativeMetadata) -and $relativeMetadata -ne '..' -and -not $relativeMetadata.StartsWith('..\')) { $ownedMetadata=$true }
        }
        if (-not $ownedMetadata) { throw 'Refusing to flush metadata outside the isolated restoration' }
        $metadataStream = [System.IO.File]::Open($fullMetadataPath,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::Read)
        try { $metadataStream.Flush($true) } finally { $metadataStream.Dispose() }
        $flushed += $fullMetadataPath
    }
    [ordered]@{at=[DateTime]::UtcNow.ToString('o');backupId=$proof.backupId;flushed=$flushed;contentChanged=$false;liveProductionAccess=$false} | ConvertTo-Json -Depth 5 | Set-Content ('outputs/disaster-backup-restored-metadata-flush-' + $attempt + '.json') -Encoding utf8
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = 'restored-awaiting-workflow-check'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record.remoteRecoveryVerified = $true
    $record | Add-Member -NotePropertyName cloudRestoreProof -NotePropertyValue $proof -Force
    $record | ConvertTo-Json -Depth 12 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    Write-Output 'Cloud restore proof passed; normal chapter-opening/playback check remains.'
} catch {
    $message = $_.Exception.Message
    $record = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
    $record.phase = 'needs-attention'
    $record.updatedAt = [DateTime]::UtcNow.ToString('o')
    $record | Add-Member -NotePropertyName actionableError -NotePropertyValue $message -Force
    $record | ConvertTo-Json -Depth 12 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
    Write-Error $message
    exit 1
} finally {
    [HeartWordRecoveryPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null
}
