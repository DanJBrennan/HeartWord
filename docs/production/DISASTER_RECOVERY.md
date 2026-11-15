# Recover HeartWord on a replacement computer

## November 13, 2026: current native deduplicated backup

The current verified backup is a native restic repository at
`D:\HeartWordBackups\restic` on the WD Elements USB disk. It preserves the
current HeartWordData and main application source, consistent snapshots of all
102 databases, supplementary external referenced files, and the complete old
staging/recovery copies retired from C:. All repository packs passed read-back;
independent restore tests checked every current database and application file,
representative media, every present supplementary reference and all archived
databases. Existing missing historical external paths remain recorded as gaps.

Use **D:\HeartWordBackupRecovery\README.txt** for the tested native-restic
commands and exact snapshot IDs in **D:\HeartWordBackupEvidence\20261113**.
Restore into NEW unsynced directories using snapshot:folder subtree selection.
Restore ordinary data first, then restore the capture's `sqlite/` subtree over
the SAME new data root, preserving relative paths. Original raw databases and
WAL/SHM/journals are intentionally excluded from the ordinary-data snapshot.
SQLite snapshots are standalone. Project stored absolute paths using the
existing recovery procedure before normal production use on another root.

The recovery key is at **D:\HeartWordBackupRecovery\restic-password.txt**;
a second copy is at **C:\Users\danbr\.config\HeartWordBackup\restic-password.txt**.
Keep a separately recoverable key copy. Credentials and installed software
remain separate recovery concerns. Do not upload the plaintext repository key
with the repository or expose it in manifests, source control or chat.

The native Windows task **HeartWord verified backup to D and OneDrive** runs
nightly at 11:30 pm Eastern while logged on, with hourly retries when deferred.
It requires D: and 15 minutes of user/database inactivity, captures consistent
SQLite copies, verifies the repository and restores/checks databases/external
files, then uses Robocopy to copy encrypted repository changes to:
`C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\deduplicated-20261113\repository`.
The adjoining `verification/` catalog records the verified snapshot IDs and
overlay locations. Pick IDs from verified reports, rather than assuming every
snapshot from an interrupted attempt was verified. Each nightly overlay lives
at `/D/HeartWordBackups/runs/<run>/capture/sqlite` inside its current snapshot.

The initial local OneDrive copy completed: all 5,050 encrypted repository files
passed SHA-256 verification, with zero Robocopy failures/mismatches. A successful
local copy/hash check does not establish completed upload or remote recovery. Cloud protection
must remain unconfirmed until delivery/readback are verified. The October
instructions below describe the retained older full-copy format, not this new
native repository. See [design](../design/disaster-recovery.md) for details.

Policy agreed October 7, 2026: keep live data outside OneDrive; upload only
completed snapshots to Dan's OneDrive account, if at least 750 GiB is free.
Acceptable loss is one working day. **Cloud capacity/upload/remote restoration
must be verified before the deployment is called protected.** Details and
known gaps: [disaster-recovery design](../design/disaster-recovery.md).

October 24 setup: Dan selected his new personal OneDrive account and asked
the assistant to start the backup. OneDrive Settings identifies
`danbrennan@verizon.net`, **97.4 GB used of 2.0 TB**; this passes the agreed
750 GiB-free requirement. The verified Windows sync root is
`C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive`.
Completed backups belong in **OneDrive / HeartWordBackups / <snapshot>**.
The first new capture is named `20261024-first-personal`.

The older business-account check below is historical. Do not use the stale
`OneDrive`/`OneDriveCommercial` environment values pointing at `OneDrive - dsc`
for this account. Pass the verified personal root explicitly to the runner.
OneDrive's separate "Back up folders on this PC" Documents warning does not
require moving the live database or turning on Documents backup: placing
completed snapshots in the verified sync root is sufficient to queue upload.

