# Meyah Mark 4 delivery — 27 October 2026

## Delivered artifacts

- Distribution film: `output/Markus-4-Meyah.mp4` (453,741,010 bytes; SHA-256 `4c4d34b6b6c8665a042291a1bba2ab5a55dad9e931d970d93c8d15a3e0af4538`).
- Accepted isolated render: `output/mark4-donor-20261024/assets/generated/chapter/a5a40890-8bb0-4856-aacb-1dcad97074bb/73d077c4-6614-412e-81ff-01d6e7426b54.mp4` (same SHA-256).
- Portable editable project: `output/meyah-mark4-package-20261027/` (verified manifest: 2,165 files, zero missing or corrupt dependencies, zero editability issues).
- Isolated live editing data: `output/mark4-donor-20261024/`; project ID `a5a40890-8bb0-4856-aacb-1dcad97074bb`.

The film is 809.685 seconds, 1280×720 at 24 fps, H.264/AAC. It contains 145 target shots plus the four-second approved lake title reading `MARKUS 4` and `MEYAH`. The new target media comprise 35 approved keyframes, 35 local LTX silent clips and 29 Kling Avatar speaking clips. Existing final Hatam picture is retained where it supports the Meyah story, including the opening and closing mood footage. The original Meyah recording supplies narration and the group question at 4:41; the reviewed Jesus and Peter passages use their approved mapped voices.

## QC and editability

The approved picture editor run is `59458683-5ddb-4834-a5d0-1d547e518e94`. The soundtrack/color finishing run is `5c6a7004-691b-46d6-ba98-e1f6633ba6bb`. The exact repaired final film was reviewed in finishing run `cfd98c9f-b45f-443d-9cb5-8331bfc83e32`, which approved its first pass. The corrected render carries the same approved audio stream SHA-256 (`459bebc020f09d11f2b011a5619e14c7142d1e76ce320b2d6157da12f9791eb3`) as the prior mixed render.

One real single-frame picture mismatch was found at 257.708 seconds after the initial mix. The last frame of the disciples' retained source clip switched to a Jesus wide angle. The isolated correction repeats the prior disciples frame once in the accepted shot clip and finished film. It changes no source word, audio packet, shot order or duration. The append-only correction and pre-change SQLite backup are recorded in `output/mark4-donor-20261024/review/meyah-mark4-one-frame-flash-correction-20261027.json`. The earlier approved 4:41 reaction trim is recorded in `output/mark4-donor-20261024/review/meyah-mark4-shot144-clip-handle-correction-20261027.json`. Both receipts are in the exported package. The full corrected picture scan examined 23 short-cut candidates and held none. SQLite `quick_check` returned `ok`.

The package export and verify manifests are at `output/mark4-donor-20261024/review/meyah-mark4-package-export-20261027.json` and `output/mark4-donor-20261024/review/meyah-mark4-package-verify-20261027.json`. The recovered pipeline ledger validated all seven existing stages through QC without calling a media provider. Its status field remains `in_progress` under the existing orchestrator convention, while the QC stage execution itself is completed. The original and superseded media and review history remain in the package. The convenience distribution MP4 is byte-identical to the accepted render.

Code checks: 906 tests passed in 130 files; server and web TypeScript checks passed. The first full run overlapped an active encode and a new script write, causing timing failures and a package snapshot race; the stable final run passed in full. The live `C:\Users\danbr\HeartWordData` database and Mark 5 Prep were not changed.

## Goal Guardian review

`docs/PRODUCT_VISION.md` calls for an autonomous, source-faithful, editable chapter film from heart-language audio and approved regional canon. The delivered cut preserves the reviewed Meyah source performance and exact speaker boundaries, has a saved timeline and source map, and retains every accepted or superseded asset for review and correction. It adds no Scripture words, inferred dialogue, translation or unsupported scene action. The approved Papuan cast, voice identities, title and mood footage follow Dan's named decisions. `docs/USER_WORKFLOW.md` calls for stage visibility, a producer-viewable chapter and retained edit history; the seven-stage ledger, accepted render, review records and verified portable package provide those. The work stayed inside the isolated worktree and data root. No extra pipeline stage or product feature was introduced.
