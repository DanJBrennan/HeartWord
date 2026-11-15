# Current Goal

## OneDrive upload check (2026-11-13, cloud restore still pending)

Dan requested checking upload completion and restoration from cloud. At
22:47:49 UTC (17:47 Eastern), Windows Cloud Files metadata confirmed 634 of
5,050 repository files / 11,151,697,102 of 88,838,437,098 bytes in sync;
4,416 files remained pending. OneDrive's personal-account popup independently
reported "Uploading files (11%)" at 22:45 UTC. Confirmed files increased from
585 to 634 during the check, so upload was progressing. The adjacent recovery
catalog was also still pending at the first scan.

Full cloud restoration is NOT verified: cached local repository bytes cannot
stand in for missing cloud delivery/readback evidence. No cloud-restore success
was claimed and no live data, backup, sync settings, cache or schedule was
changed. The verified D: backup remains available. Operational evidence:
`D:/HeartWordBackupEvidence/cloud-20261113/metadata-latest.json` and
`D:/HeartWordBackupEvidence/cloud-20261113/ui-status.json`.

## External deduplicated backup and scoped cleanup (2026-11-13, verified)

Dan authorized a current deduplicated backup, verification and removal of only
safe old staging/recovery-test copies, and supplied D: with about 1.04 TiB free.
D: is a separate WD Elements USB disk. Existing D: files and OneDrive snapshots
are retained. Product acceptance is preservation of existing editable chapters,
source/canon/history and producer workflow, with no provider calls or source
corrections, before removal of either local historical-copy root.

Native restic 0.19.1 was downloaded from the official release and its ZIP SHA-256
verified against the release checksums. The current capture passed source
stability: 198,447 files / 462.30 GiB logical, including 102 independently
SQLite-backed/checked databases and 1,286 application files. Snapshot:
`431c99c30baa04f7b926975f29951764b98321d4e45ac7e3ac13ee4832e45b34`.
Packed added data is about 82.57 GiB. Ordinary data and standalone SQLite
overlays are retained with an explicit restore map. A read-only audit of all
102 databases / 5,861 tables / 1,123,672 rows found no cleanup-root references;
43 present external review/provenance files (175,457,656 bytes) are separately
captured in snapshot `b8bd615ed3a9b3d4c3357ae32a7f9212c4281bc64230962bb8fa3685bc548e42`.
Existing absent historical external paths remain recorded rather than invented.

Archive capture completed: all 206,193 files / 417.17 GiB are retained in
`c3ad94264313cf6416e78072f1bbb61af149b5acfd2d74baa89c44b9110408dc`.
Deduplication added just 72.26 MiB of packed archive data. Restic checked all
5,036 packs with no errors. Independent folder restores verified all 102 current
databases (integrity/foreign keys), 1,286 application files, retained full film,
source audio, canon asset and all 43 external references (SHA-256). Archive
tests restored every archived database (12 staging, 64 recovery) plus selected
media/manifests; complete archive membership and source stability also passed.
This is full repository verification plus selected tree restores, not a complete
materialized restore of every data file or a claim of universal historical
project editability. Whole-root Windows
restores exposed a protected C:/Users ancestor timestamp failure; folder-level
restores avoid that ancestor and passed three real-restic integration tests.
Never suppress errors or use skipped-file restoration as proof. Evidence,
recovery instructions and the repository key are retained outside C: under
`D:/HeartWordBackupEvidence/20261113`, `D:/HeartWordBackupRecovery` and
`D:/HeartWordBackupTools`; repository: `D:/HeartWordBackups/restic`.

Both old C: roots were removed only after their corresponding restore proofs;
the new temporary C: validation trees were also removed. About 417 GiB of old
copies were retired; C: had 567 GiB free before the initial OneDrive local copy.
The live HeartWordData, revisions, worktrees, exports and older OneDrive
snapshots remain in place. Cross-drive/reference audits found no additional
present files on other drive letters and no cleanup-root database references.

The Windows task **HeartWord verified backup to D and OneDrive** is installed
and passed an actual scheduler launch in CheckOnly mode. It runs at 23:30
Eastern, retries hourly, requires the expected D: disk/personal OneDrive root,
and checks 15 minutes of user/database inactivity before capture. Consistent
deduplicated capture and independent verification precede Robocopy of encrypted
repository changes. No /MIR, /PURGE or automatic snapshot pruning is used.
Code/config/key are installed outside the checkout under
`C:/Users/danbr/.config/HeartWordBackup`, with recovery copies on D:. The initial
OneDrive local repository copy completed with zero Robocopy failures/mismatches;
all 5,050 copied files / 88,838,437,098 bytes passed SHA-256 verification. Cloud
upload/remote recovery remains unconfirmed. A small verification/recovery
catalog accompanies local copies. Final C: free space is about 483 GiB.

Seven native-restic integration tests and the 857-test project suite passed.
Additional real Windows probes checked scheduling, changed-data-root refusal,
and guarded scratch cleanup with a 301-character path. The dedicated final
Goal Guardian review passed: completed copy/cleanup receipts match; all 102
source databases/WAL state remain unchanged, current data/revisions stay in
place, and deletion stayed within the authorized old roots and temporary C:
test trees. No generation, provider calls, migrations, approvals or production
workflow changes were performed. Evidence and final space/schedule results:
`D:/HeartWordBackupEvidence/20261113/goal-guardian-review.json` and
`D:/HeartWordBackupEvidence/20261113/final-result.json`.

## Disk-space review (2026-11-13)

Dan requested advice on disk capacity. Read-only metadata/allocation scan found
HeartWordData at 462.11 GiB (including 285.97 GiB of revisions), separate backup
staging at 174.09 GiB, recovery drills at 243.08 GiB and HeartWordExports at
28.11 GiB. Personal OneDrive's HeartWordBackups occupy only 23.72 GiB locally
despite 316.84 GiB logical content. HeartWord language-edition and Mark 6
worktree directories additionally occupy 68.44 and 15.01 GiB respectively.
Evidence: `outputs/disk-space-20261113.json` and its measurement script.
Allocation totals are approximate: links were skipped, inaccessible system
files omitted and hardlinks may be counted per path. No file content was read
by this scan, and no cleanup, move, cache eviction or schedule was performed.
Recommended priority is a current verified backup, then review/archive of old
staging/recovery copies, followed by duplicate revision/output consolidation.
No originals or editable history are designated disposable by this review.

## Manual backup delta measurement (2026-11-12)

Dan requested measuring changes since the last OneDrive data backup and whether
a delta fits. Read-only comparison against `20261030-before-gemma/backup.json`
(completed October 30 at 20:18 UTC) measured 197,166 current files / 462.11 GiB:
76,079 new paths, 20 modified files, 121,067 unchanged files and three removed
paths. Copying every new/modified path would require 303.45 GiB before overhead,
exceeding the 140.56 GiB free on C:.

Whole-file content reuse against the baseline, plus deduplication among new
files, reduces new payload to 40.69 GiB (44.76 GiB with 10% headroom). Two such
copies would fit within current local capacity. Hash comparisons used current
file bytes and the saved manifest; baseline media was not recalled. No measured
file changed during the scan. Evidence: `outputs/backup-delta-20261112.json` and
its measurement script. This is a sizing result, not a backup or restore proof;
application changes, consistent SQLite snapshot overhead, metadata and external
referenced assets were outside the measurement. The existing full-copy runner
does not implement this deduplicated delta. No backup format, retention policy,
scheduling or production behavior was changed. The earlier cloud-readback gap
below remains unresolved. Dedicated Goal Guardian review: measurement serves
preservation of saved chapter media/history and the existing producer workflow;
no generation, new product requirement or backup implementation was introduced.

## October 30 manual backup: cloud readback blocked by local capacity (2026-10-31)

The completed `20261030-before-gemma` snapshot passed local capture and published
copy verification (122,375 files, 57 SQLite databases). All 122,376 cloud entries,
including the manifest, passed uploaded/in-sync and online-only metadata checks
before readback. The separate code checkpoint already passed cloud bundle
readback. Capture source-stability checks have finished.

Fresh full cloud content verification is **incomplete**. Explicit long-path
downloads finished, but C: now has only 10.4 GiB free while about 137.6 GiB of
snapshot content remains offline. Only the scoped read-only verifier was stopped
to protect disk headroom; production, original files and all snapshots remain
intact. About 147.3 GiB additional free space is needed for the remaining recall
plus a 20 GiB reserve, or an adequately sized recovery destination is needed.
Evidence and exact byte counts are in `fresh-backup-cloud-verification.json`
under the October 30 Codex preservation evidence directory. No new full restore
is claimed; October 26's isolated drill remains separate historical evidence.
Nightly scheduling remains disabled. The temporary backup follow-up is stopped
pending Dan resolving capacity; no model integration or production change made.

## R9 closing website-line removal (2026-10-31)

