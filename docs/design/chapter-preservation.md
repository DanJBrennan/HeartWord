# Editable chapter preservation

Implemented October 7, 2026 in assembly's `chapter-package.ts`. This is a
portable production snapshot, not a new pipeline stage or disaster-backup
service. The product goal is the faithful, editable chapter described in
PRODUCT_VISION, CURRENT_GOAL and USER_WORKFLOW: reopen a chapter months or
years later, inspect its source/asset lineage and revise retained components
without buying another generation or reverse-engineering an MP4.

## What exists and what this adds

Existing SQLite records already retain source bindings/alignment, cast maps,
versioned canon, generation attempts, selected clips, coverage, crew briefs,
reviews, producer lessons/decisions, typed edit history and render manifests.
These are the production authorities; manual and autonomous runs use them.
Some historical film edits retain custom patch manifests/scripts instead of
the common executable timeline/source-audio map. A record called “manifest”
does not itself prove that a picture edit is reconstructable.

The package exporter reads a consistent database snapshot without initializing
or migrating the live database, follows existing record relationships and
copies referenced bytes. It includes all takes for chapter shots, historical
versions/assets of referenced canon identities, donor references required by
reuse, all source/cast maps and archived cast-master rows, render history,
soundtracks/cues, finishing recipes, prompts/settings, provider sidecars,
reviews/approvals, costs, outstanding stage/job state and producer history.
Shared canon does not import unrelated chapters. Optional explicit files or
directories preserve external editor recipes and other known dependencies.

The actual runtime source, package lockfile, TypeScript/build configuration
and FDL design schemas are included under `application/`, because a Git
commit does not identify uncommitted fixes. Credentials, `.env`, installed
dependencies and Git internals are not included. Node/FFmpeg/application and
exact SQLite schema versions are recorded. Reinstallation of matching tools
and npm dependencies can still be needed on a different machine; no provider
credential is needed to edit/render retained media. Exact codec bit identity
across application versions is not promised.

## Package contract, v1

```
chapter-package.json   # completion marker, format/version, project identity,
                       # application versions, hashes, retention, gaps
schema.sql             # actual tables, indexes and immutability triggers
records.json           # original saved rows, including immutable history
assets/...             # source, canon, selected/rejected/superseded media
scratch/...            # explicitly included external-editor material
application/...        # source and dependency lockfile used at export
```

Every retained file has a package-relative path, byte length, SHA-256, original
references, referencing records and original/derived classification. Existing
paths under HeartWordData retain their relative relationships. External
standalone files receive content-addressed paths under assets; place a
multi-file editor bundle under assets first so its internal relationships are
retained. Historical origin paths remain evidence, never permission to read
substitute files on restoration.

Source/canon/soundtrack authority hashes must match. Missing assets, stale
Blender locks and changed files hold export. Files are rehashed after copying;
the completion marker is written last. Verification checks records, schema
and every retained byte. Restore verifies before writing, rejects escaping
paths/links, requires a new root, restores the exact schema/relationships and
checks foreign keys. Exact asset references become paths in the restored
working projection. Original rows remain in records.json; prompts, source
wording, approvals and timestamps are not reconstructed or invented.

Database relationships and JSON snapshots provide inspectable source/cast
intervals, selected takes, timeline placements, pauses, audio cues, music/SFX,
finishing and edit commands. Opaque historical recipes remain retained but
are explicitly listed under `editability`. A custom recipe needs its original
editor/scripts and a complete dependency inventory before claiming automatic
picture rebuilding. Preservation does not silently manufacture a normalized
timeline or guess missing audio mappings from the rendered film.

## Retention and storage policy

- Essential originals are retained indefinitely: source/cast masters, canon
  versions, every generated take (accepted, rejected, held, superseded),
  imported artwork/video/audio, editor projects/dependencies, records and
  provenance. Selection never deletes a previous take. No automatic pruning.
- Thumbnails/proxies explicitly referenced as such are marked `derived`.
  They remain included by default. They are reproducible caches only when
  their complete originals and recipe survive; selection as actual footage
  makes the dependency essential. A render being reproducible is not a reason
  to delete its review/approval evidence.
- Storage reclamation requires a separate explicit producer decision. A
  future archive tier may move retained originals to cheaper storage, but
  must preserve checksums, retrieval and provenance. No age-based deletion
  rule or grace period is invented here.
- An incomplete package directory is retained for diagnosis, never mistaken
  for a completed package. Use a new destination on retry. Export and restore
  never overwrite an existing directory or merge over a live production.

Production preservation answers “what is needed to edit this film?” Disaster
backup answers “what survives disk loss?” A package on the same disk provides
portability and lineage, **not disk-failure protection**. Off-machine copies,
backup destinations/schedules, available storage and recovery drills are
separate work. No backup service or schedule is configured by this change.

