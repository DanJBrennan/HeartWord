# Recover HeartWord on a replacement computer

Policy agreed October 7, 2026: keep live data outside OneDrive; upload only
completed snapshots to Dan's OneDrive account, if at least 750 GiB is free.
Acceptable loss is one working day. **Cloud capacity/upload/remote restoration
must be verified before the deployment is called protected.** Details and
known gaps: [disaster-recovery design](../design/disaster-recovery.md).

Deployment is currently blocked: the configured `dan@brenn.onmicrosoft.com`
OneDrive shows 495.9 GB used of 1 TB, below the agreed 750 GiB-free threshold.
Its sync root is `C:\Users\danbr\OneDrive - dsc`; the older `OneDrive` folder
is not evidence of an active sync account. No upload/task has been enabled.
Dan's destination or revised-retention decision is needed.

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
$selectedSyncBackup = Join-Path $env:OneDrive 'HeartWordBackups\NEW-TIMESTAMP'
npm run data:backup -- publish 'C:\Users\danbr\HeartWordBackupStaging\NEW-TIMESTAMP' $selectedSyncBackup
npm run data:backup -- status
```

The publish result is cloud_pending. Sign in to OneDrive, confirm upload has
finished for the entire folder, download the snapshot from the cloud and run
the following restore. No completed marker means no completed snapshot.
Do not edit a completed snapshot or merge an incomplete one into it.

After capacity and the first remote drill pass, the nightly runner can be
registered in Windows Task Scheduler for 23:30 Eastern, once daily under Dan's
account while logged on (OneDrive needs its normal signed-in session):

```
Program: powershell.exe
Arguments: -NoProfile -WindowStyle Hidden -File "C:\Users\danbr\OneDrive\Documents\HeartWord\scripts\backup-nightly.ps1" -CloudCapacityConfirmed
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

4. Open `http://localhost:4000`. Select **Hatam → Mark → chapter 3** (or the
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
