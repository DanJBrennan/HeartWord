# First final Mark 4 shot map — 2026-10-25

Status: **draft for producer review**. The final `Markus-4.mp4` has not been
normalized, and this review has made no database or provider changes.

## Reviewable result

- [First shot map](first-shot-map-DRAFT.tsv): 114 ordered placements covering
  every frame 0–13,483 exactly once, split at each of the five verified silent
  chunk boundaries. It identifies 84 existing Mark 4 donor shots; 14 intervals
  await dedicated legacy shot records in the isolated copy. The first 96 frames
  are an explicitly replaceable title card, not a reusable story shot.
- [Summary](first-shot-map-summary.json): 7,407 frames link directly from a
  saved picture source to a shot in the correct narrative scene; 2,522 match
  retained source video visually;
  260 match later saved mustard-seed/tree attempts; 588 trace to a saved patch
  predecessor; 192 match a saved keyframe; 358 have a reviewed narrative/visual
  association. Fourteen intervals totaling 2,061 frames (85.9 seconds) require
  dedicated legacy imports; 96 title frames (4 seconds) are replaced in place.
- [Legacy contact sheet](producer-decision-contact.jpg): representative
  frames of the opening/closing mood and a Mark 3-origin listener shot reused
  within the final Mark 4 cut.
- [Cross-scene contact sheet](cross-scene-review.jpg): eight final-cut picture
  intervals whose source clips were saved under different Mark 4 scenes. Their
  picture remains exact, but their target shot records need the correct scene.
- [Canonical speaking gaps](canonical-speaking-gaps.tsv): 15 selected Jesus
  performance shots that have saved video attempts and exact v45 source windows
  but lack accepted `generate` attempts and `shot_utterance_bindings` rows.
  Several windows cross old audio-segment boundaries. The table proposes the
  historically pinned Jesus voice version, using existing Jesus bindings as
  evidence; it does not record new approval.
- [Original speaking keyframes](original-speaking-keyframes.jpg): the fifteen
  original keyframes named by the retained v34 performance manifest. The
  isolated database contains Dan's note approving them for **held motion and
  lip-sync review only**, with no chapter-placement authority. The manifest
  pins their shot IDs and exact Hatam audio windows. Those images, windows and
  manifest have been copied to the isolated root with SHA-256 checks. This is
  stronger historical evidence than extracting new stills from the final film,
  but it does not silently promote the old approval scope.
- [Historical keyframe evidence](historical-speaking-keyframes.tsv): exact shot,
  original keyframe and cast-audio paths/hashes, plus the retained producer
  note ID and its limited approval scope for all fifteen beats.
- Seventy retained assets (69 selected accepted donor keyframes and the clean
  lake title still) were copied byte-for-byte from the live asset directory
  into the ignored isolated root. Their SHA-256 values and copy status are in
  the isolated `review/copied-keyframes-manifest.json`. The copy now also
  contains the fifteen original speaking keyframes, fifteen exact cast-audio
  excerpts and their saved manifest (101 files total). The live database and
  files were read only.

The map comes from the retained v39–v73 edit manifests and patch scripts,
generation-attempt-to-shot links, exact saved keyframes, source-video comparison
and visual review of the final picture. The comparison was a search aid, not
an authority by itself. For example, the mustard-seed hand and mature plant
were found in later `hold_for_review` attempts tied to the correct donor shots;
their historical statuses remain unchanged. The storm and speaking replacements
were associated with saved predecessor ranges and checked against the chapter
sequence. Visual review also caught eight source links that are factually real
yet refer to the wrong narrative scene for their final-cut location. Dan's
statement that this MP4 is the final Hatam output identifies
the final cut, while individual older `heldForReview` flags remain historical.

## Title and five opening/closing mood intervals

