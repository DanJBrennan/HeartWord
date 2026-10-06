# Mark 4 speaker-mapping handoff

## Producer decisions already recorded

- Mark 4:3 is Jesus; its source-bound lip-sync was approved and selected.
- Dan approved five held teaching-boundary candidates. Jesus source segments
  were bound for Mark 4:11, 4:13, 4:21 (three contiguous segments), 4:26,
  and 4:30 (two contiguous segments).
- Dan approved the replacement Mark 4:9 candidate; its Jesus-only source
  interval, 111.217–114.896 seconds, was bound to Jesus.
- Dan identified the final plea in Mark 4:38 as Peter. Peter must be visibly
  present in the boat in any source-bound shot that carries this line.

## Completed protection

`src/pipeline/ingestion/speaker-attribution-gate.ts` now holds a future
chapter immediately after source alignment, before scene breakdown, if the
source text contains quotation marks but the original-reading track has no
speaker attribution. It is documented in `docs/design/audio-and-speakers.md`.
The full test suite passed at 478 tests after this work.

## Current Mark 4 storm evidence

The held review artifact is:

`C:\Users\danbr\HeartWordData\assets\generated\alignment\mark-4\mixed-speaker-mark4v9-r2.json`

- Mark 4:38: narrator through relative 10.800 seconds, then an unresolved
  plea through 14.320 seconds. Dan attributes that final plea to Peter.
  The absolute proposed split is 473.234 seconds.
- Mark 4:39: held Jesus command candidate, with narration before and after.
- Mark 4:40: held Jesus question candidate, with narration first.

These are evidence only. No storm-scene speaker binding or video generation
has been approved or created yet.

## Blocking implementation defect

Attempting to split the original-reading Mark 4:38 segment
462.434–476.434 seconds at 473.234 seconds failed with a foreign-key
constraint. The helper is `src/pipeline/ingestion/segment-splits.ts`.
It creates two replacement `audio_segments`, attempts to repoint dependent
records, then deletes the original. A dependent relation not covered by that
repointing sequence still references the original segment.

No partial split or Peter attribution was written. Preserve all existing
evidence and costs; do not delete or reset records.

## Required next work

1. Identify every foreign-key dependent table for `audio_segments` and repair
   `recordSegmentSplit` so it safely preserves/remaps each dependent record in
   its transaction. Add a regression test for a protected segment with the
   relevant dependency.
2. Run the full test suite.
3. Split Mark 4:38 at 473.234 seconds. Retain the first segment as narration.
4. Bind the new second segment to Peter, using Dan's approval as evidence.
5. Update the Mark 4:38 storm shot plan so Peter is visible in the boat; do
   not create a speaking off-screen Peter shot. This is a source/casting plan
   change only. Do not generate video until Dan reviews any resulting
   keyframe/coverage proposal.
6. Review the held Mark 4:39 and 4:40 candidates with Dan before binding
   Jesus or planning their lip-sync coverage.

## Guardrails

- Keep original Hatam audio source-locked; do not invent words or speakers.
- Do not bind a mixed narrator/dialogue interval as Jesus or Peter.
- Keep all model alignment output held until producer review.
- Do not start any video generation as part of this repair.
- Existing Mark 4 final clips are retained history and excluded from restart
  selection; the 95 approved keyframes remain reusable.
