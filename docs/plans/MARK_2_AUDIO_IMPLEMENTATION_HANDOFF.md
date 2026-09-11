# Mark 2 audio repair: implementation handoff

Dan wants Sonnet 5 at Medium to implement the next changes to reduce usage.
Work in small, testable units. Use the existing audit instead of repeating
the chapter-wide investigation. Escalate a specifically identified difficult
problem to High; a focused independent review can follow implementation.

## Start from the implementation branch

Repository: `C:\Users\danbr\OneDrive\Documents\HeartWord`.
Current branch: `codex/film-role-workflow`.
Runtime data: `C:\Users\danbr\HeartWordData`.

The commit containing this handoff also contains the coordinated-role
implementation, timing-audit work and tests. Start from that commit on
`codex/film-role-workflow`; the older `claude/elegant-allen-83337a` worktree
does not contain these additions. Check status before proceeding and preserve
any subsequent working-tree changes. Runtime media, the database and audit
evidence remain in HeartWordData, outside Git.

Follow AGENTS.md and its required product documents. Then read:

1. The active section of `docs/plans/CURRENT_GOAL.md`.
2. `docs/design/timeline.md` and `docs/design/production-crew.md`.
3. `docs/production/hatam-mark-2/TIMING_AUDIT_2026-09-11.md`.

## Already implemented and verified

The filmmaking roles, Composer/SFX adapters, review gates and observed timing
import are implemented. Do not rebuild those systems. The production database
now contains an `audit_cut_timing` history entry for render
`dfbf0745-9719-4b5b-a97d-7412fa6b8b06`, project
`fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d`. Its 62 clip placements and audio findings
reach the crew and UI. This is intentionally incomplete evidence, not an
approved source-coverage manifest. Do not weaken its hold to make tests pass.

The film and Blender project remain unchanged. The Blender edit is newer
and differs from the film. Evidence, hashes and the pre-import database backup
are in `HeartWordData/exports/mark-2-timing-2026-09-11/`. Reuse that evidence;
only remeasure assets affected by a change or whose hash no longer matches.

Baseline: 206 Vitest tests plus three Python waveform tests pass; frontend
build/typecheck pass. Server typecheck has 21 existing errors, listed by the
compiler; no new files from this work appeared in that set. No paid calls.

## First implementation unit

Fix `scripts/build-narration-audio-block.ts`: its final mux reads an untrimmed
source input. When the picture outlasts the narration, `apad` allows the next
spoken line into that extra picture time. Trim to the explicitly requested
source interval before adding trailing silence. Preserve the selected video
and its duration. Make the builder importable without running its command-line
entry point as a side effect.

Add a real FFmpeg regression test with a source containing two distinct audio
sections and picture longer than the first section. The output must contain
only the selected section followed by silence, never the following section.
Also exercise a nonzero source offset. Run against temporary assets only.
Do not run the hard-coded production assembly scripts to test this fix.

## Following units

- Prepare an explicit source-to-editor placement plan using the newer Blender
  timeline. Preserve the complete original FCBH performance, duration-matched
  cast speech, approved introductory shots and wordless celebration.
- Restore the five narration spans identified in the audit (120.891 s),
  reconcile the partial healing narration and old crowd response, and reconcile
  Mark 2:19–22 with the current source/voice versions. A waveform mismatch does
  not by itself prove missing words; do not automatically discard old takes.
- Two cloth/wineskins files and accepted assembly attempts exist, but their
  clip links are absent. Reconcile their audio before restoring those links.
- Existing picture spans do not all fit the missing narration. Show the
  concrete coverage/placement changes required; do not overlap dialogue,
  stretch speech, drop source samples or disguise missing footage with long
  freezes. Surface any unresolved editorial decision to Dan.
- Produce a separate corrected cut/editor copy with retained originals and
  an accurate timing manifest once its coverage is sufficient. No music/SFX
  trial or new paid generation is part of this initial code-repair unit.

## Completion checks

Run `npm test`, `python -m unittest discover -s tests/assembly -p 'test_*.py'`,
`npm run build:web`, and the relevant typechecks. Compare server errors with
the baseline. Verify source audio and actual rendered duration rather than
trusting database durations. Update CURRENT_GOAL.md and perform the separate
Goal Guardian check. Report changes, evidence and any remaining production
blocker briefly. Passing software tests is not proof of a complete film.
