param([string]$PlanningCorrectionRunId = '', [string]$SupplementalReferenceManifest = '', [switch]$FreshInitialReview, [string]$ResumeInitialCameraRunId = '', [int]$ShotTaskSize = 32, [string]$ResumeFirstPassRunId = '', [int]$FailedRoleShotTaskSize = 8, [ValidateRange(60,1800)][int]$TimeoutSeconds = 1200, [ValidateRange(400000,600000)][int]$SpecialistBytes = 400000, [ValidateRange(1000000,1750000)][int]$ChapterBytes = 1000000)
$ErrorActionPreference = 'Stop'
if ($SupplementalReferenceManifest) { $env:HEARTWORD_CREW_SUPPLEMENTAL_MEDIA_MANIFEST = $SupplementalReferenceManifest }
else { Remove-Item Env:HEARTWORD_CREW_SUPPLEMENTAL_MEDIA_MANIFEST -ErrorAction SilentlyContinue }
if($PlanningCorrectionRunId){$env:HEARTWORD_PLANNING_CORRECTION_RUN_ID=$PlanningCorrectionRunId;$FreshInitialReview=$true}
else{Remove-Item Env:HEARTWORD_PLANNING_CORRECTION_RUN_ID -ErrorAction SilentlyContinue}
$env:HEARTWORD_DATA_DIR = 'C:/Users/danbr/HeartWordData'
$env:HEARTWORD_CODEX_TIMEOUT_SECONDS = [string]$TimeoutSeconds
$env:HEARTWORD_CREW_SPECIALIST_BYTES = [string]$SpecialistBytes
$env:HEARTWORD_CREW_CHAPTER_BYTES = [string]$ChapterBytes
$env:HEARTWORD_CREW_SHOT_TASK_SIZE = [string]$ShotTaskSize
$env:HEARTWORD_CREW_FAILED_ROLE_SHOT_TASK_SIZE = [string]$FailedRoleShotTaskSize
if($ResumeFirstPassRunId){$env:HEARTWORD_RESUME_FIRST_PASS_RUN_ID=$ResumeFirstPassRunId;$FreshInitialReview=$true}
else{Remove-Item Env:HEARTWORD_RESUME_FIRST_PASS_RUN_ID -ErrorAction SilentlyContinue}
if($ResumeInitialCameraRunId){$env:HEARTWORD_RESUME_INITIAL_CAMERA_RUN_ID=$ResumeInitialCameraRunId;$FreshInitialReview=$true}
else{Remove-Item Env:HEARTWORD_RESUME_INITIAL_CAMERA_RUN_ID -ErrorAction SilentlyContinue}
$env:HEARTWORD_RETAINED_INITIAL_CREATIVE_RUN_ID = 'b66c122d-7722-436b-bab7-a09f4091159f'
$env:HEARTWORD_RETAINED_INITIAL_SCRIPTURE_RUN_ID = '4511c6c3-f3cb-4a7f-8b65-936dc9fdac8e'
$env:HEARTWORD_RETAINED_INITIAL_CAMERA_RUN_ID = '844299e7-6367-4c90-906b-d051bada1dd0'
$env:HEARTWORD_RETAINED_INITIAL_CHOREOGRAPHY_RUN_ID = '7181d4c9-606c-46b1-b482-0976d204d3e6'
$env:HEARTWORD_RETAINED_INITIAL_STAGING_RUN_ID = '9298c395-6570-444d-8b08-71244b1c8fc1'
$env:HEARTWORD_RETAINED_INITIAL_COSTUME_RUN_ID = '5eeda48e-84a7-4e78-bb5d-fc727134d46c'
$env:HEARTWORD_RETAINED_INITIAL_LIGHTING_RUN_ID = '25ed817f-cae7-4a39-86af-8ce9429295e7'
if ($FreshInitialReview) {
  Get-ChildItem Env:HEARTWORD_RETAINED_INITIAL_* | Remove-Item
  $env:HEARTWORD_CREW_FRESH_INITIAL_REVIEW = '1'
} else { Remove-Item Env:HEARTWORD_CREW_FRESH_INITIAL_REVIEW -ErrorAction SilentlyContinue }
& node_modules/.bin/tsx.cmd outputs/mark6-production/review-storyboard.ts
exit $LASTEXITCODE
