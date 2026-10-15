# Codex production handoff

October 14 update: [the current reference workflow](CODEX_LTX_REFERENCE_WORKFLOW.md)
supersedes the historical board/default-provider descriptions below. Both
handoffs now group up to four non-Jesus identities per board, reserve Jesus and
set inputs separately, apply story-state/proof exclusions and pin/use accepted
FDL/Bible-regional context. Ordinary new-film paid image substitution remains
blocked. Existing chapter scopes and candidate-review requirements are retained.

Updated 2026-09-08. Active work is Hatam Mark 2, starting with Scene 1,
Shot 1. Product authority remains PRODUCT_VISION, CURRENT_GOAL, USER_WORKFLOW
and the subsystem design docs. This file describes the assistant-operated
keyframe handoff, not a new autonomous pipeline or a replacement application.

## How to continue

Use `scripts/keyframes.ts` with the existing database and approved Papuan
canon. Commands make no paid provider calls:

```powershell
npx tsx scripts/keyframes.ts status fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d
npx tsx scripts/keyframes.ts prepare <shot-id> <prompt.txt> <rationale.md>
npx tsx scripts/keyframes.ts import <brief.json> <generated.png> <review.md>
```

1. Inspect the saved shot, current references, source verses and prior review.
   Write a specific prompt and its rationale. Keep the shot action and current
   continuity authoritative over a contradictory scene-wide default.
2. Prepare an immutable brief. It snapshots Scripture, shot/canon metadata,
   prompt and source/reference hashes. It blocks missing or ambiguous approved
   versions, wrong regional canon and changed hashed assets. For more than five
   references it packages original pixels into paired contact sheets with
   FFmpeg; inspect these and explicitly describe their ordering in the prompt.
   FFmpeg must be on PATH; source images in a row must have equal heights.
3. Call the built-in image tool in the assistant session using the brief's
   exact prompt and ordered `generationInputs`. One brief per generation call.
   The tool is not callable by HeartWord's unattended Node server.
4. Inspect the image and write a candid review. Import the original PNG;
   metadata validation requires at least 1024x576 and 16:9 within one pixel
   for provider rounding. This is not a full media decoder or image QC score.
5. Import creates a unique image plus provenance JSON beneath
   `HeartWordData/assets/generated/keyframes/codex/<shot-id>/`, a generation
   attempt, and a review note. The existing shots API/UI selects this latest
   image. Earlier attempts and files are retained. Reimport of the same brief
   and image is idempotent; different output requires a new brief.

Briefs live in `HeartWordData/exports/keyframe-briefs/`. Reviewed prompts and
production notes live under `docs/production/hatam-mark-2/` in the repo.
The status command derives current shot state from SQLite, rather than the
project-level stage/status fields, which currently still say ingestion /
not_started despite extensive downstream work.

## Known integration limits

The built-in image tool reports neither an underlying model ID nor per-call
billing here. Provenance says `model: not_reported`. The old database requires
a numeric `cost_usd`, so imported attempts use zero as an explicitly documented
compatibility placeholder, not a claim of free generation. No cost-ledger
amount is invented; the legacy displayed total excludes unreported tool usage.

New takes are held for producer review. The existing Approve/Flag controls
record human review notes but do not themselves select an accepted attempt for
video. Google QC routines currently search accepted attempts; do not call them
expecting to review a held Codex candidate. This handoff records the assistant's
visual review explicitly without claiming those routines ran.

The existing media-generation button still uses Gemini and may regenerate a
held shot, or reuse an older accepted take. Continue Codex image work through
this handoff; the tool is not yet a server provider selection. Re-running
casting deletes existing shot-associated records in the current implementation,
so it is not part of this workflow. No video provider was changed or exercised.

The legacy Gemini adapter reuses one filename per shot; its historical rows
cannot recover overwritten pixels. This handoff protects every new take with
its own file. Existing files/rows were preserved as found.

## Validation at handoff

All 100 tests pass (90 existing + 10 handoff integration/validation tests).
The running local API returns the new candidate as Scene 1 Shot 1's latest
image. Full
typechecking exposes pre-existing errors in casting/QC, Gemini reference
loading and character/scratch scripts. Do not describe this repository as
typecheck-clean. New work is intentionally additive; existing uncommitted
Claude edits were preserved.

Current candidate: `HeartWordData/assets/generated/keyframes/codex/`
`f6386c84-b0b0-404d-b080-faa644443f72/b93a62cf-cb9b-4c82-934b-3f3df8407615.png`.
Matching `.json` contains its complete generation provenance.

## Coverage-beat keyframes (new, 2026-09-09)

