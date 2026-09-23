# Claude Code handoff — Mark 3 source-alignment review

**Date:** 2026-09-18  
**Purpose:** continue safely from the committed source-alignment work while
Dan reviews Hatam Mark 3 for production. This is a handoff, not authorization
to call providers, edit source assets, or automatically resolve review holds.

## Product and operating constraints

HeartWord turns verified heart-language Scripture audio and text into an
editable, reviewed chapter film. The pipeline—not a manual editor—is the
primary product; the editor and review surfaces exist so a producer can
inspect, correct, and override its evidence. Read the authoritative
[product vision](../PRODUCT_VISION.md), [non-goals](../NON_GOALS.md),
[architecture](../ARCHITECTURE.md), and [current goal](../plans/CURRENT_GOAL.md)
before substantive work.

`AGENTS.md` is binding:

- Preserve source text and the complete source-audio performance. Never
  invent Hatam, theology, or narrative material beyond the verified source.
- Keep ingestion, scene breakdown, casting, media generation, lip-sync,
  voice, and assembly independently runnable and testable.
- Record content/framing/casting judgments with reviewable reasoning. Human
  corrections are evidence, not destructive replacements for automated
  evidence.
- Do not add a new subsystem or infer product requirements from existing
  code. Use the product/design docs and ask Dan when a material product
  decision is needed.
- Run the Goal Guardian check before/after substantial work: name the product
  goal and acceptance criteria served; verify Dan's workflow remains intact;
  update `docs/plans/CURRENT_GOAL.md` when a unit of work genuinely changes
  current status.

## Source corpus and project data

Runtime data is outside the repository. The normal immutable corpus root is
`C:\Users\danbr\HeartWordData\assets\source`; source files must be used in
place, never copied into the repository.

For catalog-backed Hatam Mark chapters, see
[`source-catalog.ts`](../../src/pipeline/ingestion/source-catalog.ts):