Dan subsequently approved all three R9 versions and requested OneDrive copies
for distribution to Ryan. The 720p, 540p and 360p MP4s were copied into
`C:/Users/danbr/OneDrive/Documents/HeartWord Distribution/Hatam Mark 5 - Ryan - 2026-10-31/`
and each copy's SHA-256 verified against its approved source. The exact approval,
hashes and copy receipt are retained in
`R9_PRODUCER_APPROVAL_AND_ONEDRIVE_COPY.json` beside the delivery report, and a
verification record accompanies the copies. This supersedes the earlier R9
producer-approval-pending state for these versions only. Native field approval
is not inferred; no message, public publication or shared link was created.
Local OneDrive copies are verified; cloud synchronization has not been verified.

Dan has deferred a new ministry name pending partnership discussions and explicitly
requested removal of only `heartword.ai` from this Hatam Mark 5 closing scroll.
The revised candidate keeps the seven other credit lines, their original pixel
positions, background, scroll speed and 14-second duration. This is a chapter-only
override of the older website credit, not an adopted rebrand or new domain claim.

`Markus5_Hatam_no_website_r9_720p.mp4` is under the same revision export directory
as R8. All 13,402 delivery frames before the replacement are exactly R8; all
audio packet data/timestamps and the full presentation clock are exactly R8.
The 13,737-frame, 572.38-second film fully decodes. The 360p viewing copy is
49,405,334 bytes. Dan also requested a 540p delivery: 960x540, 123,226,713
bytes, with the same 13,737 frames, duration, clock and bit-identical AAC packets
as the 720p revision; full decode passed. Source/canon rows, live database, approved master and all prior
candidate/archive evidence remain intact. The producer-retained R5 bridge issue
remains recorded and unresolved. No new provider calls or API fees.

Existing editorial-media selection, native render/finishing records and the
portable source recipe carry the edit in the isolated revision workspace. A
fresh SQLite snapshot reopens with 112 picture placements, 146 source intervals,
13 cue bindings, the revised closing and no programme issues. R9 scripts, graphics,
text, checks and database snapshot are retained under
`assets/preparation/sequence-score-revision-20261030/credits-r9/`.
The existing self-contained R8 archive is unchanged; R9 is retained in the working
revision and snapshot, with no new self-contained archive or clean-machine/full
cold-render claim. Repository check outcomes are recorded in `R9_REPORT.txt`.
Separate Goal Guardian review confirms the requested scope and editable chapter
workflow, without introducing another brand, new stage, or release approval.

## R8 Jesus closeup continuity repair complete (2026-10-31)

Dan's4:09 wrong-listener report is fixed by reframing the existing Jesus speech
shot, crop896x504 at32,0 to720p. All192 native frames checked: incorrectly
short-haired white-shouldered foreground man absent; Jesus' original performance
preserved, with correct healed-man views either side. No generated face/speech.
Actual filmframes5963–6154, nominal248.470–256.450s; source/audio clock unchanged.

Native render`4b5f963e-6450-46e5-8aaf-c9fccc3bc7b3`, SHA256
`76854fcb6484a7fab0de61ef8c403ad4b40a331753fc19b15c35e2c955c40a2d`. All13737 actual delivery frames match R7 plus encoded closeup;
every other decoded delivery pixel EXACTLY R7. All final audio packets/timestamps
match R3.12 changed native placements match source-frame recipe; full decode
passes. Source/canon/live DB/approved master/R3–R7/criticism and pinned prior
reports/receipts/archive markers preserved. Earlier R5 bridge issue stays open.

Fresh857tests/126files and both TypeScript checks pass; no runtime code change,
generation, paid QC or other media API call. Ledger/protected budget unchanged
$193.626948/$200, old timeout maximum still unresolved.
Standard archive fully copied/restored to new root:4528files/
24167419548bytes, all hashes, native112placements/146source intervals,
13 cue tracks/six assets and portable recipe verified, no programme/FK issues;
unresolved bridge note also verified. Separate Goal Guardian completion passes
source-faithful editable workflow. No new full lossless working render, second
cold picture render, clean-machine or producer/native/release approval claimed.

Delivery under`C:/Users/danbr/HeartWordData/revisions/hatam-mark5-sequence-score-20261030/exports/sequence-score-review-candidate-20261030`:
`Markus5_Hatam_Jesus_close_candidate_r8_720p.mp4`, `R8_REPORT.txt`,
`editable-chapter-r8-Jesus-close-20261031`, `r8-package-reopen-proof.json`.
Held for review, all earlier candidate/archive history retained, no live promotion.

## R7 producer-selected R5 bridge candidate complete (2026-10-31)

Latest Dan choice is honored: keep R5 messenger bridge and finish other repairs
with its issue recorded. Exactly183 working frames at433.625–441.25s are R5;
every other working frame remains R6. Chain/anguish/approach/kneel/bow repairs,
two wrist-hiding reframings, approved offscreen anguish, woman reorder, brown
quote foreground/original performance, food bite/chew, score and credits stay.
The R5 jump at436.125s and ambiguous recipient establishment remain UNRESOLVED,
recorded in native shot review and report; no continuous-turn/staging-pass claim.

Native render`6dab0084-3314-49b8-ac56-d369f0480a54`, SHA256
`e9d8170fc0d67b6f51915175c51173bce0972e873c38dd642c2bf808d3764e94`. H264High720p24fps/13737frames/572.38s;
112picture placements/146source intervals,13 native cue tracks/six assets.
Exact working-frame selection, source/canon/master/live DB/R3–R6 preservation,
native changed-placement reconstruction, original audio packet/timestamp identity
and full decode pass. Fresh857tests/126files and both TypeScript checks pass.
One local render failed the frame gate and remains held; corrected output passes.
No runtime code changes for R7; no new generation/paid review/API fees.

Standard editable archive exported and fully copied/restored into a new empty
root: 4484files/23641618887bytes, all hashes checked; native cue controls,
recipe verification, no programme/FK issues. Separate Goal Guardian media/native
and final restoration passes preserve product scope and Dan's review workflow.
No second cold picture render or clean-machine install claim. R6 and all older
candidates/archives/criticism remain intact. Protected budget unchanged
$193.626948/$200; prior timeout maximum still unresolved.

Delivery under`C:/Users/danbr/HeartWordData/revisions/hatam-mark5-sequence-score-20261030/exports/sequence-score-review-candidate-20261030`:
`Markus5_Hatam_R5_bridge_candidate_r7_720p.mp4`, `R7_REPORT.txt`,
`editable-chapter-r7-R5-bridge-20261031`, `r7-package-reopen-proof.json`.
Held for review with bridge issue retained, no producer/native/release approval
or live production promotion inferred.

## R6 local continuity review candidate complete (2026-10-31)

Goal Guardian: source-faithful editable Hatam Mark5 chapter for Dan to review as
one complete candidate, using existing stages and normal producer/edit workflow.
Authorized chain/anguish/approach/kneel/later-bow repairs now pass actual-motion
and assembled AV checks. Matching cuff/remnants persist on visible wrists; two
later original reframings hide wrists; approved offscreen anguish stays. R5 woman
reorder, existing quote performance, R4 food bite/chew and ten-cue score remain.

Messenger is a reviewed deliberate clean-angle cut at436.791667s, not a continuous
camera turn. Both raw messenger takes stay held; no additional generation was
needed after latest editorial direction. Six local video calls total; seven
built-in reference edits; no cloud video or paid request retry. Source audio,
cast order/speed/clock, source/canon rows, approved master, R3/R4/R5, independent
critique and live DB are unchanged. Final audio packets/timestamps match R3.

Final native render`384574e1-d306-4bc4-bdc6-f9934b67649a`, SHA256
`c1f971375c12e47e4be9502e7127df48e594162b6dc53d992d0c98661ba669cb`. H264High720p24fps,13737frames,572.38s;
112picture placements,146source intervals,13cue bindings/six assets. All11 changed
native EDL placements reconstruct verified working pixels; full final decode
passes. Intermediate native bin/offset discrepancies were corrected in new held
records, with old history retained. Full857tests/126files and both TypeScript
checks pass. Necessary existing-packager chunked hashing was separately reviewed.

Editable archive exported and actually restored to a different empty root:
4438files/23115608591bytes, all package/restored hashes checked; native
reopen and portable recipe verification pass, no FK/programme issues. Actual
automated technical finishing review exposes all13 native cues; producer
and release approvals remain unset. Standard package format unchanged; verified
unchanged-file reuse preserves older archive/restore/cache without deleting them.
Archive/restored files have different identities; no second full byte-copy claim.
Separate Goal Guardian media/native and final restoration passes found scope/workflow
preserved. No full second cold picture render or clean-machine install claimed.

Additional Gemini usage estimate$0.96730725 plus
$0.1375035 unresolved timeout maximum =
$1.10481075/$2 incremental cap. Unused capacity released;
invoice reconciliation pending. Protected whole-film commitment
$193.626948/$200. Local video/configured free text
encoding API fees$0; built-in images/Sol Medium planning used Codex allowance.

Delivery/report/archive under:
`C:/Users/danbr/HeartWordData/revisions/hatam-mark5-sequence-score-20261030/exports/sequence-score-review-candidate-20261030`.
Watch`Markus5_Hatam_continuity_candidate_r6_720p.mp4`; report`R6_REPORT.txt`;
archive`editable-chapter-r6-local-continuity-native-cues-final-20261031`;
proof`r6-final-package-reopen-proof.json`. Held for Dan's review; no producer, native
Hatam, field, source/canon or release approval/promotion inferred.

