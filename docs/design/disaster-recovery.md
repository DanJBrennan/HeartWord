# Disaster recovery for HeartWordData

October 7, 2026. This extends assembly's chapter-preservation primitives and
the existing Production crew status. It adds no production stage or parallel
project state. Dan selected completed backups in OneDrive, conditional on at
least **750 GiB free**, and accepts losing up to **one working day**.
Cloud capacity and remote delivery must be established before deployment is
called complete. The live database remains outside synced storage.

## Product goal and acceptance

PRODUCT_VISION requires verified Scripture, original performance, approved
regional canon and inspectable retained production. USER_WORKFLOW requires
selecting the same chapter, reviewing its existing cut and correcting retained
scenes. Disk loss must not force another paid generation or erase producer
decisions. Acceptance: an independently surviving verified copy, visible
failures/overdue backups, and an isolated restoration that opens useful saved
production without provider calls. Existing source/canon/cost/field/release
gates and the cumulative $200 film budget remain unchanged.

## Existing behavior versus intent

- Implemented: SQLite production records, immutable history, actual media,
  portable chapter packages and restoration. Those same-disk packages alone
  provide no disk-loss protection. Existing manual/autonomous production uses
  one saved state. Backup preserves all rows, not just accepted/latest takes.
- Historical: architecture's original PERSIST journal choice and earlier
  ingestion/editor recipes. The actual main database reports DELETE today;
  recovery supports WAL as well, without changing its journal policy.
- Declared: Mabel owns coordination/escalation contracts. She is not a
  callable independent dispatcher. Your dot is not an available tool here.
- Proposed: notifications.md names transports but establishes no running
  ChatGPT/SMS delivery service. This chat reports results; SMS to Dan's
  previously supplied number ending 8114 cannot be claimed.
- FDL and Bible/Papuan extension already exist as design artifacts from the
  preservation work; they remain intact and are not new recovery dependencies.

## Measured inventory

Initial read-only measurement: **28,912 files, 93,327,608,211 bytes
(86.918 GiB)**. Additional inventory reports/source files add a small amount;
each actual backup manifest records exact included sizes and hashes.

| Area | GiB (approximately) | Recovery significance |
| --- | ---: | --- |
| assets | 35.394 | Original recordings/text, regional canon, generated audio/picture, accepted/rejected/superseded assets, manifests and sidecars |
| exports | 15.682 | Blender edits/dependencies, review materials, production briefs, older snapshots |
| scratch | 19.486 | Custom Mark 4 repair recipes/components, historical review evidence, retained restoration demonstrations |
| chapter-packages | 16.141 | Existing portable Mark 4 package and its application/records/asset baseline |
| db | 0.093 | Main production database and pre-b-roll snapshot |
| tools/control-room/other | 0.122 | Demucs weights, wake-word model, logs and small records |

All six actual SQLite files pass integrity_check and foreign_key_check:

```
db/heartword.sqlite                          59,330,560 bytes
db/heartword-before-broll-20260924.sqlite     40,091,648 bytes
exports/mark-2-timing-2026-09-11/before-import.sqlite  1,970,176 bytes
exports/mark-2-timing-2026-09-11/validation.sqlite    2,076,672 bytes
scratch/chapter-preservation-proof-2026-10-07/revised-data/db/heartword.sqlite 774,144 bytes
scratch/mark4-preservation-restored-2026-10-07/db/heartword.sqlite 19,836,928 bytes
```

The initial data inventory has no junctions/symlinks or unreadable files.
An independent 16-byte header scan of all 28,915 subsequently present files
confirms exactly the same six SQLite databases, with zero unreadable files;
the three additions are the Blender inventory and backup operation logs.
Windows exposes only the C: working NVMe disk. No local second disk is a
verified destination. Source/canon provenance may mention legacy import paths;
these are origin evidence, not permission to substitute legacy material.

All 58 production tables were also scanned for absolute media/document/editor
references, including saved JSON: none points outside HeartWordData. This
supplements the chapter-specific audit and does not make legacy missing files
present.

The chapter-reference audit finds **Mark 3 and Mark 4 with no missing/hash
problems**. Mark 2 has 100 reported references to missing older separated
vocals/source-document paths (many refer to the same two files). These
pre-existing gaps are recorded, not repaired by guessing or paid regeneration.
Mark 4 retains 69 historical/custom editability gaps, as previously documented.

Blender 5.2.1 read-only inventory opens ten .blend projects and identifies
1,681 unique dependencies, all within HeartWordData; 20 referenced paths are
absent, including older Mark 2 source/assembled paths and incorrectly relative
export references. No present external media dependency was found. The report
is retained at `exports/disaster-recovery-blender-inventory-2026-10-07.json`.
Original .blend/.blend1 bytes and present dependencies remain included.
Old broken editor references need explicit relinking/repair; byte backup alone
does not promise that every historical Blender edit renders. Addons, caches
and sequences remain subject to the recorded inventory limitations.

## Small backup contract

