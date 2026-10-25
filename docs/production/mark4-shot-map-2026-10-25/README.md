# First final Mark 4 shot map — 2026-10-25

Status: **approved and normalized in the isolated donor copy**. Dan approved
the 114-placement map as drafted and selected the original v34 speaking
keyframes on 2026-10-25. The live database and Mark 5 production remain
untouched.

## Reviewable result

- [Approved final picture plan](approved-final-picture-plan.json) and its
  [review TSV](first-shot-map-DRAFT.tsv): 114 ordered placements covering
  every frame 0–13,483 exactly once, split at each of the five verified silent
  chunk boundaries. It identifies 84 existing Mark 4 donor shots; 14 intervals
  became dedicated legacy shot records in the isolated copy. The first 96 frames
  are an explicitly replaceable title card, not a reusable story shot.
- [Meyah title preview](markus4-meyah-title-preview.mp4)
  ([still](markus4-meyah-title-preview.jpg)): `Markus 4` in large type and
  `Meyah` below, rendered locally from the retained clean lake still. The clip
  is video-only, exactly 96 frames at 24 fps. It is a review candidate; no
  target editorial selection has been recorded.
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
  and Dan's newer donor-reference decision is recorded separately. The old
  approval scope was not rewritten.
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

The review TSV retains blank provisional IDs as the historical review input.
The [approved import specification](approved-legacy-imports.json) records the
fourteen scene-correct aliases; the approved plan contains their stable IDs.

## Isolated preparation result and remaining review

1. `scripts/prepare-mark4-final-donor.py --apply` added the fourteen dedicated
   scene-correct beats and accepted reference-keyframe attempts for them and the
   fifteen original v34 performance frames. The original rows and limited
   historical keyframe approval remain intact. No donor utterance binding was
   fabricated. The isolated database backup is at
   `output/mark4-donor-20261024/review/heartword.before-final-map-preparation.sqlite`.
2. `scripts/normalize-mark4-final-donor.ts` applied the approved plan to the
   isolated render. Its 114-placement timeline SHA-256 is
   `42c8c09c9c447d57b9980a4aad0e9aba18ae4e5648bde3269202c924d500a912`.
   The old custom recipe remains in the normalization edit command. Exact
   opening and closing picture intervals remain represented separately; the
   Hatam-lettered title is replaceable provenance only.
3. The supplied Meyah Mark 4 DOCX matches HeartWord's managed source byte for
   byte. The target recording, text, English reference, approved visual
   references and cast masters were copied into the isolated root with SHA-256
   checks. Real preflight reports `ready`, with 113 pinned story picture
   placements and two approved Papuan voice identities. It records the absent
   historical ElevenLabs request settings as unknown. The isolated Meyah
   project is `a5a40890-8bb0-4856-aacb-1dcad97074bb`; it has no completed
   stages or provider work.
4. Review Meyah source alignment and the reference-only entries `6 (4:5)` and
   `19 (4:18)`, then record exact target speech windows and source-grounded
   coverage changes. A short reviewed target voice audition establishes current
   settings before bulk conversion. The four-second title preview still needs
   normal target editorial selection. The later target film needs new Avatar
   takes, whole-film QC and a fresh-root editable restore.

No ElevenLabs or Kling provider request was made during donor normalization or
target project creation.