The current read-only inventory is **99,896 files / 167,002,386,310 bytes
(155.533 GiB)** with **56 SQLite files**, including retained snapshots and
isolated chapter restorations. Essential history and rejected/superseded work
remain included. Seven full copies now require about **1,089 GiB**, before
growth; the new account has capacity, subject to remeasurement. C: had about
486 GiB free before this run, so cloud copies must eventually use Files
On-Demand and surplus local staging must not accumulate indefinitely.

The first snapshot's upload, full cloud recall, isolated restoration and normal
Mark 5 opening/playback now pass. Exact evidence is recorded in
`outputs/disaster-backup-deployment-20261024.json` and
`outputs/disaster-backup-normal-workflow-20261026.json`. This protects the saved
October 24 capture; it does not include later work. **Nightly backups remain
disabled pending the daily storage/upload policy decision below.**

October 25 recovery warning: the entire first snapshot passed upload and
online-only metadata checks, but this computer returns Win32 380 when opening
some online-only files whose full local paths reach 260 characters. Explicitly
requesting **Always keep on this device** for the affected cloud file downloaded
it successfully, with the expected SHA-256. Before restoring, request that
OneDrive download the completed snapshot and wait for every file to become
locally available; then verify all hashes. Do not bypass a failed hash or use
working-disk files to fill a gap in a claimed cloud-recovery test. The completed
drill explicitly prefetched 16,052 long-path files (27.1 GB), then verified their
cloud bytes and the full restore. This is a recovery-cache step, not permission
to place the live SQLite database in synced storage. After a successful drill,
use Free up space on only the completed cloud backup; keep the isolated working
restore outside sync. Never delete cloud files to clear this cache.

## Before a failure

Keep Microsoft account access, MFA/recovery codes, provider credentials and
any SSH/private-key recovery in a separately recoverable password manager or
other established secure store. None is a substitute for the media backup.
Do not put secrets in source control, the backup manifest or a chat message.

Installed here: Node 24.14.0 (includes node:sqlite backup), FFmpeg/ffprobe 8.1.2,
Blender 5.2.1 LTS for existing Blender projects, Python 3.14.3 for small helper
scripts, Windows OpenSSH. The lockfile records npm dependency versions.
Demucs reprocessing additionally needs its documented compatible Python,
torch/torchaudio/demucs/safetensors environment; existing separated/retained
audio and film editing do not require running that model again. Its 84 MB
`tools/955717e8.safetensors` weights are included.

LTX is an external provider on the dedicated Mac mini: Desktop 1.2.7, LTX 2.5
Fast, model already installed, SSH access, inbox/port discovery and ephemeral
session token. This Windows-data backup does **not** image that Mac or its
software/model installation. Retained footage opens without the Mac. Recover
its setup separately before new local video production; see [LTX_LOCAL.md](LTX_LOCAL.md).

Do a monthly isolated restore and another after changing the recovery tooling.
Verify the first cloud copy by downloading it into a separate directory from
OneDrive web or another computer, then verifying **every file**, all databases
and the representative chapter. A local green check/manifest alone is not this
drill. Keep the last remotely verified backup until its successor passes.

## Create and publish

Finish/reconcile generation, imports and external editors/renders first.
Use new names each time. These commands make no paid generation calls:

```powershell
Set-Location 'C:\Users\danbr\OneDrive\Documents\HeartWord'
npm run data:backup -- inventory
npm run data:backup -- stage 'C:\Users\danbr\HeartWordBackupStaging\NEW-TIMESTAMP'
npm run data:backup -- verify 'C:\Users\danbr\HeartWordBackupStaging\NEW-TIMESTAMP'
# Run publish only after checking the selected account has >=750 GiB free.
$selectedPersonalRoot = 'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive'
$selectedSyncBackup = Join-Path $selectedPersonalRoot 'HeartWordBackups\NEW-TIMESTAMP'
npm run data:backup -- publish 'C:\Users\danbr\HeartWordBackupStaging\NEW-TIMESTAMP' $selectedSyncBackup
npm run data:backup -- status
```

The publish result is cloud_pending. Sign in to OneDrive, confirm upload has
finished for the entire folder, download the snapshot from the cloud and run
the following restore. No completed marker means no completed snapshot.
Do not edit a completed snapshot or merge an incomplete one into it.