`src/pipeline/assembly/disaster-backup.ts` and `npm run data:backup` provide
inventory, stage, publish, verify, restore and status. Recovery reuses
chapter-package's exact production-record capture and path projection. There
are no provider calls, migrations, retries, source corrections or pruning.

1. At an end-of-day maintenance window, finish/reconcile production, imports
   and external editors/renders. Never kill paid work to obtain a backup.
2. Create a unique staging directory outside live data, application and synced
   storage. An exclusive backup lock prevents competing backup runs.
3. Reserve writers on **every database** with SQLite BEGIN IMMEDIATE; a separate
   read connection calls Node's SQLite online backup API. Committed WAL content
   becomes part of a standalone snapshot. Do not copy the live database or its
   journal as ordinary files. Active saved production jobs hold backup.
4. Copy the whole data tree, including unregistered media, scratch/editor
   materials, other databases, models and prior portable packages. Copy actual
   application source, tests, documentation/config templates and lockfile;
   installed dependencies/Git internals and .env secrets stay out of the app
   snapshot. Known secret-file exclusions are listed. This is not a general
   credential scanner; credentials must never be stored in production assets.
5. Record SHA-256/length for every included file. Check copied bytes, rehash
   sources before completion, compare file identity/size/change timestamps and
   directory membership. New, changed or deleted media/app files fail completion.
   A concurrent source modification is not silently accepted as a newer state.
6. Check all snapshot databases for integrity and foreign-key consistency.
   Run existing per-chapter dependency/authority audits. Missing historical
   dependencies are explicit gaps while remaining useful production is saved.
   Preserve the audit; never label all dependencies complete in that case.
7. Write `backup.json` last. An interrupted directory without this marker is
   incomplete. Keep it for diagnosis and use a new destination on retry.
8. Publish only a completed verified snapshot to a new OneDrive directory.
   Copy/verify every file and write its marker last. The recorded state is
   **cloud_pending**, never protected. Local sync-folder existence, a green
   file icon or a copied marker alone does not prove the whole cloud backup.

