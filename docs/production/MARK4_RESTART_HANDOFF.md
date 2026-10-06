# Mark 4 restart handoff

## Producer direction

Dan wants Mark 4 restarted as a reliable, fully automatable production path.
Do not reuse the existing Mark 4 final clips as approved footage: visual
identity drift made almost all of them unusable. Retain them as immutable
evidence and cost history; do not delete them.

The desired repeatable order is:

1. Optional approved opening/title material.
2. Establishing/anchor shots: boat, shore, light, and approved Hatam/Papuan
   identities.
3. Source-timed speaking coverage: plan exact audio beats first, create
   lip-sync close-ups early, and use masters/cutaways around long speech.
4. General action/reaction coverage.
5. Optional post-source transition toward the next chapter, explicitly
   labeled editorial rather than Scripture.

Dan wants dailies during generation: each clip separately, plus a rolling
scene/chapter reel as clips are accepted. Blender is not required for that;
a native web dailies view and server-rendered reel are preferred.

## Project and source status

- Project: Hatam Mark 4, id `8a5659a4-b033-4d5f-80e2-904b217cf8a0`.
- Source review is attested. The original recording is 517.864 seconds.
- All 96 original planned video clips were generated and assembled. The final
  video ledger total is about $73.25.
- The old editorial cut was held: 634.770 seconds of selected picture versus
  515.754 seconds target including planned breathing/pauses. The issue is
  overlong overlapping coverage, not missing source audio.
- No Mark 4 chapter render exists.
- All 96 current shots were planned as non-speaking; zero Kling lip-sync
  attempts were made. This is a planning failure, not a producer decision.

## What went wrong

Mark 3 succeeded through smaller, reviewed, shot-specific runs. Mark 4 used
an unattended batch and removed the controls that mattered:

1. Gemini blocked named real-person likeness/reference-sheet input for video.
   A workaround changed video requests to `characters: []`, relying only on
   the starting keyframe and role-based wording. The model then drifted from
   approved Papuan/Hatam identities toward Caucasian faces.
2. The final-video path did not run a mandatory identity/canon review before
   automatic timeline acceptance. Draft review was advisory only.
3. The fallback from Veo to Kling was not cost-aware. Kling motion renders
   were used as fallback footage, not as face lip-sync, despite higher cost.
4. The editorial timing plan treated too much overlapping coverage as full
   sequential footage.
5. The chapter opening and ending plans are metadata only; they are not
   materialized timeline beats and therefore cannot be generated or assembled.

## Changes already made

These local changes are present and typecheck passed after the final-video
gate change:

- `src/pipeline/media-generation/final-video.ts`
  - calls `reviewGeneratedVideo` for every final video;
  - records the review verdict and its cost;
  - final review explicitly treats Papuan/Hatam identity drift toward
    Caucasian/European/Levantine/generic identities as a failure.
- `src/pipeline/media-generation/index.ts`
  - auto-accepts a final candidate only when `reviewPassed` is true;
  - failed/uncertain candidates remain held.
- `src/pipeline/qc/video-review.ts`
  - final review prompt now makes identity, skin tone, face, hair, build, and
    canon wardrobe hard requirements across the clip.
- `src/pipeline/creative-direction/crew-context.ts`
  - editing/finishing brief hashes now exclude `spentUsd`, fixing a bug where
    an editing crew run invalidated itself by writing its own metered cost.
- `src/web/App.tsx` and `src/web/MediaLibrary.tsx`
  - lazy-load keyframes, defer media-library mounting until expanded, and use
    `preload="none"` for retained video cards. This repairs the Mark 4 page
    rendering failure caused by loading too many assets at once.
- `scripts/watch-media-generation.ts`
  - durable lock/log/backoff watchdog exists but has not been relied upon for
    the corrected restart yet.

## Required next work: do this before new paid video

1. Build the source-timed opening speaking map.
   - Use `audio_segments` on `original_reading` as the immutable timing source.
   - Select the opening shoreline/boat shots as anchors.
   - Mark the first Jesus close-up as `needs_lip_sync=1` and bind its exact
     source interval using `shot_utterance_bindings`.
   - Create `coverage_beats` for the surrounding master/cutaway beats. Do not
     invent a separate timing model.
2. Materialize approved intro and ending proposals as first-class editorial
   beats with their own media, QC, duration, and timeline placement. They
   must remain visibly labeled pre-source/post-source editorial material.
3. Add a dedicated dailies view and rolling reel.
   - For each candidate, show the video plus sampled frames (start, quarter,
     middle, three-quarter, end), the approved keyframe, model/provider/cost,
     critic verdict, and timeline position.
   - The scene reel should include only accepted clips, regenerate after each
     accepted clip, and preserve source audio where it exists.
4. Make cost policy explicit.
   - Do not use Kling fallback for ordinary non-speaking coverage by default.
   - Reserve Kling face/lip-sync for source-timed speaker inserts or an
     explicit high-risk exception.
   - Record every fallback reason in the cost/dailies view.
5. Regenerate only a small pilot set first: opening/title, shore/boat anchor,
   one Jesus speaker close-up, and a nearby cutaway. Review the dailies and
   mini-reel before any chapter-wide batch.
6. Fix editorial timing allocation: coverage clips must share their assigned
   narration span rather than each consuming its generated duration. Protect
   intentional emotional breathing beats before trimming routine coverage.

## Useful locations

- Raw final videos: `C:\Users\danbr\HeartWordData\assets\generated\video`
- Raw draft videos: `C:\Users\danbr\HeartWordData\assets\generated\drafts`
- Normalized shot assets: `C:\Users\danbr\HeartWordData\assets\generated\assembled`
- Keyframes: `C:\Users\danbr\HeartWordData\assets\generated\keyframes`

## Product guardrails

- Do not present the existing 96 Mark 4 clips as accepted production footage.
- Do not delete paid attempts or rewrite their provenance.
- Do not generate a chapter-wide replacement batch until the small pilot has
  passed the new final-video identity gate and is visible in dailies.
- Do not create visible speech without an exact source interval and approved
  speaker/character binding.
- Keep narration source-locked. Breathing/emotional pauses are protected
  within the source-timed editorial plan; they are not permission to make the
  picture exceed the source duration by minutes.
