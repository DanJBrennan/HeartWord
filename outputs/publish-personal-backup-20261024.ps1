$ErrorActionPreference = 'Stop'
$source = 'C:\Users\danbr\HeartWordBackupStaging\20261024-first-personal'
$targetParent = 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups'
$target = Join-Path $targetParent '20261024-first-personal'
$dataRoot = 'C:\Users\danbr\HeartWordData'
$sourceAbsolute = (Resolve-Path -LiteralPath $source).ProviderPath
$parentAbsolute = (Resolve-Path -LiteralPath $targetParent).ProviderPath
if ($sourceAbsolute -ne 'C:\Users\danbr\HeartWordBackupStaging\20261024-first-personal' -or
    $parentAbsolute -ne 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups' -or
    [IO.Path]::GetFullPath($target) -ne 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\20261024-first-personal') {
    throw 'Resolved source or destination is outside the selected backup paths.'
}
if (Test-Path -LiteralPath $target) { throw 'Destination already exists; never merge or overwrite snapshots.' }
if (Test-Path -LiteralPath (Join-Path $dataRoot '.disaster-backup.lock')) { throw 'Wait for capture to finish and release its lock.' }
$manifestPath = Join-Path $sourceAbsolute 'backup.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.format -ne 'heartword-disaster-backup' -or -not $manifest.completedAt) { throw 'Missing completed backup manifest.' }
$headerInventory = Get-Content outputs/disaster-backup-header-inventory-20261024.json -Raw | ConvertFrom-Json
if ($headerInventory.errors.Count -gt 0) { throw 'Header inventory encountered unreadable source files; review before publication.' }
foreach ($databasePath in $headerInventory.sqliteFiles) {
    $entryPath = 'data/' + ($databasePath -replace '\\', '/')
    if (-not ($manifest.files | Where-Object { $_.path -eq $entryPath -and $_.database })) {
        throw ('SQLite header was not captured through the supported snapshot mechanism: ' + $databasePath)
    }
}
# Same-volume folder relocation avoids a second 156 GiB local allocation.
# It moves only a completed snapshot; the live database and assets stay put.
& node -e "const fs=require('fs'); if(fs.statSync(process.argv[1]).dev!==fs.statSync(process.argv[2]).dev) process.exit(1)" $sourceAbsolute $parentAbsolute
if ($LASTEXITCODE -ne 0) { throw 'Publication must be a same-volume move; no copy/delete fallback is allowed.' }
Copy-Item -LiteralPath $manifestPath -Destination 'outputs/disaster-backup-manifest-20261024.json'
Move-Item -LiteralPath $sourceAbsolute -Destination $target
& node --import tsx scripts/disaster-backup.ts verify $target *> outputs/disaster-backup-published-verify-20261024.log
if ($LASTEXITCODE -ne 0) { throw 'Published snapshot verification failed; keep the files for diagnosis.' }
$event = [ordered]@{state='cloud_pending';at=[DateTime]::UtcNow.ToString('o');summary='Completed backup verified in the new personal OneDrive folder. Upload and cloud restoration remain pending.';destination=$target;id=$manifest.id;publicationMethod='same-volume move after completed capture';remoteVerified=$false}
$event | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $dataRoot 'logs/disaster-backup-status.json') -Encoding utf8
($event | ConvertTo-Json -Compress -Depth 4) | Add-Content -LiteralPath (Join-Path $dataRoot 'logs/disaster-backup-events.jsonl') -Encoding utf8
# Microsoft's Files On-Demand unpin operation preserves cloud files and permits
# local content to be released only as OneDrive makes it safely online-only.
& attrib.exe +U -P (Join-Path $target '*') /S /D
if ($LASTEXITCODE -ne 0) { throw 'OneDrive unpin failed; the verified backup is retained locally.' }
& attrib.exe +U -P $target
$receipt = [ordered]@{at=[DateTime]::UtcNow.ToString('o');id=$manifest.id;destination=$target;files=$manifest.files.Count;bytes=($manifest.files | Measure-Object bytes -Sum).Sum;localVerification='passed';publicationMethod='same-volume move';cloudUpload='pending';remoteRecoveryVerified=$false}
$receipt | ConvertTo-Json -Depth 4 | Set-Content outputs/disaster-backup-publication-20261024.json -Encoding utf8
$deployment = Get-Content outputs/disaster-backup-deployment-20261024.json -Raw | ConvertFrom-Json
$deployment.phase = 'uploading'
$deployment.updatedAt = [DateTime]::UtcNow.ToString('o')
$deployment | Add-Member -NotePropertyName publication -NotePropertyValue $receipt -Force
$deployment | ConvertTo-Json -Depth 8 | Set-Content outputs/disaster-backup-deployment-20261024.json -Encoding utf8
$receipt | ConvertTo-Json -Depth 4
