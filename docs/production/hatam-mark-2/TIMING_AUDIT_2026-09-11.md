# Mark 2: existing film and editor timing

Recorded September 11, 2026. This is an observed production audit, not approval
of source completeness. The film and Blender project were left unchanged.
No provider or model calls were made.

## Result

Recovered **62 clip placements** in the saved film and exported the newer
Blender project separately: 62 movie strips, 19 sound strips and its caption
strips. Some movie strips contain their own internal coverage cuts; these
counts describe source-clip placements, not every camera cut.

The observed film timing and source-audio findings are registered in the
project's retained edit history. They appear in the Production crew panel
and in the next finishing brief. They do **not** populate an approved timing
manifest. Automatic finishing remains held, even if a model declares approval
or someone supplies a mathematically complete timing table for the same film.

## Which edit was measured

- Project: `fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d`, Hatam Mark 2.
- Current render record: `dfbf0745-9719-4b5b-a97d-7412fa6b8b06`.
- Film: `assets/generated/chapter/fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d-full-with-inserts.mp4`.
- SHA-256: `e6d971255d4bc582912d231e32b3a79e5facf68ebb43e75452ba3572cc5b5833`.
- Measured file duration: **473.938 seconds**. The database says 473.999;
  that 61 ms discrepancy does not account for the missing narration.
- The film was last written September 10 at 21:35 local time. The newer
  `assets/generated/editor/mark-2-full-chapter.blend` was saved September 11
  at 00:58. Its last movie ends at frame 11299 (470.792 seconds at 24 fps);
  its inclusive scene range would render one further frame.

The newer editor has roof-shot reordering, earlier gratitude/crowd reactions
and newer takes that are absent from the saved film. Its exact frame ranges
must not be attached to that older film. Several source files were replaced
in place after the film was rendered. Matching a filename alone therefore
does not establish which take the film contains.

## Audio findings

Five complete narration intervals have no waveform matches in the film.
The editor also has no narration beds assigned to their corresponding
picture spans. Together they contain **120.891 seconds** of source recording.

| Source passage | Original source interval | Duration |
| --- | --- | --- |
| Mark 2:12–14 narration | 160.900–181.828 s | 20.928 s |
| Mark 2:14–16 narration | 183.208–230.137 s | 46.929 s |
| Mark 2:17–18 narration | 261.240–277.527 s | 16.287 s |
| Mark 2:18–19 narration | 282.518–298.590 s | 16.072 s |
| Mark 2:22–24 narration | 359.950–380.625 s | 20.675 s |

Additional issues:

- **Repeated forgiveness line.** The first narration block carries the
  original speaker into the beginning of Jesus' Mark 2:5 line at film time
  approximately 1:31.571. The dubbed line then starts at 1:37.547. The block
  builder's `apad` receives an untrimmed source input, so extra picture time
  consumes the following source line before any silence is added. A future
  rebuild must trim to the approved narration interval *before* padding.
- **Healing narration and crowd response.** Only roughly the last eight
  seconds of the 23.801-second Mark 2:11–12 narration are detected, under
  the older crowd-response picture around 3:20–3:28. The current approved
  crowd dub does not match that rendered response. Preserve the intentional
  wordless exit/celebration while restoring the source elsewhere in order.
- **Mark 2:19–22 needs reconciliation.** The rendered speech does not match
  the current source/dub files. The bridegroom/taken-away clips are also much
  shorter than their current aligned source intervals. This is evidence of
  incompatible versions, not proof that all these words are absent. Reconcile
  the source version and actual performance before replacing or re-timing it.
- **Unassigned source samples.** The 0.520-, 0.800- and 2.910-second original
  intervals between aligned lines, and the nearly silent closing interval,
  have no verified placement. Silence is not a reliable waveform identifier
  and cannot be counted as evidence that the original samples were retained.

The first two narration beds and most other dialogue have strong matches.
The scribe's Mark 2:16 line has consistent placement across every sampled
portion but a lower whole-line correlation (0.823); retain that measured
difference instead of pretending it is exact or automatically rejecting it.

## Footage findings

The cloth and wineskins assemblies are present on disk **and** have accepted
assembly attempts. Only their `clips` links are absent. Both older assemblies
also match the rendered film. Their audio still needs the reconciliation above;
neither missing bookkeeping nor historical acceptance justifies regenerating
or freshly approving them automatically.

Most source clips match the film at several distinct sampled frames. Four
older rendered takes—silent scribe, paralytic before healing, rising, and
crowd response—were identified visually but do not match their current files.
Their recorded source path is null; the film itself remains the evidence.
Boundary measurements use a 24 fps comparison grid, with one-frame (42 ms)
uncertainty. The manifest explicitly preserves this distinction.

## Evidence and reproduction

Evidence lives outside OneDrive, under
`C:\Users\danbr\HeartWordData\exports\mark-2-timing-2026-09-11\`:

- `before-import.sqlite`: database backup before this unit's production writes.
- `database-evidence.json`: source intervals, shots, clips and render records.
- `blender-timeline.json`: exact frame ranges, source offsets, mute state,
  channels and original project hash.
- `picture-evidence.json`: source hashes, media metadata and sampled frame matches.
- `audio-evidence.json` and `original-dialogue-evidence.json`: normalized
  waveform correlations, reference offsets and detected film placements.
- `observed-cut-timing.json`: registered review record, 62 picture intervals,
  matched audio samples, unresolved intervals and findings.
- `verification.json`: confirms both film and editor hashes unchanged, crew
  receipt of the audit, zero paid crew runs and no approved timing manifest.

`scripts/blender/export_timeline.py` reads a project headlessly with automatic
script execution disabled and never saves it. `scripts/audit-existing-mark-2.py`
compares local media using FFmpeg and NumPy, without model calls. Register
the resulting audit with `scripts/import-cut-timing.ts`; ordinary complete
timing imports continue to use the existing strict source-coverage validator.

## Next production pass

Use the newer editor as the proposed basis for a **separate corrected cut**,
retaining both current files. Restore the five narration beds and the full
healing narration, resolve the crowd and Mark 2:19–22 source versions, and
fix the narration-block trim before rebuilding. Reconcile the two missing
clip links against their existing accepted attempts once the audio is verified.

The missing narration cannot simply be laid over the current cut: several
picture spans are too short, and it would overlap dialogue. Prepare the
necessary extensions/coverage changes explicitly while preserving the approved
opening and wordless celebration. Only after the corrected audiovisual cut
passes source timing checks should the Composer/Sound Designer trial proceed.

## Validation and Goal Guardian

All 206 Vitest tests and three Python waveform tests pass. Frontend build and
typecheck pass. The server still reports its 21 pre-existing type errors;
this unit introduces none. A production-database clone verified the import
before the additive production write; a read-only reread verified it afterward.

Separate Goal Guardian review: the result serves PRODUCT_VISION.md's faithful
chapter and USER_WORKFLOW.md's watch–correct–rerun flow. It extends existing
assembly/review and edit history, keeps original media intact, adds no
narrative, and does not turn uncertain evidence into approval. The missing
audio is a real production blocker, not resolved by passing software tests.