## Approved woman/messenger picture reorder (2026-10-30)

Dan approved finishing the woman episode before beginning the messenger handoff.
Native R4 inspection finds a19-frame return to the woman at435.333–436.125s,
between60 arrival frames and123 waiting frames. A separate R5 review candidate
moves those19 frames before the arrival: woman432.833–433.625s, messenger from
433.625s onward. Quote onset441.250s stays fixed. Lossless finished-picture
permutation preserves every decoded picture frame; final audio packets/timestamps
are copied unchanged. All13,737 decoded frames exactly match the authorized
permutation; every audio packet payload and timestamp matches R4. Isolated native
registration/reopen passes: render3e81a037-dd93-48b9-9e3f-a7718dce55a2,112 picture
placements,146 source intervals,103 retained reconstruction input hashes verified.
Full suite:855/856 pass, one5s timeout; isolated17-test file rerun passes with
30s timeout. No runtime code changed. R5 is a held review candidate, not film
approval; prior R4 portable archive remains R4, not a new R5 archive.
No chain generation/repair is included, and R4/old archives remain preserved.

Dan additionally raised the unclear recipient at441.250s. Approved Jairus wears
cream and dark umber; the quote's foreground shoulder is rusty red. Intended
recipient is Jairus in the brief, but the partial head cannot certify identity,
and the selected approach does not show a clear turn to him. Retained alternatives
do not supply an honest turning bridge. Exact inputs/options are prepared; no
new image/video generation or paid review has been dispatched. The approved
swap also exposes the existing arrival/waiting take cut at436.125s; do not claim
one seamless approach or that the swap resolves the recipient issue.

Local correction evidence and exact before/after EDL:
`C:/Users/danbr/.codex/visualizations/2026/10/30/01a18f02-ab9a-7172-94c7-7bcb56ad4747/sequence-score-revision/messenger-handoff-r5/FINDINGS.txt`.

## Read-only opening chain-continuity review (2026-10-30)

Dan's current R4 review identifies an intact-chain reset at51s, weakly motivated
release, and missing wrist remnants in later anguish/run/kneeling. His latest
clarification explicitly accepts dangling broken remnants and explores intact
restraints first, visible effort causing a break, then persistent remnants.
Do not interpret older broad cuff concerns as a categorical ban or add an
unwritten removal. No canon policy, approved asset or film has been changed.

Local native-frame/clip inspection confirms the51s cut resets earlier broken
aftermath to joined restraints; cuffs themselves remain after the central chain
span drops.65–72s wide anguish,84–89s run and89–91.630s kneeling expose bare wrists;
72–78s approved offscreen-injury close-up and78–84s spotting crop hide wrists,
so they are not evidence of bare wrists. Preserve the specific72–78s override.
An old emergence take has useful dangling remnants but its proposed later run/
kneeling join is unverified. The stronger old breaking take has failed chain
physics; the current take has weak effort. Reordering alone is not a full fix.

An integrated picture-only proposal and complete shot-state map are ready for
discussion, including all later wrist repairs and exact5s/8s options. Showing
breaking at arrival is an illustration of the source's habitual prior strength,
not an explicitly dated new event or Jesus-caused miracle; narrative-time choice
remains for Dan. No chain revision, new generation, paid review, source/audio/
timing change or live production write. The separate approved R5 messenger edit
above does not implement the chain proposal. Prior approval history retained.
Evidence and viewable excerpts:
`C:/Users/danbr/.codex/visualizations/2026/10/30/01a18f02-ab9a-7172-94c7-7bcb56ad4747/sequence-score-revision/chains-continuity-review-20261030/FINDINGS.txt`.

## Review candidate ready: Hatam Mark 5 sequence, score and food revision (2026-10-30)

Dan authorized correcting opening causality and making roughly ten emotional
music beats audible while preserving the approved source performance and clock.
Work extends existing assembly/finishing and chapter-preservation stages in an
isolated restoration; no runtime code, live production DB or approved master was
changed. The source-faithful, editable assembled-cut review workflow remains the
acceptance target, rather than a new subsystem or wholesale regeneration.

Initial held R3 replaces only the premature 22–30s run with retained portrait/
coast imagery and crops the 80–83.212s spotting shot. The actual later approach,
all 146 source intervals, care pause and credits retain their clock. Ten explicit
music cues use the three admitted instrumental assets with local level preparation
and speech ducking; quieter cast windows get detector-only extra ducking. Actual
final audiovisual QC hears all ten cues with speech foreground and finds the
opening coherent. This is review evidence, not producer/native/release approval.

Native render/manifests/held finishing decisions retain 112 editable placements,
exact source/cast mapping, numeric cue recipe, originals and rejected history.
Existing normal producer view exposes the full film and timeline; separate cue
audition stays held because this manual candidate lacks an approved crew finishing
review. No approval was fabricated to clear it. The offline reconstruction
verifier passes 103 selected input hashes; a second full cold helper render is
not claimed. Standard chapter-package inspection passes with no dependency or
editability issues; export/verification receipts accompany the delivery.

Selected held R4 now corrects food action in the unchanged553.380–558.380s
slot. Exactly one authorized local LTX2.5 Fast5s take used the accepted composed
keyframe; source/canon/spend/idle/lease gates passed. Saved encrypted session and
installed on-demand model were verified. Current primary docs establish the
configured API text encoding FREE; I2V enhancement and API-video preference
were off. Earlier assumed dependency/cost permission holds are superseded.
No24.5GiB download or paid video fallback. Original returned121frame704p video
and unexpected audio are retained; the selected120frame720p picture excludes
generated audio. Standalone motion and actual final9s audiovisual context QC
observe bite, reduced bread portion and subsequent chew, with no material new
integrity/transition concern. R4 reuses110 verified picture placements and
copies the entire R3 final AAC bytes and packet timestamps. All146 source
intervals, care pause and credits clock remain. Full decode, native112-placement
projection, source/canon/original hashes and103-input reconstruction checks pass.
R4 is a candidate awaiting Dan; swallowing/native/release approval not claimed.
A deeper reopen pass caught five missing native finishing-brief cue IDs; an
append-only held record reconciles all13 cue references to six retained verified
assets. Prior history, movie/audio and approval gate remain; no render/QC repeated.

Final corrected native archive verification and fresh-root reopening pass:
4,042 retained files / 12,590,745,972 bytes, all copied-file hashes, foreign keys,
112 native placements, 103 reconstruction inputs and all 13 cue references to
six verified assets. Matching restored application reads the selected R4 movie.
No second full picture render or clean-machine installation is claimed.
`DELIVERY_COMPLETE.json` beside the report identifies the final archive, reopened
root, review comparisons, complete current costs and unchanged original hashes.
All previous archives and records remain retained.

Food QC estimated $0.1267485/$0.15; earlier revision QC $0.845031 and independent
review $0.81969675. Total Gemini reviews $1.79147625 estimated; protected film
commitment $192.52213725/$200 including saved unknowns/liabilities, invoice
pending. Isolated native ledger contains idempotent receipts and settled food
reservation; live DB/ledger remains untouched, so future live gates must still
include these sidecar costs. Local video/API text encoding cost $0 per existing
design and current primary pricing. Original one saved-login Sol Medium planning
call remains36,105 input/5,616 output tokens, with no paid planning fallback.
No global runtime/provider/mixer changes, publishing or distribution. R3 and
approved original archives remain intact; latest food preservation receipts and
current detailed report are linked below. Earlier active work remains preserved.

Full suite rerun with four workers: 856 tests / 126 files PASS. The first run
retains two 5-second timeouts (854 passed); neither timeout recurs with reduced
parallelism. Dedicated Goal Guardian pass confirms scoped review workflow and
documents the interface limitation, food blocker and retained canon concern.
Original master, bound sources, production DB and pristine first independent
critique retain pinned hashes. All earlier entries/active backup decision below
remain preserved; no multi-purpose plan document was moved as fully complete.

Delivery and full report:
`C:/Users/danbr/HeartWordData/revisions/hatam-mark5-sequence-score-20261030/exports/sequence-score-review-candidate-20261030/REPORT.txt`.

## Completed: independent Hatam Mark 5 film critique (2026-10-30)

Dan requested an independent review of the unchanged delivered film before any
corrections. A fresh Gemini audiovisual call received the complete native 720p
master with original soundtrack, verified Hatam/English text, and neutral craft
instructions; no earlier verdicts, producer complaints or experiments entered
its input. Its untouched first report remains retained. A separate 56-second,
native-size review reel checked selected concerns at a requested 24fps after
the full-film pass's requested 4fps sampling.

Evidence checks did not sustain the initial high-severity eyeline allegation.
Remaining candidates concern anguish performance/sound, swine-plunge motion,
minor rising/cloth artifacts and optional walking-insert variety. They are
qualified model observations, not native Hatam or release certification. The
full report explicitly rejects unsupported studio-monitoring/frame-matching
claims and follow-up observations outside the supplied excerpts.