Dan directed that the opening and closing mood footage remain exactly as it is,
with only the title lettering changed from Hatam to Meyah. The 0–95 Hatam title
frames are marked `replaceable_title`: the target's reviewed four-second
`Markus 4` / `Meyah` card takes their place, using the retained clean lake
still. The rest of the lake clip and four other opening/closing mood intervals
become distinct editable legacy beats with their final-cut picture preserved.
They will not be attached to merely similar story shots. The title tag prevents
the old Hatam lettering from appearing after the new title.

| Final frames | Final time | Picture | Import treatment |
| --- | --- | --- | --- |
| 0–95 | 0:00–0:04.0 | Hatam title over lake | Provenance only; replace in place with reviewed Meyah title. |
| 96–179 | 0:04.0–0:07.5 | Clean moving lake | Dedicated opening beat, exact picture. |
| 180–347 | 0:07.5–0:14.5 | Empty boat at shore | Dedicated mood beat, exact picture. |
| 348–440 | 0:14.5–0:18.4 | Crowd sees Jesus in boat | Dedicated opening beat, exact editorial still move. |
| 775–1024 | 0:32.3–0:42.7 | Second move on same crowd/boat still | Dedicated opening beat, exact editorial still move. |
| 13,100–13,483 | 9:05.8–9:21.8 | Night-sea pullout | Dedicated ending beat, exact picture. |

The Mark 3-origin listener interval at frames 7,759–7,826 needs an explicit
Mark 4 beat because its source attempt belongs to another project. Preserve
its exact picture and cross-chapter provenance for Meyah editorial review.

## Eight cross-scene picture reuses

These source clips were deliberately used in the final Mark 4 cut outside the
scene named by their saved shot records. The target cannot clone those records
as-is: scene inheritance and later editing would attribute their action and
verse to the wrong passage. The map therefore proposes a new legacy shot in
the final-cut scene for each interval, retaining the exact picture and original
take path.

| Final frames | Target scene | Final-cut picture |
| --- | --- | --- |
| 588–774 | 1, Mark 4:1–2 | Jesus addresses the shore crowd from the boat. |
| 2,385–2,550 | 1, Mark 4:8 | Seedlings in fruitful soil. |
| 2,827–3,017 | 1, Mark 4:9 | Jesus closes the sower teaching. |
| 3,964–4,023 | 2, Mark 4:10–12 | Disciples listen in the private exchange. |
| 5,924–6,023 | 3, Mark 4:14–20 | Two disciples listen during the explanation. |
| 9,240–9,321 | 6, Mark 4:30–32 | Crowd listener in the mustard-seed scene. |
| 10,146–10,245 | 6, Mark 4:33–34 | Disciples listen after the parable. |
| 10,246–10,373 | 6, Mark 4:33–34 | Disciples listen before the private explanation. |

The draft leaves the fourteen new shot IDs blank. No plan JSON bearing a producer
name has been created or submitted.

## Remaining import checks

1. Review the 114-placement map and the two contact sheets. Create fourteen
   dedicated legacy editorial shots only in the isolated donor copy, with
   frame-derived keyframes, exact picture intervals, original-source provenance
   and Scripture-grounded scene placement. Keep the five mood intervals
   unchanged in the Meyah edition except title text.
2. The 15 canonical Jesus performance shots have original, historically
   producer-approved **review inputs** and exact source windows, but still need
   a scoped decision on how to represent that evidence as donor keyframe
   attempts for an editable edition. Do not silently turn the held-review note
   into chapter-placement approval or invent utterance bindings. Verify each
   source window, especially those crossing two retained audio segments,
   against the original recording before any new binding is recorded.
3. Re-run read-only preflight, then the fixed-root normalizer on a complete,
   named reviewed map only. Confirm preserved original recipe, exact frame
   coverage, selected clip lineage, speaking voice evidence and a fresh-root
   editable restore before creating the Meyah edition.

The live HeartWord database, Mark 5 production, original Mark 4 media and
ElevenLabs/Kling providers were not touched by this review.