**Retaining a prompt or seed does not guarantee exact AI reproduction.**
Providers/models, randomness and availability change. Actual generated pixels
and audio are essential originals; a missing take is reported, never silently
substituted or regenerated. This applies equally to included image-generation
usage and paid calls. Included usage/unreported charges retain their actual
recorded labels; preservation makes no new provider calls and does not turn
unknown costs into zero. Future paid work still must account for outstanding
charges within the cumulative $200 film budget.

## Overwrite prevention

The audit identified and repaired fixed `shotId.mp4` filenames in Gemini
final/draft/guided video and both assembled-shot paths; new takes now receive
unique names. Provider image/video writes use exclusive creation. Kling
task outputs cannot replace existing bytes. LTX rejects an existing output or
metadata record, including an interrupted attempt whose MP4 is absent.
Keyframe cropping and voice extraction refuse to overwrite.

Voicing no longer identifies source intervals by scoped-loop position or
reuses an arbitrary existing filename. It reuses the exact saved source hash,
interval identity and approved voice-version mapping. Missing mapped audio
holds before a provider call. Forced/new takes get unique names. Before the
current cast projection changes, typed `supersede_cast_master` history retains
previous rows, source maps and next selections; old audio files remain.
Unregistered older files in the chapter's cast-master directory are also
inventoried conservatively.

New cast sidecars retain exact source bounds, the voice version, actual
provider settings and honestly unreported usage/cost. An equal-duration
boundary move cannot reuse that new take against the wrong source window.
Older maps retain their original evidence; absent historical details are not
invented. Superseded QC notes remain saved, and their prior resolution state
and the current original intervals are included in the cast edit history.

The legacy-script pass protected fixed Mark 3/Mark 4 chapter/pilot outputs,
gave older assembled-shot/full-chapter outputs unique names, and made held
Mark 4 copies exclusive. The standalone Capernaum location draft previously
normalized over its raw pixels; it now retains raw and normalized versions.
Many existing revision scripts already refuse overwrite or use exclusive
creation. Temporary FFmpeg scratch files and in-progress status projections
remain writable; they are not independent media takes. Historical external
Python repair recipes are preserved as evidence, not rewritten wholesale;
run them in an isolated restored root until their custom paths/recipes have
been normalized. Earlier pixels already lost through old overwrites cannot
be recovered from prompts.

## Blender dependencies

`scripts/blender/preserve_dependencies.py` runs inside Blender with autoexec
disabled, never saves over the original and creates a new mirrored bundle.
It inventories external textures, linked libraries and other paths through
Blender's [external-path API](https://docs.blender.org/api/4.4/bpy.utils.html),
makes the copied project paths relative, copies/hashes dependencies and writes
`scene.blend.dependencies.json` with Blender version, source/copy hashes,
relative relationships and enabled addons. Packed data stays in the .blend.

Put the bundle under HeartWordData/assets and include its copied .blend in
the package. Export requires its matching dependency lock and verifies every
listed dependency. Missing textures/libraries, unsupported sequences/UDIMs,
cross-drive paths that cannot become relative and absolute media paths inside
linked libraries hold rather than producing a misleading portable file.
Addons/external render engines and simulation-cache workflows require explicit
inventory and compatible software; the helper does not install them or claim
arbitrary Blender projects are self-contained.

## Producer and command workflow

The existing Production crew panel has **Preserve chapter for later editing**.
It uses the same function as the CLI and writes a new package under
HeartWordData/chapter-packages. The response lists historical editability
gaps; successful byte preservation alone never claims those gaps are solved.
`GET /api/projects/:id/production/preservation` inspects without copying;
`POST` exports saved production state. It never starts planning/generation.

```
npm run chapter:package -- inspect PROJECT_ID
npm run chapter:package -- export PROJECT_ID NEW_PACKAGE_DIR [EXTRA_FILE_OR_DIRECTORY...]
npm run chapter:package -- verify PACKAGE_DIR
npm run chapter:package -- restore PACKAGE_DIR NEW_DATA_ROOT
```

Set `HEARTWORD_DATA_DIR` to the new root and start HeartWord; select the same
language/book/chapter. Do not start a second server over the original root.
Use normal saved producer edits and assembly/finishing controls; accepted
components do not require a provider call. Keep the immutable package as the
restoration baseline and export a new package after revisions.

## Validation and present limits