A `covered_sequence` shot (dialogue too long for one clip -- see
`src/pipeline/casting/coverage-manifest.ts`) is no longer just one shot
keyframe. It's now broken into an ordered `coverage_beats` plan: one
silent wide master, then repeating close lip-sync inserts and
reaction/cutaway beats, all playing under that shot's one continuous
dialogue audio. Each beat that needs a NEW keyframe (`requires_new_keyframe
= 1`, `keyframe_asset_path IS NULL`) is its own generation, separate from
the shot's own single keyframe this handoff already covers above.

**Update 2026-09-09:** the original 43 beats (9 masters, 17 cutaways, 17
additional lip-sync inserts) across all 9 covered_sequence shots have all
been generated and accepted, EXCEPT Scene 1 Shot 8 -- see below. Run
`npx tsx scripts/coverage-keyframes.ts status fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d`
for the live, current list -- each row's `notes` field says what that
specific beat should show. As of this writing that's **3 beats, all on
Shot 8**.

**Shot 8's beat IDs changed and its old attempt history was deleted.**
A real bug was found and fixed in the duration calculation feeding
`coverage-manifest.ts`: two adjacent audio segments sharing a boundary
verse (Shot 7's `Mark 2:8-10` and Shot 8's own `Mark 2:10-11`, both
touching verse 10) were both being summed into Shot 8's total dialogue
duration, doubling its real 18.8s into a wrong 36.8s. That produced an
8-beat plan reaching well past where Shot 8's actual dialogue audio
ends -- beats 5-8 had real, accepted keyframes generated for audio that
belonged to a different shot's math, not this shot's real speech. The
duration bug is fixed (`coverage.ts`'s `verseRangesRelated`, containment
instead of plain overlap -- every other shot's duration was already
correct, only Shot 8 was affected), Shot 8's stale `coverage_beats` rows
and their `coverage_keyframe_attempts` history were deleted, and it was
replanned correctly: **4 beats totaling 18.8s** (master, a reused-keyframe
lip-sync insert, a cutaway, and a fresh lip-sync insert). The 3 beats
needing new keyframes (sequence 1, 3, 4) are new rows with new IDs --
if you have any local notes referencing Shot 8's old beat IDs, they no
longer exist in the database.

This is a **separate tool**, `scripts/coverage-keyframes.ts`
(`src/pipeline/media-generation/external-coverage-keyframes.ts`), not a
modification of the shot-level `scripts/keyframes.ts` above -- reusing
the shot-level tool here would corrupt a shot's own single-keyframe status
history. Same mechanism, addressed by beat instead of shot:

```powershell
npx tsx scripts/coverage-keyframes.ts status <project-id>
npx tsx scripts/coverage-keyframes.ts prepare <beat-id> <prompt.txt> <rationale.md>
npx tsx scripts/coverage-keyframes.ts import <brief.json> <generated.png> <review.md>
npx tsx scripts/coverage-keyframes.ts accept <beat-id>
```

Same division of labor as before: inspect the beat's context (its parent
shot's action/verse/continuity, the beat's own type and notes, the real
character references) and write the prompt/rationale yourself; `prepare`
only snapshots and hashes what you wrote, it never generates prompt text.
`prepare` accepts a `planned` beat, or a `generated` beat only when the producer has requested a genuine regeneration. It refuses an accepted beat. A regeneration creates a new immutable brief and candidate, retains the previous PNG/provenance, marks its coverage-attempt history `retry_modified`, and replaces only the active beat anchor. Briefs live under
`HeartWordData/exports/coverage-beat-briefs/`, keyframe candidates under
`HeartWordData/assets/generated/keyframes/codex-coverage/<shot-id>/`.
`import` writes into `coverage_beats.keyframe_asset_path`/`status`
directly, never into `shots` or the shot's own `generation_attempts` --
review notes for a beat land as a `shot`-scoped review note (there's no
`coverage_beat` `review_notes.subject_type` in the schema) but say which
beat they're about in the note text.

A beat's `audio_start_ms`/`audio_end_ms` are proportional estimates of the
shot's total dialogue duration, not real phrase boundaries yet (same
caveat as Scene 3's now-resolved shared-segment split) -- fine for
composing the image itself, but don't treat the exact millisecond cut
points as final until they're refined against real audio.

## Candidate composite QC

After importing every Codex keyframe candidate and before presenting it for producer approval, run:

```powershell
npx tsx scripts/keyframes.ts critique <attempt-id>
```

This runs the grounded Critic, scene-fidelity check, and canonical-likeness comparison against every assigned character's approved reference. It records a QC note but preserves the candidate as `hold_for_review`, so the producer can regenerate or explicitly override it. A Critic result alone is never a canon approval.