Two review calls used 983,084 input, 12,113 candidate and 9,856 thinking tokens:
usage-based estimated cost $0.81969675, invoice pending, below the $1 cap and
the $0.878667 conservative aggregate bound. Existing read-only film spending
gate passed with $9.269339 available including retained liabilities. Isolated
receipts retain this additional cost; the unchanged production ledger does not
yet include it, so later spending must account for the receipt separately.
No paid retries, fallback, corrections, generation, source/canon/production DB
changes, rendering or distribution occurred. Master/source hashes remain pinned;
later alignment work must preserve this delivered baseline. Earlier work and the
active backup decision below remain unchanged. Full suite: 856/126 PASS.

Report, initial critique, verification, usage receipts and separate Goal Guardian:
`C:/Users/danbr/.codex/visualizations/2026/10/30/01a18f02-ab9a-7172-94c7-7bcb56ad4747/independent-film-review/REPORT.txt`.

## Completed: corrected focused-context trial (2026-10-30)

Dan authorized restoring essential canon facts and producer decisions, then one
new Sol Medium subscription-authenticated opening-planning call. It used
121,295 input / 5,112 output tokens in 104.024 seconds: 61.9% fewer input tokens
than the retained representative baseline, with no baseline rerun. The weekly
account meter remained 33% used; shared rounding/delay prevents exact quota
attribution. No expanded-context settings or paid API-key fallback were used.

All 27 deterministic checks for the identified essential input set pass. The
result now cites the detailed approved Gerasene canon note and carries its
restraint/chain concern forward, alongside the applicable producer overrides,
source clock, role-owned concerns and audio exclusions. Eleven valid placements
cover the unchanged 76,212-ms source interval. The bounded metadata trial passes;
application still needs actual media/producer review and canon reconciliation.
This is no new defect verdict or production hold on the approved film.

Narrow context filtering is suitable for further limited trial, not production
rollout or architecture redesign. Stopped after step 1: no independent critique,
reviewer packet, film/music edit, generation, provider routing or production DB
write. Master, bound sources and 12 candidate clips rehash unchanged. Gemini's
source/audio alignment role and native Hatam distribution gate remain intact.
Report, receipts, completeness checks and dedicated Goal Guardian review:
`C:/Users/danbr/.codex/visualizations/2026/10/30/01a18ee3-abe6-7072-b621-06c18f7d92c2/sol-context-comparison-20261030/corrected-focused-20261030/REPORT.txt`.
Full suite: 856 tests / 126 files PASS. Earlier work below remains preserved.

## Completed: bounded Sol Medium context comparison (2026-10-30)

Dan authorized a controlled subscription-authenticated Sol Medium comparison of
existing versus focused context for Hatam Mark 5 opening picture planning.
Two model turns completed at standard/default speed: 318,142 versus 109,038
input tokens (65.7% reduction), 4,977 versus 5,398 output tokens, and 113.753
versus 98.097 seconds. Both metadata plans preserve the approved opening and
76,212 ms of continuous source audio; no film or production record changed.

The focused packet failed full context-completeness: it omitted the detailed
approved Gerasene canon note that allowed the baseline to surface a
verse-specific restraint/chain concern. This is no new defect verdict on the
approved film. Improve the existing context packet's retention of controlling
canon facts and producer decisions before broader substitution; no full
architecture redesign or provider migration was implemented or approved.
Gemini retains verified Scripture-to-recorded-audio matching. Media inspection
and generation remain separate capability questions.

The shared weekly account meter read 31%, then 32%, then 32% used; concurrent
activity, rounding and reporting delay prevent exact per-call attribution or a
token-to-quota conversion. Later large contexts exceeded CLI character/default
practical token limits; an earlier complete prompt was used as a disclosed
representative baseline, with no silent truncation. No paid API-key calls,
fallback, edits, generation or blinded film critique occurred. Master, bound
sources and 12 candidate clips rehash unchanged. Native Hatam field review is
still required before distribution.

Report and retained prompts, outputs, usage receipts, verification and separate
Goal Guardian review:
`C:/Users/danbr/.codex/visualizations/2026/10/30/01a18ee3-abe6-7072-b621-06c18f7d92c2/sol-context-comparison-20261030/REPORT.txt`.
Full repository suite: 856 tests in 126 files PASS. This completed experiment
does not replace the existing preservation/backup work below.

## Work preservation before local Gemma evaluation (2026-10-30)

Dan requested saving unfinished work and organizing open chats before evaluating
local Gemma. All 16 registered Git checkouts now have named preservation refs;
a verified all-refs Git bundle and hash-checked copies of 232 modified/untracked
files are retained outside the repository at
`C:/Users/danbr/OneDrive/Documents/HeartWord Work Checkpoints/2026-10-30-before-gemma`.
The checkpoint manifest identifies original paths, HEADs, branches and hashes.
This is a code checkpoint, not a production-data or Mac backup; cloud sync of
this checkpoint has not been verified. Original checkouts remain intact.

Seventeen completed chats and nine parked-work chats were organized into named
sidebar sections without deleting chats or worktrees. Separate branches remain
separate; no merge, reset or production approval was inferred. The current main
and Meyah language-edition branch tips match GitHub. Full suite: 856 tests in
126 files passed. A separate Goal Guardian pass found only preservation and
organization changes, preserving the existing producer workflow.

Dan then explicitly requested a fresh manual production backup. The existing
snapshot procedure will capture the current database/media/application state;
completion, cloud upload and recovery verification must be reported separately.
Nightly scheduling remains disabled pending the existing daily-policy choice.
No Gemma installation, provider migration or production generation has begun.

## Recorded: preferred production lip-sync technique (2026-10-30)

After watching the Peter last-frame continuity test, Dan said "It looks good"
and explicitly requested recording this technique as preferred for production
runs. **Prefer local LTX Fast A2V with short speaking sections (aim three seconds,
maximum four), each continuation using the previous clip's last retained frame
as its starting-image reference.** Preserve one continuous original audio track
and source clock, remove generated text, and review the full line/joins through
existing production/QC before acceptance. Five-second speaking clips failed;
five-second native generation containers may contain only tail silence beyond
the selected short speech window. No delayed lead, retiming or added dialogue.

The authoritative procedure is now at
`docs/production/LTX_LIPSYNC_EXPERIMENT.md#preferred-production-technique--producer-decision-october-30-2026`,
linked from PRODUCT_VISION, ARCHITECTURE, USER_WORKFLOW and the audio/media design.
It supersedes the October 6 Kling-first preference. Derived last-frame refs
remain distinct from approved canon, retain source/video/frame/hash provenance,
and preserve native framing rather than accumulating crop zoom. Initial-image
conditioning is not a hard timed-keyframe lock; expression/motion may still drift.
Kling remains available under existing production/source/cost/review gates.

Implementation gap is explicit: the verified standalone runner and retained
assembly procedure support the technique, but `src/pipeline/voice-lipsync/index.ts`
still directly constructs `KlingLipSyncProvider`. Ordinary scene-motion LTX
selection does not implement A2V chaining. This unit records Dan's production
policy; it does not claim or perform automatic-stage migration or regenerate
accepted footage. Production planning/operator-run work should use the preferred
procedure; future automatic integration belongs in the existing stages.

The preference is also active global production-crew guidance, lesson
`968013ad-2358-4765-9372-5d6e8051ef89`, saved through the existing guidance API
with Dan's source note and activation history. Readback confirms global/active
status and no conflicting active provider/lip-sync lesson. No production run
was started. Audit: `outputs/ltx-production-preference-guidance-20261030.json`.
Documentation whitespace/procedure-link checks and all 856 tests in 126 files
passed (`outputs/ltx-production-preference-tests-20261030.txt`).

Goal Guardian: matches source-faithful voice/lip-sync and inspect/correct workflow;
records an explicit producer decision without new stages, invented requirements,
source/canon/voice changes or blanket acceptance of future takes.

## Completed: Peter last-frame continuity test (2026-10-30)

