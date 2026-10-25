# Meyah Mark 4 source and cast binding proposal

Status: **applied to the isolated Meyah project on Dan's explicit approval**.
The proposal below is retained as the decision basis. The resulting 54-row
speaker map, with seven scenes and zero target shots, received Dan's named
approval **for shot planning** in isolated source review
`4a80c28d-7904-45a0-8a55-5f1ec92c7ba7`. The earlier 40-row verse
map remains in the source-review history.

Applied binding ID: `6fbea6d4-b75e-43c5-bc09-b80921c7078a`.
Previous alignment SHA256: `97cac1b52db6f9cd16018d4aebdae6e142f6f91a0f7ce8a7c76a4d8c329929b8`.
Current alignment SHA256: `24d60b4109f480a8ea3d11e9d7c554e59c21df694a16e389d9697aac48baf6c7`.
The [graphical speaker-map reviewer](http://127.0.0.1:4002/media/review/meyah-mark4-speech-binding-20261025/index.html)
plays each of the 54 original-audio rows. The original source hash is unchanged.
The isolated backup, dry-run and applied receipts are retained under
`output/mark4-donor-20261024/review/`.

All times below are seconds on the immutable Meyah chapter recording. The
review IDs are the current verified speech-window revisions. The source hash
is `7947e9038f1cc0e74df68d934b0dbeba271a2ea27481165021ae207b2751b2c6`;
the saved speech manifest hash is
`f0e917304d3ed9d7c8076a7f7d50a2b14cbfa6e9ad9ce5c97b3f8cf3b3b7eed7`.
The [speech reviewer](http://127.0.0.1:4002/api/projects/a5a40890-8bb0-4856-aacb-1dcad97074bb/source-listening-review?scope=speech)
plays each exact window with waveform and context.

| Passage | Exact window | Review ID | Proposed performance |
| --- | --- | --- | --- |
| 4:3–8 | 36.603–133.783 | `f39f8cce-03e9-4be2-a34a-79ff85f4c9f5` | Jesus, approved mapped voice |
| 4:9 | 142.703–152.394 | `9f8d8a54-b2c4-4f11-b1a1-dcdc5107ecae` | Jesus, approved mapped voice; narrator lead-in outside |
| 4:11–12 | 178.666–238.458 | `2d335bfb-8dee-4cd6-a1e7-eb5bb2243f44` | Jesus, approved mapped voice; narrator lead-in outside |
| 4:13–20 | 242.628–403.046 | `f70c020b-030b-4834-9b96-22e5865cf401` | Jesus, approved mapped voice |
| 4:21–23 | 408.336–461.883 | `0ba0dd44-a40c-4c8c-ba2b-f12b11307668` | Jesus, approved mapped voice |
| 4:24–25 | 461.883–515.561 | `8f75d275-5c14-4361-a5c7-bb2f9b1361ee` | Jesus, same continuous performance as 4:21–23 |
| 4:26–29 | 519.191–598.861 | `0a93da81-98c3-4f15-b77d-5f7bbcd58b26` | Jesus, approved mapped voice |
| 4:30–32 | 604.801–641.508 | `18aa7b27-2d80-4590-91a4-8a0cc3c563f9` | Jesus, approved mapped voice |
| 4:35 | 681.342–684.191 | `1dc9f2b9-f481-4dfb-8e73-3a4b707801c8` | Jesus, approved mapped voice; 672.893–681.342 narrator lead-in outside |
| 4:38 | 746.695–754.976 | `c65ecd61-2a15-43cb-a029-cd136ccac898` | Peter's approved mapped voice for the visible speaking shot, as Dan directed. His approved version-3 keyframe has the wet, frightened close-up and eyeline toward sleeping Jesus; a Kling Avatar take is still pending. |
| 4:39 | 755.519–775.486 | `00d42481-87a7-4f37-a3fd-9dc60bc1e6f5` | Original Meyah narration describing Jesus' action; no Jesus speech or Avatar |
| 4:40 | 780.426–788.136 | `df35636a-970a-48af-97ef-4e8fb72556c8` | Jesus, approved mapped voice |
| 4:41 | 796.354–803.616 | `ea496271-a680-4e82-82f5-e89ae53231c6` | Original Meyah disciples' performance over non-speaking picture, as Dan directed; no Peter conversion or Avatar |

The approved Jesus character ID is
`b78bed54-1d53-4b9f-9070-549dddb71b19`; Peter's approved character ID is
`9cbc4222-b194-4db4-baa9-2ba7083e31f3`. The speech manifest has no
character IDs, so these identities must be explicitly bound from the pinned
Papuan donor cast and Dan's 4:38 decision. A displayed speaker name alone
cannot authorize a database attribution.

The application split only original-reading rows at exact
character-window edges, retained their full audio coverage and approximate
verse labels, and appended named continuous-speech/cast evidence. It kept
the source chapter heading, narration, 4:39 narrated action and 4:41 group
question in the original Meyah performance. The seven target scenes remain.
This changed the alignment/speaker hash, so the earlier scene-planning source
attestation remains historical; the resulting exact map has its own named
producer review for target-shot planning. A separate reviewed shot
correspondence and voice audition are still required. The
existing `applyListeningReview` cannot perform this specific transition: it
requires the whole verse-review set, forbids previously reconciled rows, and
forbids downstream scenes. `applySourceSpeechBinding` extends ingestion for
this approved edition case, with an isolated backup and tests. The live
database was not changed.