The real-FFmpeg workflow test exports production records/assets, restores
under a different root, makes original assets unavailable, reopens through
`loadCrewBrief`, changes a retained music cue from -24 to -25 dB and renders
a revised preview through `applyFinishing`. Source/cast placement and duration
are preserved, edit history gains the revision, the cost ledger is unchanged
and no model/provider is called. The retained demonstration is explicitly
synthetic colored footage and tones, not a claim to review Hatam filmmaking.

The real Blender 5.2 test creates a texture and linked building library,
exports/restores the bundle, removes access to both original directories,
and reopens Blender with every dependency present. Tests also cover rejected
and superseded takes, historical canon, exact source relocation, scoped-voice
collisions, forced-voice history, hash/missing-file failures, unsafe paths,
existing-root protection and honest legacy timing gaps.

The production Mark 4 audit finds retained media and 69 custom/legacy render
recipes, including the current registered v73. These are preservation records,
not automatically executable complete picture/source maps. The preservation
package can retain those recipes, original scratch materials and components;
automatic full v73 rebuilding remains unverified until the original custom
editor recipes are normalized. No Scripture/cast/canon/approved take or live
producer edit is changed to make that audit pass.

The new [FDL design](film-description-language.md) and Bible/Papuan schema are
separate design artifacts, not retroactive requirements for existing chapters.
Your dot, external ChatGPT delivery and SMS are not callable capabilities in
this session. This chat reports results; no phone delivery or new live Mabel
worker is claimed. Dan already supplied the destination in the referenced
chat; a connected delivery capability, rather than another approval, is needed.

## Separate Goal Guardian review — October 7, 2026

A dedicated review pass revisited PRODUCT_VISION's faithful editable production,
CURRENT_GOAL's active local-LTX work and USER_WORKFLOW's language/book/chapter
selector and scene-level corrections. It distinguished implemented package,
retention and producer controls from historical custom edits, declared crew
roles and the proposed FDL adapter. It found and repaired case-sensitive
lesson matching, deletion of old cast QC notes and possible reuse after an
equal-duration source-boundary change. These repairs protect the same saved
manual/autonomous production; they add no new stage or per-chapter approval.

| Acceptance | Evidence/result |
| --- | --- |
| Preserve source, canon, takes, reviews, costs and producer history | Record closure, authority hashes, retained originals/sidecars and restoration tests pass; matching shared lessons retain their events without importing donor media. |
| Move and reopen without paid generation | The real Mark 4 package restores under a different root and reopens through the normal loader. Preservation has no provider imports or regeneration fallback. |
| Edit retained components and render a revised preview | The real-FFmpeg synthetic chapter reopens with original assets unavailable, saves a 1 dB music edit and renders it. The changed signal exceeds codec variance; source/cast timing, duration and cost ledger remain fixed. |
| Blender portable relationships | Blender 5.2 reopens external texture and linked-library dependencies with original directories unavailable. Unsupported forms hold. |
| Missing assets remain visible | Export/verify/restore and mapped cast reuse fail explicitly on missing/changed files. |
| Existing current Mark 4 picture recipe fully rebuilds | **Not demonstrated.** Current v73 and 68 other historical render recipes lack the complete common executable timeline/source map. Their bytes, custom recipes and scratch material are preserved, with automatic picture rebuilding held. |
| Scope and Dan's workflow | Existing chapter selection, accepted assets, source wording/speed, canon, live producer decisions, field/release gates and the active LTX work remain intact. FDL is a requested design artifact, not an invented runtime dependency. |

Result: the new preservation/restore/edit workflow meets its tested contract;
do not extend that result to a claim that all legacy films can automatically
rebuild. Converting the retained v73 editor recipes into complete executable
maps is the remaining historical engineering limitation, not permission to
replace accepted media or guess Scripture timing. No product decision is
needed from Dan to use preservation. A disaster-backup destination/policy and
connected Your dot/ChatGPT/SMS capability remain separate operational choices;
no notification or off-machine backup is claimed.

Final verification: full test suite, TypeScript checks and web production build
pass (551 tests across 94 files). Changed TypeScript scripts also parse without
executing their generation/review jobs. Core/Bible-Papuan schemas and the worked packet validate against JSON
Schema 2020-12 using an isolated validator outside the runtime dependency tree.
No paid generation was performed. Existing included/unreported cost evidence
was preserved without assigning unknown charges a zero value.

Retained final workflow evidence is under
`HeartWordData/scratch/chapter-preservation-proof-2026-10-07`:
`chapter-package/`, `revised-data/`, `revised-preview.mp4` and `evidence.json`. The
revised data root retains the working database, media and saved edit, and was
reopened independently after copying. The package is an
immutable baseline; the revised preview and saved edit-history evidence show
the subsequent local edit. The authentic Mark 4 export was created earlier in
this session and preserves the application source as it existed at that export,
rather than being overwritten with later fixes.