Dan still saw transitions and requested carrying the outgoing last frame as the
next keyframe. The local A2V route accepts an initial image, not a forced timed
keyframe. The complete frame-chain test is ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-peter-frame-chain-20261030/peter-full-line-frame-chain.mp4`.
See the packet's `RESULTS.md` for evidence and limits.

Reuse section 1 from the prior Peter line. Section 2 (`db9b86fc`) is generated
from native frame 75, the last of 76 retained first-section frames. Section 3
(`4e0f9921`) uses new section 2 native frame 77, the last of 78 retained frames.
Carried refs preserve native coordinates and every top 550 pixel exactly; only
bottom 154px outside the delivery crop is edge-padded to remove caption carryover.
This avoids progressive crop zoom. Approved Peter v4 remains separately pinned;
derived frames are not new canon approvals. Source-video/reference hashes,
source-frame indices, original canon/audio binding and pixel proof are retained.

Both joins visibly retain outgoing pose much more closely than independent
canon starts. Fixed face-region adjacent-frame mean absolute RGB change falls
from 22.55 to 4.57 and 23.44 to 3.89 at the two cuts. These are boundary measurements,
not proof of lip-sync, identity stability or seamless performance. LTX still
reconstructs initial images and changes subsequent motion/expression; section 3
quickly widens the eyes. Producer playback must assess the full sequence.

Straight joins at 3.166667s and 6.416667s deliberately use no interpolation,
dissolve, held lead, audio shift or speed change. Exact original speech windows,
236-frame 24fps clock and complete full-line AAC are preserved. Every audio
packet hash, PTS/DTS and duration matches the preceding full-line assembly.
A retained PCM MOV verifies every original sample. All decoded final frames
match selected sections in order; full decode passed. Native captions are
removed by the same 980x550 x150/y0 crop, scaled to 1280x720; all 236 selected
lower-frame regions were inspected without text or edge-padding stripes.

The isolated experiment harness accepts pinned continuity-frame evidence,
checks last retained index versus padded tail, retains approved canon separately
and keeps approved-canon comparisons labelled correctly. Typecheck and all 856
tests in 126 files passed, logged in
`outputs/ltx-peter-frame-chain-typecheck-20261030.txt` and
`outputs/ltx-peter-frame-chain-tests-20261030.txt`.

Goal Guardian dedicated pass saved in the packet: delivers the requested
source-faithful continuity experiment and inspect/correct workflow, with limits
explicit. No new stage, invented dialogue, production-provider change,
canon/source approval or chapter edit. Playback acceptance remains with Dan.

## Completed: longer Peter line split and smoothed (2026-10-30)

Dan requested the same short-clip/stitch/smooth experiment for Peter, original
audio timing and no text. The complete approved Peter v4 Mark 5:31 performance
(9.798821s, 432128 mono samples at 44.1kHz) is ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-peter-stitched-20261030/peter-full-line-smoothed.mp4`.
The packet's `RESULTS.md` indexes the final, individual reviews and evidence.

Three new local LTX Fast requests (`201401b1`, `aff699f8`, `c1bd4565`) use the
same approved portrait, direction and seed 42. Exact source speech sections:
3.166667s, 3.250000s, 3.382154s. Cuts at 3.166667s/sample139650 and
6.416667s/sample282975 are frame-aligned inside measured pauses. Both submitted
stereo channels match original selected PCM, only tail silence fills native
five-second requests, and all samples cover the full source with no gap/overlap.

One uninterrupted full original WAV supplies the assembled soundtrack, encoded
once; smoothing copies every AAC packet and its PTS/DTS/duration unchanged.
A retained PCM MOV verifies every original source sample. No added audio pause,
shift, speed change, gain change, repeated word or synthesized speech.
All 236 video timestamps remain at the original 24fps clock (9.833333s picture;
only its last frame extends 34.512ms past the source endpoint).

Motion interpolation smooths frames 74–79 (3.083333–3.291667s) and 151–154
(6.291667–6.416667s), wholly within measured source pauses. The second bridge
ends on the incoming closed-mouth pose to avoid spreading later mouth opening
backward into the pause. A longer initial bridge is retained separately.
Short interpolation softness remains, especially at the first join. Every
outside-bridge frame matches the straight cut in the lossless picture master.

All native takes invented captions; identical 980x550 x150/y0 crop, scaled to
1280x720, removes them. All 236 selected lower-frame regions and 10 bridge
frames were inspected without text. Full decode, selected-frame equality,
outside-bridge master equality, audio packet/timestamp and original PCM checks
passed. Typecheck and all 855 tests in 126 files passed; logs:
`outputs/ltx-peter-stitch-typecheck-20261030.txt` and
`outputs/ltx-peter-stitch-tests-20261030.txt`. No core code change needed.

Speaking shapes vary; section 2 has limited opening in its middle, and section 3
is more expressive. Sync and transition suitability remain for Dan's playback;
file/audio validity is not a lip-sync pass. Raw and individual text-free clips,
straight assembly, source/evidence, lossless audio/picture masters and recipe
are retained. Dedicated Goal Guardian pass: requested source-faithful lip-sync
experiment and inspect/correct workflow preserved; no invented narrative, new
stage, canon/source approval, production-provider change or chapter edit.

## Completed: smooth Jesus stitch within existing pause (2026-10-30)

Dan requested smoothing without audio timing changes or text. Delivered:
`C:/Users/danbr/HeartWordData/prototypes/ltx-jesus-stitched-20261030/jesus-full-line-smoothed.mp4`.
Eight frames (89–96, anchors 3.708333–4.000000s) use motion-compensated
interpolation between resting-mouth poses, within the measured 3.660862–4.150272s
source pause. It eases the expression/head-position jump, with slight softness
in intermediate frames. All other frames remain identical in the lossless
picture master; the review picture is encoded at CRF16. The original straight
cut remains available. No new generation or repository code change was needed.

All original audio packet hashes, PTS/DTS and durations match exactly: sound
was stream-copied without reencoding, shifting, crossfading or added silence.
Video retains all 189 frame times / 7.875s. Modified frames were inspected
without text; full decode and frame/timing checks passed. Recipe inputs,
verification and a dedicated Goal Guardian pass are retained under the packet's
`smooth-transition/`. Scope matches source-faithful audio and producer review;
no new content, production-provider change or pipeline stage. Playback judgment
remains with Dan.

## Completed: longer Jesus line stitched from short LTX clips (2026-10-30)

Dan reports that three-/four-second clips work well and five seconds fails.
He requested one longer line split into short clips, original audio timing,
text removed, to inspect transitions. The complete approved Jesus v5 Mark 5:39
performance is now stitched and ready:
`C:/Users/danbr/HeartWordData/prototypes/ltx-jesus-stitched-20261030/jesus-full-line-stitched.mp4`.
Full findings, limits and review index are in that packet's `RESULTS.md`.

The first 94 frames (3.916667s) reuse the existing four-second take. New local
Fast generation `b860f9ad` supplies the exact remaining 3.931678s, with tail
silence only to the five-second native minimum. The split is source sample
172725 of 346112 at 44.1kHz, inside the measured 3.660862–4.150272s pause.
Both approved canon/reference, direction and seed 42 are held constant.

A straight picture cut at 3.916667s exposes a visible expression/head-position
reset; no dissolve or still hides it. Both sides use the identical disclosed
caption crop (980x550 at x150/y0, scaled to 1280x720). No text remnants were
observed across all 189 selected lower-frame regions. Every assembled decoded
frame matches its prepared section; all picture PTS match the 24fps clock.
Audio is the one complete original WAV, encoded once to AAC for review, without
section audio concatenation, gap, overlap, inserted silence, offset or speed
change. A retained MOV with PCM audio verifies every original sample exactly.
The 7.875s picture exceeds the 7.848345s source by only its final frame-grid
remainder (26.655ms). Full decode passed. Raw/individual clips and timing/source
evidence remain retained. Producer playback must judge sync and the join.

The isolated experiment harness now accepts fractional three–four-second
excerpts and rounds review frame counts up. A regression checks the actual
frame-aligned and fractional windows. Typecheck and all 855 tests in 126 files
passed; logs: `outputs/ltx-stitch-typecheck-20261030.txt` and
`outputs/ltx-stitch-tests-20261030.txt`.

Goal Guardian dedicated pass saved as `goal-guardian.json` in the packet:
complete source-faithful dialogue and USER_WORKFLOW's inspect/correct flow are
preserved. No invented content, new pipeline stage, production-provider change,
canon/source approval or chapter edit. Experiment delivery complete; playback
acceptance remains with Dan.

## Completed generation: short LTX ladder ready for morning playback (2026-10-30)

Dan judged Peter 3s "Promising through all three seconds," then explicitly
requested unattended Jesus 3s and 4s alongside the running Peter 4s. Jesus 5s
was authorized only if both shorter Jesus results looked promising. All four
new clips are now generated and ready under:
`C:/Users/danbr/HeartWordData/prototypes/ltx-short-ladder-20261029`.
See `RESULTS.md` there for the complete review index, rationale and limits.

- Peter 4s (`1eb88a5a`): `peter-4s/performance/review-no-text.mp4`.
  Existing Mark 5:31 cast window 1.200–5.200s, approved Peter v4 portrait.
  Mouth changes into the fourth second; exact sync pending Dan's playback.
- Jesus 3s (`4a7c8d34`): `jesus-3s/performance/review-no-text.mp4`.
  Mark 5:19 window 4.987642–7.987642s, approved Jesus v5 portrait.
  Promising changing mouth shapes across the window, resting near the 3s
  speech endpoint in the native silent tail. Precise sync remains unconfirmed.
- Jesus 4s (`3f88f6ed`): `jesus-4s/performance/review-no-text.mp4`.
  Mark 5:39 window 0–4s, same approved Jesus version. Mouth changes across the
  speech window and rests near the final pause around 3.66s. A suspicious
  limited-opening interval at 2.2–2.7s was checked at 24fps; changing lip
  shapes remained, so a sustained freeze was not established. Sync unconfirmed.
