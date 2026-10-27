param(
  [int]$Take = 1,
  [int]$StartPlacement = 1,
  [switch]$ListOnly
)

# Submit at most one new local LTX final candidate per approved silent shot.
# The candidate remains held for picture/ambience review; this never accepts it.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Take -lt 1 -or $StartPlacement -lt 1) { throw 'Take and StartPlacement must be positive.' }
$checkout = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataRoot = Join-Path $checkout 'output\mark4-donor-20261024'
$worklistPath = Join-Path $dataRoot 'assets\review\meyah-mark4-media-worklist-20261026\worklist.json'
$worklist = Get-Content -LiteralPath $worklistPath -Raw | ConvertFrom-Json
if ($worklist.projectId -ne 'a5a40890-8bb0-4856-aacb-1dcad97074bb' -or $worklist.reviewedPicturePlacements -ne 147) {
  throw 'The isolated Meyah picture worklist is not the approved chapter map.'
}
$logPath = Join-Path $dataRoot 'review\meyah-mark4-silent-coverage-batch.jsonl'
$attempted = 0
Push-Location $checkout
try {
  foreach ($item in $worklist.items) {
    if ($attempted -ge $Take) { break }
    if ($item.treatment -ne 'needs_coverage' -or $item.placement -lt $StartPlacement) { continue }
    if (-not $item.acceptedTargetKeyframe) { throw "Placement $($item.placement) lacks an accepted start frame." }
    $statusText = & npx tsx scripts/run-isolated-mark4-meyah-coverage.ts status $item.targetShotId
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect placement $($item.placement); no LTX request was made for it." }
    $status = $statusText | ConvertFrom-Json
    $prior = @($status.attempts | Where-Object { $_.operation -eq 'generate_final_video' })
    if ($prior.Count -gt 0) {
      @{ at = (Get-Date).ToUniversalTime().ToString('o'); placement = $item.placement; shotId = $item.targetShotId; action = 'skip_existing_final_candidate'; attempts = @($prior | ForEach-Object { $_.id }) } |
        ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath
      continue
    }
    if ($ListOnly) {
      Write-Output "Would submit placement $($item.placement): $($item.targetShotId) ($($item.durationMs) ms)."
      $attempted++
      continue
    }
    . (Join-Path $PSScriptRoot 'refresh-ltx-desktop-token.ps1') | Out-Null
    @{ at = (Get-Date).ToUniversalTime().ToString('o'); placement = $item.placement; shotId = $item.targetShotId; action = 'request_or_check_one_local_final' } |
      ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath
    $resultText = & npx tsx scripts/run-isolated-mark4-meyah-coverage.ts final $item.targetShotId
    if ($LASTEXITCODE -ne 0) { throw "Placement $($item.placement) LTX request failed or is uncertain; reconcile before any further submissions." }
    $result = $resultText | ConvertFrom-Json
    if ($result.status -eq 'needs_draft') {
      @{ at = (Get-Date).ToUniversalTime().ToString('o'); placement = $item.placement; shotId = $item.targetShotId; action = 'skip_reviewed_draft_gate'; reason = $result.reason } |
        ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath
      continue
    }
    if ($result.status -ne 'candidate') { throw "Placement $($item.placement) returned $($result.status); review that gate before any further submissions." }
    @{ at = (Get-Date).ToUniversalTime().ToString('o'); placement = $item.placement; shotId = $item.targetShotId; action = 'candidate_recorded'; result = $result } |
      ConvertTo-Json -Compress -Depth 12 | Add-Content -LiteralPath $logPath
    $attempted++
  }
} finally {
  Pop-Location
}
if (-not $ListOnly) { Write-Output "Recorded $attempted new local candidate(s); no candidate was accepted." }