**Do not register the existing nightly runner yet.** The first transfer took
about 14.6 hours to reach verified cloud-only storage. With full copies at
23:30, a failure before the next upload finishes can lose more than one working
day; the current runner also accumulates staging and publication copies.
Dan's choice is pending: use separate fast nightly storage plus this OneDrive
copy, authorize a modest changed-file upload design, or revise the acceptable
loss. No automatic cleanup or new format has been chosen.

The following is a proposed registration only after that decision, measured
upload time and local cache/staging headroom meet the loss target. Run under
Dan's logged-on account; OneDrive needs its normal signed-in session:

```
Program: powershell.exe
Arguments: -NoProfile -WindowStyle Hidden -File "C:\Users\danbr\OneDrive\Documents\HeartWord\scripts\backup-nightly.ps1" -SyncRoot "C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups" -CloudCapacityConfirmed
Start in: C:\Users\danbr\OneDrive\Documents\HeartWord
```

Use “run as soon as possible after a missed start,” prohibit overlapping runs,
and inspect Task Scheduler's last exit code plus Production crew status.
Do not force-terminate a long copy at the next trigger. Ensure the machine is
awake and idle in this maintenance window. The runner never kills production.
Keep three daily/four weekly snapshots; remove superseded backup copies only
after newer remote verification. There is no automated pruning or SMS delivery.
Keep just the most recent needed local staging copy after remote verification;
seven staged copies plus seven synced copies exceed the measured local free
space. Verify the sync root belongs to the capacity-checked account and that
the OneDrive client is running and signed in before enabling this schedule.

## Replacement computer / isolated drill

1. Recover access to the selected OneDrive account and download a completed
   `HeartWordBackups/<snapshot>/` with `backup.json`, `data/` and `application/`.
   Make every listed file locally available. Recovery must work without access
   to the failed disk. Verify from the downloaded directory, not the old sync
   cache. Keep the downloaded baseline immutable.
2. Install Node 24.14 or a compatible version with node:sqlite backup, npm and
   FFmpeg/ffprobe on PATH. Use the backup's `application/` source and lockfile,
   including uncommitted changes, to recreate the application directory.
   Reinstall dependencies with `npm ci` there. Git is optional for recovery;
   a Git remote alone does not identify the saved application bytes.
3. From that application directory, verify and restore to a **new unsynced**
   root (adapt these example paths to the new account):

```powershell
npm ci
npm run data:backup -- verify 'D:\DownloadedHeartWordBackup'
npm run data:backup -- restore 'D:\DownloadedHeartWordBackup' 'C:\Users\danbr\HeartWordRecovered'
Set-Location 'C:\Users\danbr\HeartWordRecovered-application'
npm ci
$env:HEARTWORD_DATA_DIR = 'C:\Users\danbr\HeartWordRecovered'
npm run build:web
node --import tsx src/server/index.ts
```

4. Open `http://127.0.0.1:4000`. Select **Hatam → Mark → chapter 5** (or the
   chapter used in the recorded drill). Inspect source/reference verses,
   approved canon, selected and rejected takes, existing cut, reviews/costs,
   producer decisions and edit history. Play retained footage. Use normal
   local edits/assembly with saved components; avoid pressing generation or
   planning controls during the drill. No provider credentials are needed to
   inspect/play retained assets or perform local FFmpeg edits.
   The restore command creates application source in the sibling
   `<data-root>-application` directory. It retains original sidecars and a
   separate saved path projection; leave `logs/disaster-recovery-paths.json`
   with the restored data. Earlier restoration markers/projections are history,
   not evidence that the current restore finished. Require the new root's
   `restored-from.json` completion marker.
5. Run the usual integrity/asset checks before new production. The backup
   manifest lists pre-existing missing Mark 2 dependencies and legacy custom
   editor gaps. Do not substitute similar files or infer source timing from
   rendered duration. Mark 3/4's recorded dependency audit is the better
   representative reopening check. Restore does not reset source, canon,
   cost, producer holds or field/release approvals.