- Jesus 5s (`e58adf8b`): `jesus-5s/performance/review.mp4`.
  Mark 5:19 window 0–5s. **Likely failed speaking coverage:** mouth settles
  around 3.2s while source speech continues to approximately 4.848s.
  Strong source-audio energy through 3.25–4.75s supports this concern.

Both shorter Jesus results looked promising on a provisional visual screen,
so the conditional five-second test was submitted; `five-second-gate.json`
records the reasoning and its limits. No human approval or exact phoneme
alignment is claimed. Dan has not yet reviewed these four new clips.
The prior longer Jesus/Peter failures remain recorded below.

All inputs preserve approved canon/source/voice bindings and original PCM.
Both submitted stereo channels exactly match the selected mono source samples;
only tail silence fills LTX's native five-second minimum where needed.
Three/four-second native requests are unavailable: these test usable short
speaking windows, not short-generation efficiency. Source boundaries lie in
measured pauses; full verse text is context, not an excerpt transcript.
Jesus 3s ends one sample before the source endpoint to respect ffprobe rounding.
No lead, hold, offset, time stretch, added word or timing correction was applied.

Delivered reviews are exactly 3/4/5s and 72/96/120 frames at 24fps. Native frame
timestamps are unchanged; all full decodes passed. Peter 4s and Jesus 3s/4s
needed the disclosed picture-only caption crop (980x550 at x150/y0, scaled to
1280x720); audio packets are unchanged by cropping. All delivered lower-frame
regions were inspected without text remnants. Jesus 5s had no observed text
and retains full native framing. Raw files, source evidence, PCM proofs,
requests, progress, per-clip assessments and verification remain retained.
The native audio muxes the input; matching audio does not prove lip-sync.

The isolated experiment harness now also accepts five-second excerpts.
Typecheck and all 854 tests in 126 files passed, logged in
`outputs/ltx-overnight-typecheck-20261029.txt` and
`outputs/ltx-overnight-tests-20261029.txt`.

Goal Guardian dedicated pass (`goal-guardian.json` in the packet): serves
PRODUCT_VISION's source-faithful voice/lip-sync stage and USER_WORKFLOW's
inspect/correct/selective-rerun workflow. Generation/delivery is complete;
adequacy still needs producer playback. No new stage, production-provider
change, canon/source approval, chapter edit or invented narrative content.

## Completed: longer Jesus and Peter LTX tests expose speaking-coverage failures (2026-10-29)

Dan authorized two more local lip-sync samples, preserving original timing and
removing any generated text. The isolated package is
`C:/Users/danbr/HeartWordData/prototypes/ltx-mark5-expanded-20261029`:
Jesus's complete Mark 5:19 cast line (~7.988s, approved Papuan v5 headshot) and
Peter's complete Mark 5:31 cast performance (~9.799s, approved Papuan v4 headshot).
Peter is the saved production's representative for the disciples' quotation;
this does not assert that Scripture names him individually in that verse.
Read-only evidence pins each canon version/headshot, source-mapped voice file,
full source recording hash, utterance bounds and saved exact Hatam words.
Each request is 720p/24fps/10s, seed 42, with character-specific appearance and
source-appropriate direction. Both stereo channels match the complete original
mono PCM. No added lead silence, hold, speed change, offset or speech cut is used;
only end silence fills the request. Raw results stay retained. Any text removal
will use a disclosed picture crop after inspecting the returned frames.

Jesus completed local inference (Desktop generation `8be27de5`) in 30m26s
including transfers and review preparation. All 241 lower-frame regions and
the full contact sheet were inspected: no text observed, so no caption crop
or other picture edits were applied. Raw/review video frame timestamps are
identical. Decode passed; review audio correlates 0.99970 with its source-timed
input at zero offset (native audio 0.99906). The recognizable face animates;
native framing crops upper hair. **Dan rejected the Jesus result:** it does
not align with the audio, and animation stops around seven seconds while
speech continues roughly another second. These are producer-reported
approximate times. This longer-line lip-sync test failed despite intact audio,
valid files and no captions. The failure is retained in
`jesus-long/performance/assessment.json`; no timing repair or regeneration is
being used to conceal it.
Read-only installed-code inspection found no seven-second request/conditioning
cutoff: the complete audio is padded/truncated to the full video's latent
duration and conditions both stages. The returned native soundtrack is the
original waveform, so its fidelity cannot establish mouth alignment. The
Desktop distilled wrapper accepts but does not forward negative_prompt to its
positive-only inference call; previous negative-prompt strengthening was not
an effective control in this installed path. Exact paths/findings are in
`NATIVE_A2V_INSPECTION.md` in the package. No Desktop/model patch or retake was
made; the underlying cause of the visual failure remains unproven.
Peter completed local inference (Desktop generation `3a49bc24`) in 30m16s
including transfers/review. All 241 lower-frame regions and the full contact
sheet were inspected with no text observed, so no crop was applied. Raw/review
picture timestamps match; review audio correlates 0.99991 with the input at zero
offset. **Dan rejected Peter as well:** usable lip-sync lasts only about the
first second, then animation stops while the audio continues. The earlier
coarse visual estimate of mouth settling at 7.5–8s missed this much earlier
loss of meaningful synchronization and is not an acceptance measure. Both
longer tests failed producer lip-sync review; the soundtrack/file checks do
not overturn those failures. Peter's report is retained in
`peter/performance/assessment.json` and the package `RESULTS.md`.
No timing fixes or corrective holds
were applied. Both raw and review clips remain under their performance folders,
with assessment JSON and a package result memo. No paid
fallback, provider migration or production record change occurs. Runner changes
extend the existing experiment CLI with source-pinned longer performance packets,
not a pipeline stage. Neither result is accepted for production lip-sync.

Dan explicitly requested saving the session token for future use. It is saved
outside the repository under LOCALAPPDATA/HeartWord/credentials with Windows
user-bound DPAPI encryption; round-trip verification passed. The non-secret
`scripts/experiments/ltx-session.ps1` helper loads it only into process memory,
restores the previous process environment after execution and supports explicit
clipboard refresh when Desktop rotates the token. Plaintext was not saved.

Goal Guardian: tests reliability of source-faithful canon speaking shots and
the existing watch/compare workflow before Dan decides on a provider. Acceptance
is two inspectable original-timing, text-free viewing samples with full raw
provenance and checks, not automatic adoption or production approval.

## Completed: first LTX take restored, text crop only (2026-10-29)

Dan rejected the second take's held lead as introducing a speech delay and
requested the previous result with only the text removed. The first stereo
baseline's `review.mp4` was cropped to remove its subtitle band and rendered as
`C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-stereo/baseline/review-no-text-original-timing.mp4`.
All 145 video frame timestamps match the original first review exactly, and
the encoded audio packet SHA-256 matches byte-for-byte. No lead hold, audio
offset, retiming, regeneration or source speed change was applied. All frame
regions containing the former captions and the full contact sheet were
inspected with no text remnants observed; full decode passed. Evidence:
`baseline/no-text-original-timing-verification.json`. Prior takes remain.
Goal Guardian: fulfills Dan's explicit return to the first performance and
timing with a disclosed text-area crop only, preserving the source audio and
existing review workflow. No code or production record changes.

## Completed: second local LTX take with disclosed caption/onset edits (2026-10-29)

Dan requested another local take without invented captions or visible talking
before Hatam speech. A separate package at
`C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-take2`
retains the same approved Papuan Jesus v5 headshot and full Mark 5:36 cast line.
The `clean` case strengthens no-text direction and negative terms, changes seed
to 314 and supplies complete speech at generation time zero. The installed A2V
path explicitly rejects timed keyframes, so the review renderer restores the
original 500ms silent lead using the exact resting-mouth canon frame, followed
by generated picture. All words and original review audio timing stay intact;
raw generation is retained independently. This is a disclosed assembly fix,
not evidence that raw LTX learned a silent lead. Caption-free output still
requires inspection of the new generated frames; it is not guaranteed by prose.
Dan copied the current session token. An initial SSH setup failure submitted
no generation; the connection then passed health/settings checks. The clean
case completed local inference (Desktop generation `7b3fae91`, submitted
about 19:01 EDT) in 17m20s including transfer and initial review rendering.
Cloud generation and image-to-video prompt enhancement were both disabled.
The stronger prompt still produced invented captions; native caption
suppression failed. Raw output and the uncropped review remain retained.
`clean/review-caption-free.mp4` is the disclosed corrected deliverable: a
980x550 crop at x=150/y=0 removes the subtitle band, resized to 1280x720.
It retains the closed-mouth 500ms canon lead followed by the new generated
performance. All 144 delivered lower-frame regions and full-frame contact
sheets were inspected; no caption remnants were observed. Decode passed,
the first 12 frames are stationary, speech begins at 0.500s, and audio
correlates 0.99979 with the original six-second source-timed review WAV.
Native raw audio correlates 0.99820 with its zero-lead input. Source words and
speed are unchanged. `clean/assessment.json` retains hashes and checks.
This is a corrected viewing sample, not evidence that native LTX now obeys
caption exclusion or silent leads. Dan/native Hatam speaking-quality review
is still pending. No third generation was submitted.
Type checking and the full 852-test suite passed. Both stereo channels of the
zero-lead input match the complete original mono PCM exactly. A separate,
labelled harness using the prior take verified rendering and all 12 resting
lead frames; it is not a new generated result or caption-removal evidence.