- Hatam text: `...\assets\source\hatam\text\Mark\Mark 3.docx`
- Hatam FCBH audio: `...\assets\source\hatam\audio\Hatam_had_LAI_NT_Non-Drama\`
  using the `B02___03_...______HADLAIN1DA.mp3` chapter file.
- English ESV text: `...\assets\source\english-esv\text\Mark\Mark 3.docx`.

Non-Drama is the default selected FCBH edition. `project_source_bindings`
persists selected relative paths, hashes, provenance, and edition; if bound
bytes change, reuse must hold for producer reconciliation. Older projects may
still resolve their legacy `assets/source/<language>/<book>-<chapter>/` paths.

## Mark 3: current production-review stance

Dan is manually reviewing the original-reading alignment for production.
Manual listening is expected: there is no Hatam forced alignment and no native
language reviewer in the normal production loop. Ryan/team review is reserved
for critical final review, not routine interval confirmation. Gemini's
sentence-level work supplies bounded source evidence; it is not language
approval. Dan identifies heard content and boundaries.

The source-alignment UI is useful for listening, but wording in older/current
UI views can differ while the chapter-preparation/navigation work remains
uncommitted. Trust retained evidence and named human corrections, not display
wording alone.

### Completed named Mark 3 review evidence

These are user-facing ranges; automated evidence and original intervals remain
retained behind the review records.

| Range | Human-reviewed interpretation |
| --- | --- |
| 0.59–2.99s | Opening title `Mark Chapter 3`; still unassigned opening/editorial audio. |
| 55.733–57.990s | Mark 3:4 — `But they were silent.` |
| 239.321–240.940s | Mark 3:18 — `Simon the Zealot`. |
| 259.262–273.262s | Editorial title `Yesus kin Beelzebul`, with `Mat. 12:22-32; Luk. 11:14-23, 12:10`. |
| 371.645–385.645s | Mixed editorial transition: title `Yesus nipmem kin nikinjoi bat nya`; refs `(Mat. 12:46-50; Luk. 8:19-21)`; next Scripture is Mark 3:31. Do **not** invent an internal split. |
| 385.645–399.191s | Mark 3:31–32 after the confirmed boundary trim. The prior automated interval ended at 399.645s; the next clip now begins at 399.191s and owns `Andigpoi`. |

The two title/reference records are append-only editorial classifications,
not verse assignments or safe omissions. The mixed 371.645–385.645s record
retains its automated Mark 3:29–31 span as evidence while film treatment is
held for review.

## Implemented alignment architecture

Start in [`src/pipeline/ingestion/index.ts`](../../src/pipeline/ingestion/index.ts)
and [`gemini-alignment.ts`](../../src/pipeline/ingestion/gemini-alignment.ts).

- Generic Gemini alignment builds recursively bounded speech intervals, asks
  for verbatim source-text proposals, places ordered anchors monotonically,
  and uses a stronger bounded fill for unanchored Scripture text. Evidence is
  stored in `alignment_evidence` and coverage/unresolved results hold work
  rather than silently fabricating alignment.
- A `submission_started` record is written before a provider call. A lost
  response becomes `submission_uncertain`; it must not be silently retried or
  converted to heuristic output. Without Gemini, silence-derived estimated
  timing remains provisional and requires named source review.
- The score shown for a matched interval is a **local ordered text-match
  evidence score** (0–100), not Gemini confidence, forced-alignment certainty,
  a timing guarantee, or language approval. See
  [`alignment-display.ts`](../../src/pipeline/ingestion/alignment-display.ts)
  and the source-segment API in
  [`projects.ts`](../../src/server/routes/projects.ts).
- [`BoundedIntervalAudio.tsx`](../../src/web/BoundedIntervalAudio.tsx) plays
  only the selected source interval; it does not create or alter clips.
- [`parse-source-text.ts`](../../src/pipeline/ingestion/parse-source-text.ts)
  recognizes a published narrated title only when a non-verse line is followed
  immediately by parenthesized references and then a verse paragraph. Titles
  and citations are non-Scripture structural evidence, though they may be
  spoken in the audio.
- Story Writer/Shot Director receive a title only as optional scene-title
  context. Cross-references are not automatically on-screen, narration, or
  film content. See [`crew-context.ts`](../../src/pipeline/creative-direction/crew-context.ts).

### Editorial/citation rule

[`editorial-omit.ts`](../../src/pipeline/ingestion/editorial-omit.ts) is
intentionally conservative. A citation can be omitted from a finished film
only when a matched title has clean matched Scripture resumption and no
intervening unresolved or citation-speech evidence. A matched citation,
unresolved material, or no clean resumption is a **review hold**. Do not mass
auto-resolve editorial material merely because a title exists.

Existing Mark 3 was **not** rerun through a title-aware provider alignment.
A future provider run must be explicitly authorized by Dan before it is used
to assess or refine automated evidence. Current human corrections remain
durable evidence through that work and must be preserved.

## Human corrections and safe re-ingestion

Schema and implementation are in
[`schema.sql`](../../src/db/schema.sql) and
[`src/pipeline/ingestion/`](../../src/pipeline/ingestion/):

- `source_alignment_corrections`: append-only named verse/text corrections,
  tied to an original-reading segment plus source/alignment hashes.
- `source_alignment_editorial_classifications`: append-only title/reference
  and mixed-transition classifications; these intentionally do not force
  editorial speech into a verse.
- `source_alignment_boundary_overrides`: append-only original and corrected
  interval bounds plus named evidence. The active segment bounds reflect the
  correction while original automatic timing remains recorded.

Re-ingestion previously failed foreign-key checks because it deleted original
reading rows before remapping correction records. It now inserts replacements,
maps verse/editorial corrections only to an exactly equal original start/end
interval, reapplies boundary overrides, and only then deletes old rows in one
transaction. If no exact counterpart exists it rolls back: never disable FKs,
delete correction evidence, or silently retarget a correction. A safe real
Mark 3 re-ingest without a provider now produces the expected pre-existing
coverage hold (about 93.6%), not an FK error.

## Git and validation state

The committed alignment work is:

```text
ec50ec5 Add reviewable source alignment evidence
```

Do not amend, rewrite, or push this commit unless Dan explicitly requests it.
At handoff time, the following unrelated changes remain intentionally
uncommitted; re-check `git status --short` before any work and preserve or
isolate them:

```text
docs/plans/CURRENT_GOAL.md
src/server/routes/projects-navigation.test.ts
src/server/routes/projects.ts
src/web/App.tsx
```

They are chapter-preparation/canon-readiness/navigation UI work, not part of
the alignment commit. Do not accidentally stage them with a follow-up.

Last validation on the committed alignment scope: full Vitest suite passed
**55 files / 305 tests**, strict `npm run typecheck` passed, and
`npm run build:web` passed. The full suite has occasionally shown an FFmpeg
PCM-equivalence flake; rerun the isolated case before treating that as a
regression. For later code changes, run the full suite, typecheck, web build,
and document the result.

## Suggested next work (not completed or authorized automatically)

1. Inspect the uncommitted navigation/canon changes and obtain Dan's direction
   before mixing them with any alignment follow-up.
2. Obtain explicit authorization before a title-aware Gemini re-alignment of
   Mark 3; do not send providers/assets by default.
3. After an authorized re-alignment, review its holds—especially citation and
   editorial speech—against manual listening, preserving every current human
   correction and its provenance.
4. Do not auto-resolve or auto-omit title/reference material solely from
   structural parsing; follow the clean-resumption rule above.