[SQLite's backup API](https://sqlite.org/backup.html) supports consistent
snapshots. [SQLite's corruption guidance](https://sqlite.org/howtocorrupt.html)
explains why ordinary live file copies and omitted journals are unsafe.
An in-progress live database is never moved into OneDrive.

## Schedule, retention and visibility

Proposal for Dan's one-working-day tolerance: nightly at **23:30 Eastern**, if
the machine is awake and production is idle; run after substantial completed
sessions when practical. The one-day target includes upload time, not just
snapshot creation. Measure the first full upload before relying on that target.
An 87 GiB full upload may exceed the window on a slow connection; that would
require a destination/policy decision, not a false success or new platform.

Keep three most recent daily copies and four weekly copies, overlapping when
possible. Seven full copies are about 609 GiB; reserve at least 750 GiB free
before starting and remeasure as production grows. No automatic deletion is
implemented or authorized for essential production originals. Remove only
superseded backup copies after newer remote recovery succeeds. Failed copies
consume space and must be reviewed. Local staging plus the sync copy also
consume local space; C: initially has about 1.09 TiB free.
Keep only the most recent needed local staging copy after a newer cloud
restore is verified; retaining seven staging copies plus seven sync copies
would exceed that measured free space. Keep the isolated drill until its
evidence has been reviewed. No cleanup is performed by the runner.

**Destination check, October 7:** the configured account is
`dan@brenn.onmicrosoft.com`, with Windows root
`C:\Users\danbr\OneDrive - dsc`. Its authenticated OneDrive page reports
**495.9 GB used of 1 TB (48%)**. This fails Dan's minimum 750 GiB-free gate,
regardless of the display's GB convention. The older
`C:\Users\danbr\OneDrive` directory is not the configured root. No running
OneDrive process was found during inspection. No upload or scheduled task
is enabled. Dan must select separate storage, another qualifying account,
or explicitly revise retention/capacity requirements before publication.

`scripts/backup-nightly.ps1` prepares the nightly operation, but requires an
explicit capacity-confirmed switch and uses the configured OneDrive root.
Publication rejects a merely named but unconfigured OneDrive folder.
Register it with Windows Task Scheduler
only after the selected account/quota and first cloud restore are verified.
Do not enable unattended backup while that conditional destination is unproven.
The runner exits nonzero on failure; no silent retry or pruning occurs.

Latest status and append-only operation events live under `logs/`; they are
excluded from their own capture to avoid self-induced changes. The normal
Production crew panel displays the last result and a 24-hour overdue flag.
`data:backup status` returns a failing exit code for failure, running or overdue
state. A killed run remains visibly running/overdue; inspect its PID before
removing only its stale `.disaster-backup.lock`. Preserve completed backups.
Unreadable/truncated status reports a visible failure rather than breaking the
producer panel. Preflight failures are recorded, while a competing run does
not overwrite the running backup's status. Local visibility works; external
ChatGPT/SMS notification remains unavailable.
Cloud-pending status remains a limitation, not a remote success certificate.

## Recovery and verification

See [replacement-computer recovery guide](../production/DISASTER_RECOVERY.md).
Restore verifies the immutable baseline, uses a new unsynced root, copies all
retained bytes, and reconstructs the main DB with its exact schema/records,
relocating exact working file references through the shared preservation
helper. Original baseline rows remain in the SQLite snapshot. Prose, source
words, timestamps, decisions, costs and approval states are not invented or
rewritten. Restored source hashes and asset hashes must pass their usual gates.
The restored project uses existing selectors, loaders and producer controls.
Relative slash/backslash aliases remain distinct saved library rows. Absolute
working references relocate, while JSON without a changed exact reference
retains its original formatting. Sidecars remain byte-identical; a separate
`logs/disaster-recovery-paths.json` projects their original paths for the shared
dependency audit. Prior projections and restoration markers are retained under
`logs/recovery-history/` when backing up and restoring a restored workspace.
Application source restores to a new sibling `<data-root>-application`
directory, avoiding collisions with application material already in the data.

The real browser drill also exposed a saved beats-based chapter-ending record
that crashed the current frontend before another chapter could be selected.
The ending display now shows that historical record read-only, without
inventing a modern status, duration, approval or replacing its saved contents.
This compatibility fix is necessary to reopen the normal chapter workflow.

## Validation and dedicated Goal Guardian review

Implementation tests cover committed WAL state, multiple databases, reserved
writers, new/mutated/deleted media, interrupted/active work, retained rejected
takes and history, exact path relocation, missing-dependency reports,
corruption/path rejection, secret exclusion, visible failure/staleness, and
publish remaining cloud-pending. Tests use isolated state and no providers.
The full suite passes **562 tests in 96 files**, including nine disaster-backup
tests and two historical/current ending-display tests. Type checking, the web
build, PowerShell parsing, Python helper compilation and diff whitespace checks
pass. The backup tests also cover a second backup/restore of an already restored
workspace, with both earlier data roots unavailable.

The first real snapshot (`20261007-first`, ID
`efab3492-b079-458b-9328-ab233118cc6a`) completed with 30,077 included files,
93,458,876,924 bytes and all six SQLite checks passing. A first restore exposed
a UNIQUE library-path collision; that incomplete directory has no new completion
marker. The corrected full 87 GiB restore is at
`C:\Users\danbr\HeartWordRecoveryDrill\20261007-verified`. The new path-projection
helper was applied to this disposable restored copy after copying completed;
subsequent restores invoke the same helper automatically. Original sidecar
bytes and the immutable backup remain unchanged.

A separate Node permission-restricted drill explicitly denied read access to
live HeartWordData. It checked identical schema and row counts across all 58
tables, authoritative source/canon/review/cost/edit rows, source and selected
clip hashes, and the normal `loadCrewBrief`/chapter dependency audit. Mark 3
loads 35 source/reference verses, 76 audio intervals, 27 canon identities,
73 shots, 71 selected clips and 126 producer notes, with recorded spend
$79.756615 unchanged and zero missing assets/editability gaps. Evidence:
`outputs/disaster-backup-live-drill.json`. No provider or regeneration was used.

The captured application was installed with `npm ci` in an isolated bootstrap
directory and built successfully. After applying the tested historical-ending
display fix, its normal selector opens Hatam / Mark 3 at localhost:4002.
Mark 3 has no recorded chapter render to display as a current cut; its retained
selected shot `generated/assembled/0e9203e4-b950-4652-a596-f700e64ab564.mp4`
plays through the restored server (browser readyState 4, advancing time,
no media error) and fully decodes with FFmpeg. Existing legacy composite-audio
UI links still report playback errors; this drill does not claim all historical
UI links or Blender edits repaired. Original recording bytes remain verified.

The final snapshot is planned at
`C:\Users\danbr\HeartWordBackupStaging\20261007-recovery-tested` so it captures
the tested source, tests and guide instead of the earlier implementation.
Its completion and data comparison with the drilled baseline are recorded in
`outputs/disaster-backup-final-evidence.json`; absence of that successful report
means this final capture/comparison has not yet completed. No local snapshot
establishes remote survival.

Dedicated Goal Guardian review (separate review step): the change serves the
vision's retained editable chapter and USER_WORKFLOW's existing selector and
review controls. It extends assembly preservation and existing crew visibility,
adds no production stage/parallel state, and preserves unrelated current work.
No Scripture/audio performance, canon, approvals, producer decisions, budget
policy or field/release gates were changed. No paid generation, automatic
deletion, independent agent dispatcher or notification transport was added.
Scope and local recovery validation pass. Overall acceptance remains **open**:
Dan must select a qualifying destination or revise the capacity/retention
condition; upload, remote download/restore and schedule activation still need
execution. Requested external ChatGPT/SMS delivery is unavailable here and
has not been sent. These limitations cannot be resolved by claiming a C: copy
is a disaster backup.