Goal Guardian: serves the source-faithful speaking-shot and watch/correct
workflow in PRODUCT_VISION and USER_WORKFLOW. Acceptance is a new inspected
take without generated text and with a silent/resting lead, complete original
speech and retained raw evidence. No production stage, canon, provider choice,
chapter record or backup-policy decision changes.

## Completed first baseline: isolated local LTX lip-sync experiment (2026-10-29)

Dan requested an experiment to assess local LTX lip-sync adequacy. The prepared
package is at `C:/Users/danbr/HeartWordData/prototypes/ltx-lipsync-mark5-canon-20261029-stereo`;
instructions and provisional review criteria are in
`docs/production/LTX_LIPSYNC_EXPERIMENT.md`. `npm run ltx:lipsync` prepares,
runs one explicitly selected case, or rebuilds local review files. Dan corrected
the source choice: use the approved Jesus from Hatam Mark 5 and a canon headshot,
not Luma's film. The revised package uses the Papuan Jesus v5 approved headshot
and the complete existing Mark 5:36 cast line ("Do not fear, only believe").
Read-only checks confirm the headshot hash, Mark 5's v5 utterance bindings and
the cast-map source hash/version. `source-evidence.json` retains those records
and exact saved Hatam words. Six-second baseline/repeat cases have 500ms lead
silence; delayed has 1250ms. All speech PCM is preserved. The previous Luma
package is superseded and rejected by this runner. No Luma/Kling footage is
included in the new package. Comparison shows the static canon beside LTX.

Dan supplied the Desktop token through the Mac clipboard. The first mono
attempt definitively failed in the A2V encoder, which requires stereo. Its
attempt remains retained in the original Mark 5 experiment folder; Desktop
reported error/no running job before only its matching lease was released.
The revised inputs duplicate identical original PCM into left/right channels,
verified sample-for-sample. The separate stereo-folder baseline completed
local A2V inference (Desktop generation `eee9a010`) in 17m12s including transfer
and local review preparation. A2V loads downloaded
weights on demand and does not appear as a resident scene pipeline in health.
The preflight now handles that distinction and Desktop's camelCase setting,
while still rejecting unknown/cloud settings. Output is 1280x704, 24fps,
145 frames / 6.041667s. Full decode passed. Native audio correlates 0.99863
with the supplied Hatam WAV at zero offset. The headshot remains recognizable,
but the take invents subtitle-like text, begins mouth motion in the silent
lead and crops the upper hair/forehead. This fails the no-generated-text
requirement; lip-sync naturalness/phoneme adequacy still awaits Dan/native
Hatam assessment. No repeat/delayed request was submitted. The runner checks local-only
settings, shares the existing inbox lease, retains uncertain submissions, never
automatically retries, and records exact inputs/request/output for Dan's review.
No production database, source performance, canon approval or provider selection
was changed. Kling Avatar remains production lip-sync; the backup-policy goal
below remains pending separately.

Verification of the revised Mark 5 package: full suite passed 851/851 tests
in 126 files and type checking passed. Input
audio checks prove unchanged decoded PCM, six-second duration, silence-only
padding and an exact 750ms shift. A static canon/audio preview is clearly
labelled `input-preview-static-not-ltx.mp4`. The comparison-render smoke check
uses only a static canon fixture in a separate labelled scratch folder and is
not an LTX result. Actual generated output is retained under the stereo
folder's `baseline/raw.mp4`, `review.mp4` and `compare-canon.mp4`;
`assessment.json` records measured audio/runtime and visible shortcomings.
Dedicated Goal Guardian
review found the work limited to the requested feasibility experiment and
existing producer watch/compare workflow. Human/native Hatam assessment
remains pending; technical checks do not establish lip-sync adequacy.

## Verified first disaster backup; daily policy pending Dan (2026-10-26 UTC)

The first completed snapshot, `20261024-first-personal`, survives in Dan's
selected personal OneDrive account, which passed the 750 GiB-free condition.
All 101,156 retained files plus the completion manifest reached cloud-only
storage before recall. Every file hash and all 56 SQLite integrity/foreign-key
checks passed; an isolated full restore completed outside synced storage with
live production content access denied. All 59 main production tables / 16,423
rows compare equal apart from 1,623 exact retained-file path projections.
Original unprojected records remain in the immutable cloud SQLite snapshot.

The recovered application was installed from its retained lockfile and built.
Normal Hatam → Mark → chapter 5 navigation opened the existing storyboard,
18 approved Papuan visual cast entries and 657 discussion entries. The recorded
cut played beyond two minutes; the full video/audio decode passed and both the
delivered film and the normal app's recorded-cut asset match the approved
Mark 5 SHA-256. The recovered chapter audit has 3,225 files and no dependency
or editability findings. No provider call, paid regeneration, producer decision,
source/canon change or release approval occurred.

Evidence and exact roots: `outputs/disaster-backup-deployment-20261024.json`,
`outputs/disaster-backup-cloud-restore-proof-20261024.json`,
`outputs/disaster-backup-normal-workflow-20261026.json`, and the
[recovery guide](../production/DISASTER_RECOVERY.md). Failures and fixes are
retained separately. OneDrive's long-path automatic recall failed; explicitly
requesting downloads recovered the cloud bytes with matching hashes. This
recovery step is now documented. The live database remains outside sync.

Final follow-through: the updated recovery guide, design notes and verification
receipt are independently cloud-read/hash verified in OneDrive /
`HeartWordBackups/recovery-guide-20261024-first-personal-20261026/`.
The completed snapshot's 101,157 files are again online-only after the drill;
C: has 350,629,101,568 bytes free and the isolated working restore is retained.
The setup follow-up stops here pending the daily-policy choice below.

**Daily protection is not deployed.** The first full transfer reached verified
cloud-only storage about 14.6 hours after publication. A full-copy 23:30 schedule
cannot yet reliably meet Dan's one-working-day loss limit during daily work;
the existing runner also accumulates staging and sync copies. It remains
disabled. Dan has been asked to choose fast nightly backups to separate USB
storage with OneDrive as an additional copy, changed-file OneDrive uploads,
or an explicitly larger loss allowance. No new backup format or retention
deletion is implemented without that decision. External SMS delivery is still
unavailable. This remaining deployment decision does not reopen the completed
Mark 5 production or Sougb preparation below.

## Completed: Hatam Mark 5 production

Updated 2026-10-24T14:59:12.898Z. Dan explicitly approved the finished film: **“I approve the finished film.”** The complete production, whole-film checks and verified editable delivery meet the requested goal. No production work or producer review remains. No further generation, voice conversion, paid review, rendering or re-export is required without a new correction request.

The product/workflow result is a source-faithful, watchable full chapter with inspectable editorial reasoning and editable components. The existing autonomous stages were used; no new pipeline stage or unrelated product feature was introduced.

### Approved film and delivery

- Master: C:/Users/danbr/HeartWordData/exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4
- Render: f6709702-7e82-4a99-b072-7358d9e685a8. SHA256: 286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b.
- Duration 9:32.380; 1280×720, 24fps, 13737frames, stereo48kAAC. The approved film bytes are unchanged.
- Bundle: C:/Users/danbr/HeartWordData/exports/hatam-mark5-20261024. Includes native720p, mobile360p, low-data216p, audio-only and README.
- Editable archive: editable-chapter-r3, 5846 retained files plus schema/records/manifest (5849 actual files, 8597835888bytes). All retained bytes, schema and records were verified again when recording approval. Zero missing-dependency or editability findings. ManifestSHA: 9d646139ef798a3f41b70f1eb9838effb90bd793d627862c30df4fae022efed9.
- Genuine full offline reconstruction:111picture placements/35continuousaudio groups/146sourceintervals. Current finishing reproduces identical encodedpicture packets and decoded48kPCM; prior audio completion reproduces the exact delivered whole-fileSHA. No originalworkingdata/application reads or network/provider attempts occurred. Current archive runtime and picture-input hashes match the retained reconstruction proof.
- Normal cold restoration and producer workflow passed with the full playable chapter, all18Papuanvisualcast entries,657savedcrewreplies and18loadedcrewportraits. Restored working root: C:/Users/danbr/HeartWordData/m5final-20261024. Matching hostNode/FFmpeg/localdependencies were used, not a cleanOSinstaller claim.

### Source, review and preservation

All543504ms of the approved Hatam performance retain original words, speed, order and reviewed boundaries. There are17characterutterances/15speakingvideos,146sourceintervals and111pictureplacements. The fullsource occupies12000–555504ms, followed by2876mscarepause andcredits558380–572380. All17actualmixedcast windows have zero lag at48k. The approved12sopening and complete soundtrack remain.

Approved Papuan identities and wardrobe, the clean-shaven John portrait, literalMark5:40 physicalexitofall5mourners, approvedMark5:5 anguishclose-up/offscreenstonecutting and food/care ending remain. NoMark6transition. **1/19nativegroans/gasps remain held and excluded**; final film approval does not approve that unused audio.

