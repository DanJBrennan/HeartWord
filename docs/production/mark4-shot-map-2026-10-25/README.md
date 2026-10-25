# First final Mark 4 shot map — 2026-10-25

Status: **draft for producer review**. The final `Markus-4.mp4` has not been
normalized, and this review has made no database or provider changes.

## Reviewable result

- [First shot map](first-shot-map-DRAFT.tsv): 113 ordered placements covering
  every frame 0–13,483 exactly once, split at each of the five verified silent
  chunk boundaries. It identifies 86 existing Mark 4 donor shots; six intervals
  await dedicated legacy editorial shot records in the isolated copy.
- [Summary](first-shot-map-summary.json): 8,339 frames link directly from a
  saved picture source to one shot; 2,604 match retained source video visually;
  260 match later saved mustard-seed/tree attempts; 588 trace to a saved patch
  predecessor; 192 match a saved keyframe; 358 have a reviewed narrative/visual
  association. Six intervals totaling 1,143 frames (47.6 seconds) require
  dedicated legacy imports.
- [Legacy contact sheet](producer-decision-contact.jpg): representative
  frames of those six intervals. Five set the opening/closing mood; one is a
  Mark 3-origin listener shot reused within the final Mark 4 cut.
- [Canonical speaking gaps](canonical-speaking-gaps.tsv): 15 selected Jesus
  performance shots that have saved video attempts and exact v45 source windows
  but lack accepted `generate` keyframes and `shot_utterance_bindings` rows.
  Several windows cross old audio-segment boundaries. The table proposes the
  historically pinned Jesus voice version, using existing Jesus bindings as
  evidence; it does not record new approval.

The map comes from the retained v39–v73 edit manifests and patch scripts,
generation-attempt-to-shot links, exact saved keyframes, source-video comparison
and visual review of the final picture. The comparison was a search aid, not
an authority by itself. For example, the mustard-seed hand and mature plant
were found in later `hold_for_review` attempts tied to the correct donor shots;
their historical statuses remain unchanged. The storm and speaking replacements
were associated with saved predecessor ranges and checked against the chapter
sequence. Dan's statement that this MP4 is the final Hatam output identifies
the final cut, while individual older `heldForReview` flags remain historical.

## Six exact-picture legacy imports

Dan directed that the opening and closing mood footage remain exactly as it is,
with only the title lettering changed from Hatam to Meyah. These five picture
intervals will become distinct editable legacy beats in the isolated donor;
they will not be attached to merely similar story shots. The Mark 3-origin
listener interval also needs an explicit Mark 4 legacy beat because its source
attempt belongs to a different project. Its source provenance must remain
visible for Meyah editorial review.

| Final frames | Final time | Picture | Import treatment |
| --- | --- | --- | --- |
| 0–179 | 0:00–0:07.5 | Title, then clean lake | Dedicated opening beat; target title renderer changes only lettering. |
| 180–347 | 0:07.5–0:14.5 | Empty boat at shore | Dedicated mood beat, exact picture. |
| 348–440 | 0:14.5–0:18.4 | Crowd sees Jesus in boat | Dedicated opening beat, exact editorial still move. |
| 775–1024 | 0:32.3–0:42.7 | Second move on same crowd/boat still | Dedicated opening beat, exact editorial still move. |
| 7,759–7,826 | 5:23.3–5:26.1 | Silent listeners | Dedicated Mark 4 beat carrying the exact Mark 3-origin clip and its cross-chapter provenance. |
| 13,100–13,483 | 9:05.8–9:21.8 | Night-sea pullout | Dedicated ending beat, exact picture. |

The draft leaves the six new shot IDs blank. No plan JSON bearing a producer
name has been created or submitted.

## Remaining import checks

1. Create six dedicated legacy editorial shots only in the isolated donor copy,
   with frame-derived keyframes, exact picture intervals, cross-chapter source
   provenance where applicable, and Scripture-grounded scene placement. Keep
   the five mood intervals unchanged in the Meyah edition except title text.
2. The 15 canonical Jesus performance shots need accepted historical keyframes
   extracted from their exact final-picture intervals, plus reviewed source
   bindings from the v45 manifest. Do not silently accept old held attempts or
   invent approval. Verify each source window, especially the ones crossing two
   retained audio segments, against the original recording.
3. Copy the other 71 selected accepted keyframes into the isolated root with
   hash checks. The final film and five silent chunks are already there.
4. Re-run read-only preflight, then the fixed-root normalizer on a complete,
   named reviewed map only. Confirm preserved original recipe, exact frame
   coverage, selected clip lineage, speaking voice evidence and a fresh-root
   editable restore before creating the Meyah edition.

The live HeartWord database, Mark 5 production, original Mark 4 media and
ElevenLabs/Kling providers were not touched by this review.