6. Recover GEMINI_API_KEY, ELEVENLABS_API_KEY and KLING_API_KEY_1 separately
   only when new authorized provider work is needed. OPENAI_API_KEY remains an
   optional existing configuration. Recreate `.env` from `.env.example` with
   the new data path and desired video provider. LTX_TOKEN stays process-only;
   refresh it from the Mac rather than trying to recover an obsolete token.
   Recover/recreate SSH trust without replacing unrelated keys; see LTX guide.
7. Historical Blender edits: install compatible Blender and needed addons;
   open the retained `.blend` with scripts disabled. Use its inventory/lock to
   relink exact retained media after a path change. Some old projects already
   have broken paths; the backup retains these gaps honestly. Neither Blender
   nor the current custom Mark 4 v73 recipe is claimed universally rebuildable.

## Failures and overdue copies

The Production crew panel displays disaster-backup status. CLI status and
Task Scheduler nonzero exits expose failures. Operation evidence is in
`logs/disaster-backup-status.json` and `logs/disaster-backup-events.jsonl`.
Running/failed/overdue/cloud-pending states need attention; they never imply
remote protection. Do not rely on a local completion time for the one-day
loss target when upload is delayed.

If a killed process leaves `.disaster-backup.lock`, check its recorded PID and
confirm it has exited before removing only that lock. Keep partial directories
for diagnosis, use a fresh name on retry, and retain prior verified backups.
Restore failure leaves an incomplete new directory; it never overwrites live
production. Do not resume that directory as if restoration had finished.

Requested ChatGPT and SMS alerts still need a connected delivery capability;
Your dot/Mabel coordination is not available from these tools. No new sender,
phone number, paid notification subscription or credentials were invented.

## Recorded local drill

The first personal-OneDrive cloud drill completed on October 26 UTC. Its full
snapshot has 101,156 retained files plus `backup.json`; all 56 databases passed
integrity/relationship checks. After every file was confirmed online-only,
the isolated restore used cloud recall without live-data access. Every main
production row was compared, preserving original prose/decisions/costs and
allowing only exact retained-file path projections; the cloud snapshot retains
the original unprojected rows.

Recovered data: `C:\Users\danbr\HeartWordRecoveryDrill\20261024-personal-cloud`.
Recovered application: the same path with `-application` appended. `npm ci`
and the web build passed there. The normal app opened at port 4048 with provider
credentials absent. Select Hatam / Mark / 5, open its workspace, then choose
**Recorded cut**. Native playback advanced beyond two minutes; the full
video/audio decode and approved SHA-256 passed. Chapter dependency/editability
findings are empty. Screenshots and all evidence are under repository outputs.
Existing Uncertain/queued labels and historical cost estimates were retained,
not rewritten as approvals or invoices. The successful test used the installed
host's Node/FFmpeg; replacement software and credentials still need the separate
recovery steps above. No generation or distribution was performed.

The October 7 local-only drill below is historical.

The full local restore at
`C:\Users\danbr\HeartWordRecoveryDrill\20261007-verified` passed all database
integrity/relationship checks and the Mark 3 dependency audit. A restricted
loader without live-data access verified all 58 tables and retained authority,
history and cost records. The isolated application at
`C:\Users\danbr\HeartWordRecoveryDrill\recovery-application-20261007` opened
Mark 3 normally; retained footage played without provider credentials or
regeneration. Mark 3 has no recorded current chapter render; selected footage
was used. Some legacy composite-audio UI links remain broken and old Blender
dependencies remain explicit gaps. The source recording itself is retained
and hash-verified.

Use the final `20261007-recovery-tested` snapshot only once its completion
marker and `outputs/disaster-backup-final-evidence.json` confirm successful
capture/comparison. The earlier `20261007-first` snapshot is the immutable
diagnostic baseline; its captured tooling predates the restore fixes. The
final snapshot includes those fixes and this guide. Both local copies share
C: with production and provide **no protection from failure of that disk**.