Current internal wholefilm picture/sound review96e507fb-b813-425c-8130-cf96af3d874e is approved. All old findings, original scores, errors, rejected/superseded takes and fees remain retained. Existing20priorrecordset/53currentcanon preservation, sourceauthority andFKchecks passed. Original scope limits for historicalNULLhashes/nativephonetic/physicalphonechecks remain honest. No provider request was repeated for approval or closure.

Latest implementation validation remains848tests/125filesPASS andboth typechecksPASS. Approval changes only saved decision/report/checkpoint metadata; no runtime implementation changed.

Protected cumulative ledger and conservative liabilities: **$190.730661/$200**, remaining$9.269339. Includes historical33.50allowance, unknownvoice/image allocations and12audio bounds. Unreported usage remains bounded, not zero.

### Approval and completion evidence

Paths below are relative to C:/Users/danbr/HeartWordData/assets/preparation/hatam-mark5-production-20261021 unless stated:

- assembly/final-producer-approval-20261024.json: direct human statement, exact render/SHA and existing producer-decision history row50167efc-364c-4f6f-86dc-041f00b6ef9d, sequence1730.
- assembly/final-production-completion-audit-20261024.json: all10requirement checks pass against current productionDB, delivered film, original proofs and rehashed editable archive.
- assembly/final-approved-delivery-20261024.json: current approved delivery receipt. Earlier preapproval delivery receipts remain unchanged as history.
- checkpoints/latest-reconciliation-20261022.json: current producer-approved production-complete checkpoint. Earlier blocked-review audits remain historical.
- Bundle verification/final-producer-approval.json and final-producer-approval-records-delta.json retain the subsequent approval beside the immutable R3 export-time snapshot.
- Bundle verification/full-film-offline-rebuild-current-runtime-r3.json, preservation-at-final-delivery.json, goal-guardian-final.json and producer-workflow/final-archive-normal-reopen.json retain full reconstruction, preservation and workflow evidence. Their preapproval humanApproval=false values describe their original recording time and are superseded only for producer approval by the new explicit decision.

Production report: http://127.0.0.1:4000/media/preparation/hatam-mark5-production-20261021/index.html#full-cut.

**Distribution remains separate.** Ryan/native Hatam field review is required before distribution. No field approval, publication or messages to others have been authorized or invented. This is a future release gate, not unfinished work within the approved production goal.

## Completed: Sougb New Testament source text preparation (2026-10-24)

Dan designated Sougb as the third language target and requested the entire New
Testament PDF prepared in the same chapter DOCX layout as Meyah Mark. The 27
books are now 260 chapter files under
`C:/Users/danbr/HeartWordData/assets/source/sougb/text/<Book>/`, with each
book's printed Sougb title and separate numbered text paragraphs. All 7,450
printed verse markers cover their chapters in order. The PDF's 439 combined
verse ranges remain single paragraphs with their range labels; no internal
wording boundary was guessed. The original PDF and Meyah reference are intact.

The extraction manifest, hashes and verification report are at
`C:/Users/danbr/HeartWordData/assets/preparation/sougb-nt-text-20261024/`.
The converter is `scripts/source-preparation/prepare_sougb_nt.py`. A second PDF
extractor matched the source wording on all 1,040 pages after ignoring marker
placement differences. All 260 DOCX files passed a source-text and package
audit, and their 894 rendered pages yielded the complete expected text with no
blank or wrong-size pages. Representative page images were inspected. The full
repository suite passed: 849 tests in 125 files.

This completes the requested source-file preparation. Sougb source attestation,
audio alignment and application catalog binding remain separate workflow steps;
the disaster backup deployment goal above remains active.

## Completed: isolated Luma Mark 4 Hatam lip-sync first pass (2026-10-28)

A separate 35-second local first pass used Luma's own Jesus footage and the
original film's continuous Hatam soundtrack. Two short boat views were
lip-synced locally against measured Mark 4 source intervals; the remaining
seed/sower views continue from the existing film. Source and film hashes,
audio timing, render checks, shot choices, costs and first-pass visual limits
are recorded at
`C:/Users/danbr/HeartWordData/prototypes/luma-mark4-lipsync-20261028/PROTOTYPE_PLAN.md`.
There were no paid provider calls or changes to the original film, approved
chapter productions, or production database. Dan rejected the local sample
on 2026-10-28 because it looked unnatural and the lips barely matched; it is
retained only as a comparison artifact and superseded by the Kling trial below.
The disaster backup decision
above remains the active repository goal.

## Completed: isolated Luma Mark 4 Kling comparison (2026-10-28)

After Dan rejected the local lip-sync pass, a separate 35-second comparison
was rendered with Kling's video lip-sync on two original Luma boat shots at
their chronological film times. It retains the film's exact Hatam soundtrack,
Luma's Jesus, the intervening original shots, and all source assets. The
mapping, visual choices, technical checks, remaining visual limits, and
20-credit provider cost are recorded in
`C:/Users/danbr/HeartWordData/prototypes/luma-mark4-lipsync-20261028/KLING_TRIAL.md`.
The sample is for Dan's review, not approved production or release. No chapter
production record or film original was changed; disaster backup remains the
active repository goal.

## Completed: isolated Luma Mark 4 Kling Avatar close-up trial (2026-10-28)

Dan asked for a closer, steadier test with HeartWord's approved Jesus voice and
without a silent visible-speaking gap. A separate 31.8-second Mark 4:7–8 sample
uses two Kling Avatar shots based on a frame of Luma's own Jesus, with the
approved Hatam Jesus voice-converted audio at measured source/film speech
boundaries. Existing Luma seed and harvest footage fills the remaining time.
The silent boat interval between the two close shots was removed. The sample,
source mapping, editorial choices, 64-credit cost, input hashes and verification
are recorded in
`C:/Users/danbr/HeartWordData/prototypes/luma-mark4-lipsync-20261028/avatar-20261028/AVATAR_TRIAL.md`.
The original film, approved chapter productions and production database remain
untouched. This is a review sample, pending Dan's and native Hatam assessment;
disaster backup remains the active repository goal.

Dan liked the Avatar comparison and requested a final five-second return to
Jesus with a slight smile. The revised 34.8-second sample ends on a restrained
silent Kling animation from an exact Luma film frame, after the approved Jesus
voice finishes. The original film's quiet ambience continues; there is no new
dialogue or Hatam loop. The added clip cost 15 existing Kling credits, bringing
this isolated Avatar trial to 79 credits. Its source, hashes, render and checks
are recorded in the same `AVATAR_TRIAL.md`. The 31.8-second version remains
retained for comparison. This revision still awaits Dan's review.

Dan then noted that the 34.8-second cut hid the narrator and ended silently.
That version is retained but superseded. A corrected 39.767-second isolated
review sample, `sample-kling-avatar-narrator-smile-speaking.mp4`, keeps the
approved Mark 4:7–8 Jesus voice, plays 6.349 seconds of the original film's
Mark 4:9 narrator audio over original grain footage, and ends with Luma's
Jesus speaking the exact approved 3.669-second Mark 4:9 line in a closer Kling
Avatar shot with a slight closing smile. One API request used 2 trial units
($0 cash; no web credits); its source map, billing, retained inputs, visual
limits and audio verification are in
`C:/Users/danbr/HeartWordData/prototypes/luma-mark4-lipsync-20261028/avatar-20261028/AVATAR_TRIAL_NARRATOR_SMILE.md`.
The source film, Hatam recording and approved chapter records remain intact.
Full repository tests passed 849/849. This is a review sample awaiting Dan's
and native Hatam assessment; disaster backup remains the active goal.

Dan requested at least a half-second break before the narrator at the 0:29
handoff. A further isolated revision, `sample-kling-avatar-narrator-pause-smile-speaking.mp4`,
adds 0.600 seconds of the film's original quiet field footage/audio after the
Mark 4:8 Jesus line (sample 28.052–28.652 s). Two earlier wordless cutaways
were shortened by 0.300 seconds each, so the sample remains 39.767 seconds;
all Hatam words, narrator onset and final Jesus line remain intact. No new
provider call or credits were used. The retained earlier sample, revised render,
source timing, measured pause (-54.4 dB RMS), audio checks and limitations are
recorded in
`C:/Users/danbr/HeartWordData/prototypes/luma-mark4-lipsync-20261028/avatar-20261028/AVATAR_TRIAL_NARRATOR_PAUSE.md`.
The original film and approved productions remain untouched. Full tests passed
849/849; disaster backup remains the active repository goal.

A month-later retrieval copy of the final Luma Mark 4 Kling Avatar pause
prototype was placed in the user's OneDrive Documents at
`C:/Users/danbr/OneDrive/Documents/HeartWord Review Samples/Luma Mark 4 Kling Avatar - 2026-10-28/Luma Mark 4 - Kling Avatar - narrator pause - review sample.mp4`.
The copy's SHA-256 matches the original prototype file; a readme and prototype
record sit beside it. This changes no approved production record or active goal.
