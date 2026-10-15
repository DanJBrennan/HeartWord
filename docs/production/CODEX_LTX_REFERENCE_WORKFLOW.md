# Built-in keyframes and local LTX reference workflow

Producer direction: October 14, 2026. This extends existing media preparation,
crew handoffs, retained attempts/reviews and producer controls. It serves the
autonomous faithful editable chapter and its ordinary watch/correct/selective
rerun workflow. It adds no pipeline stage, worker or second production state.

## Verified capability and cost boundaries

The current assistant image tool explicitly permits **five recent conversation
images** (`num_last_images_to_include: 1..5`). Its local
`referenced_image_paths` array declares no maximum. Therefore five is a supported
working packet size, **not a verified universal maximum for file inputs**.
Public [OpenAI image documentation](https://learn.chatgpt.com/docs/image-generation)
confirms built-in image generation consumes included Codex usage. It does not
establish this session's numeric reference limit or report per-call consumption.
Do not substitute a paid image API or claim the quota decrement is negligible.
Included usage and unreported money stay distinct in provenance; legacy numeric
zero compatibility fields are not an invoice or remaining film budget.

The [LTX image-to-video guide](https://docs.ltx.io/open-source-model/usage-guides/image-to-video)
confirms image + prose, synchronized native audio and first/last-frame guidance.
The installed Mac backend was inspected directly at
`/Applications/LTX Desktop.app/Contents/Resources/backend/handlers/video_generation_handler.py`:
`imagePath` conditions frame 0, `lastImagePath` conditions `num_frames - 1`, and
`keyframes` are timed image anchors. Its `api_types.py` sets
`LOCAL_MULTI_KEYFRAME_MAX_COUNT = 10`. These are temporal pictures, **not ten
free-form identity/reference slots**. HeartWord now exposes first/last images;
arbitrary timed-anchor orchestration remains outside this bounded implementation.
Installed model filenames confirm LTX 2.5 distilled transformer/audio/video VAE;
authenticated health reports Fast on M4 Pro MPS. The live settings inspection
found `user_prefers_ltx_api_video_generations: false`.

Local video inference has no per-call API charge. All paid planning, reviews,
generation, rejected attempts, retries and outstanding liabilities still count
toward the cumulative $200 film ceiling. An assistant-operated image handoff is
not a Node image API, and no automatic paid fallback is added. Veo and Kling
remain explicitly selectable scene-video alternatives; Kling Avatar remains the
speech-performance provider.

## Build the reference packet

Use `scripts/keyframes.ts prepare` or `scripts/coverage-keyframes.ts prepare`
against the existing chapter database. Inspect the actual source, scoped visible
cast, approved versions/story-state assets, producer decisions and review notes.
The shared packet builder:

1. Uses body references for scene cast and head/body likeness for speaking work.
   Proof-only and out-of-range story-state assets are excluded. It never creates
   new character designs to save slots.
2. Keeps Jesus's approved head/body views on his own image. Other identities are
   grouped four people per board, with an explicit row-major cell legend.
3. Keeps set views in a separate board. Jesus plus twelve disciples plus a set
   therefore uses five inputs: Jesus, disciples 1–4, 5–8, 9–12, and set views.
   Board cells preserve whole source images with letterboxing; originals, hashes
   and individual version identities remain retained. More than five groups
   holds preparation instead of silently dropping people or mixing Jesus.
4. Retrieves two earlier accepted views of the same scene and target-reviewed
   standalone location references from the existing media library. A prior shot
   is continuity evidence, never automatically reusable building canon. Search
   the library by location and inspect actual provenance/approval records when
   determining whether a building already has canon/reconstruction authority.
   A location label or an attractive image cannot establish that authority.
5. Hash-pins the existing accepted FDL scene snapshot and Bible/regional extension
   in `filmInput`. Existing accepted local shot/state facts reach the prompt via
   reconciled direction; approved world facts, explicit unknowns and source /
   regional / historical grounding now accompany them. Proposed world facts
   remain labelled proposals, never instructions to assume geometry. Import
   compares the actual current snapshot, source, cast, set and board hashes.

Inspect every final board at readable size. The supplied prompt maps each input
and cell to its exact identity/role. References are guidance rather than a
collage to reproduce; set images never supply people, poses or camera framing.
The packet uses saved shot cast; it does not infer a smaller visible cast from
ambiguous prose. Plan appropriate measured coverage or correct saved casting
when a crowded reference packet cannot communicate identities clearly.

For local file inputs, view each image before editing and pass all packet paths
through `referenced_image_paths`; do not also set the recent-image count. For
conversation inputs, use the smallest recent-image count covering every target,
up to five. Built-in generation occurs in the authorized assistant session.
Import its original PNG as the existing held candidate and run applicable normal
review. Applicable passing reviews allow production to continue without a new
chapter-plan signature. No accepted existing take is regenerated by this change.

## Blender view preparation

The assistant can operate the snapshot helper for the Shot Planner, using Leon's
camera intent and Arlo's set evidence. Pippa remains a declared application role;
this does not activate an independent runtime worker or grant model replies
arbitrary shell execution. The executable cinematography guidance describes the
tool and its required facts.

Create a small spec from actual retained set evidence and accepted camera intent:

```json
{
  "sourcePath": "sets/example/version-1.blend",
  "sourceSha256": "<actual SHA-256 of retained model>",
  "sourceRecordRef": "<actual immutable source/version record>",
  "reason": "Show the accepted interior from the planned reverse angle",
  "camera": {
    "positionM": [0, -6, 1.6],
    "targetM": [0, 0, 1.2],
    "lensMm": 35,
    "sensorWidthMm": 36,
    "metersPerBlenderUnit": 1
  }
}
```

The numbers above are illustrative planned settings, not inferred real geometry.
Unknown scale/model/approval needs evidence before a production reference is
used. Position/target are right-handed set-world metres with Z up. The helper
records Blender's actual camera matrix, version, model/output hashes and linked
dependencies. It preserves existing set geometry, lighting and source bytes.

```powershell
npx tsx scripts/set-snapshot.ts <shot-id> <spec.json>
```

This checks the existing accepted planning revision before and after rendering,
runs Blender with autoexec disabled and explicit Python failure exit codes, and
writes a unique 1280x720 candidate plus provenance. It never saves the `.blend`.
Do not treat the sourceRecordRef string as approval: it is a locator for review.
The helper does not construct missing buildings or approve hidden geometry.

Register the retained view via the existing `/api/projects/media-library/standalone`
control (see actual route in `projects.ts`), preserving its snapshot provenance;
create its target-shot reuse candidate using the existing
`POST /api/projects/:id/shots/:shotId/reuse-candidates`. The new scoped producer
review extends that same record:

```text
PATCH /api/projects/:id/shots/:shotId/reuse-candidates/:candidateId
{"decision":"approved_for_generation","note":"Actual target-set review evidence"}
```

`dismissed` withdraws use while retaining history. Each decision saves a typed
edit and human review note, checks target/language/region/hash and grants only
set-reference use. It cannot approve new reusable building canon, actor identity,
timeline selection or release. Repeated identical current review is idempotent;
withdrawal/reapproval retains every decision. A future automatic specialist
approval must use actual saved review evidence; this patch does not impersonate
Vera/Orion/Dottie or invent such a review.

## LTX and Avatar inputs

Following the [official prompting guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide),
write one focused chronological audiovisual paragraph: shot scale and camera,
ordered physical action, stable identities/set/light, then audible environmental
events. Use accepted FDL facts to resolve the meaning before writing prose;
LTX does not parse HeartWord FDL or enforce its numeric geometry natively.
Do not copy an image-generator prompt or arbitrary vendor tags verbatim.

K1 is a fully composed starting picture. Optional K2 is a fully composed ending
picture, generated with the same canon packet and reviewed local final state.
Do not put disciples, building views or a contact sheet in K2: LTX would try to
end the clip on that sheet. Identity/set information is already expressed in
the composed anchors and accepted prose. Verify the actual ending rather than
claiming perfect endpoint reproduction from a successful API call.

`VideoGenerationOptions.endFrame` uploads a second unique image and maps it to
`lastImagePath`. Both uploads/hashes are retained, freshness is rechecked after
transfer, and the existing pre-submission gate still runs. Definitive outcomes
clean both inputs; uncertain submissions retain both and the owned lease.
Veo/Kling adapters reject unsupported ending-frame requests before spending.

```powershell
npm run ltx:test -- --image <K1.png> --end-image <K2.png> --prompt <prose> --duration 5 --resolution 720p
```

The ordinary diagnostic retains its existing metered listening-review behavior;
the standalone pony proof generates through the adapter directly and records its
subsequent metered listening checks separately (see live proof below).
Native environmental sound/appropriate animal calls are allowed. Generated human
speech is prohibited. Production ambience still needs its separate listening
review before admission; raw provider audio never replaces source/cast speech.
The Desktop 720p preset previously returned 1280x704 / 121 frames at 24 fps;
report measured output, preserving the original if a separate exact 720p/5s
delivery copy is needed.

Kling Avatar accepts one composed image and exact source-timed cast audio.
Prefer approved headshot likeness in a contextual head-and-shoulders view and
Jesus facing/near the camera. Other reasonable distances/angles remain allowed;
this is a preference, not a hard frontal-only gate or permission to override
accepted blocking. No source words or speech speed change.

## Verification and remaining limits

Tests cover thirteen identities/five slots, real uncropped FFmpeg boards,
story-state exclusions, actual FDL pin/use/import, set-review history and guarded
selection, first/last upload/failure/cleanup, cloud refusal, changed bytes and
stale-revision submission. A real Blender test renders a pinned model with
35mm/36mm camera evidence and proves unchanged source/overwrite refusal.
These are synthetic fixtures, not Scripture/film-quality approval.

Final engineering validation: **666 tests / 105 files pass**; TypeScript checks,
web build and diff checks pass. Log: `outputs/keyframe-ltx-tests.txt`. The
production database SHA-256 and all 87 pre-existing chapter-render inventory
entries match baseline (`outputs/keyframe-ltx-preservation-final.json`). No
production migration, accepted-take regeneration or timeline edit ran.

## Separate Goal Guardian review

After implementation, a dedicated pass compared the result with PRODUCT_VISION's
autonomous faithful editable film, CURRENT_GOAL's shared crew/state and existing
Mark 4 holds, and USER_WORKFLOW's chapter selection/watch/correct/selective rerun.
This was a separate review step, not an additional crew/model approval call.

| Criterion | Result and limit |
| --- | --- |
| Single concern and existing stages | Pass: reference preparation, supported LTX inputs and Avatar framing guidance extend existing provider/handoff/review/edit paths. No new stage, queue, canon registry, notification subsystem or unrelated tickets. |
| Shared saved authority | Pass: current accepted production records and producer decisions still control both handoffs and submissions. The review found and fixed post-import set withdrawal/changed-file acceptance, including coverage candidates. Prior accepted takes remain retained. |
| Source/canon/performance | Pass for implementation: no Scripture/audio/voice/speed edit; source, identity/state and set roles remain distinct. Snapshot rendering cannot approve new architecture, move approved blocking or infer hidden geometry. Production DB/render inventory preserved. |
| Useful structured intent | Pass for the bounded qualitative subset: actual accepted snapshots/Bible-regional context are hash-pinned, supplied and checked. Numeric geometry/motion compilation remains unimplemented; the Blender camera provenance is actual renderer intent, not inferred canon. |
| Producer workflow | Pass: existing chapter controls/candidate review and selective rerun remain; no routine chapter-plan signature. Existing chapter handoff scope limits remain explicit. Pippa/Mabel are not falsely labelled live workers. |
| Costs and notifications | No paid image/video substitution. Included image/assistant usage attribution is unreported; all existing $200/outstanding-cost and release gates remain. Chat reports results; unavailable Your dot/SMS delivery is not claimed. |
| Actual media | Real board/Blender tests demonstrate mechanical behavior. The isolated live pony proof is separate from Scripture/acting/field approval and must be assessed on its returned audio/video. |

No unresolved product decision blocks this bounded implementation. Missing
actual canon/reconstruction evidence must still receive its existing review;
it cannot be resolved by a guessed coordinate, an approval-looking FDL field or
a successful local render.

## Live pony proof (October 14, 2026)

One built-in image generation produced the chestnut Shetland pony opening frame,
retained with its exact prompt/hash and included-usage limitations at
`HeartWordData/assets/generated/pony-ltx-keyframe-2026-10-14.png.json`.
The exact image prompt is preserved there; output was 1672x941 with acceptable
whole-pixel aspect rounding. No paid image API was called.

The real Mac adapter submitted one local Fast request, 5 seconds / 720p / 24 fps /
seed 42 / native environmental sound, over authenticated SSH transport. It
completed in about **13 minutes 52 seconds**. Exact video prompt/settings, Mac
output, native WAV, progress, generated bytes and metadata remain under:

`HeartWordData/assets/generated/ltx-diagnostics/pony-ca19041d-ea93-48a1-8396-319f0b008e1b/`

- `pony-native.mp4`: original H.264 MP4, **1280x704, 121 frames, 24 fps,
  5.041667 seconds**, native audio present. Complete FFmpeg decoding passed.
- `pony-720p-5s.mp4`: separate **1280x720, 120 frames, 24 fps, exactly 5.000000
  seconds**, audio retained/re-encoded. Aspect-preserving 8-pixel top/bottom
  padding and trimming of the extra final frame make the requested viewing copy;
  no original overwrite or speech-speed change.
- `review-0s.png` through `review-4s.png`: inspected samples show the pony lifting
  its head, opening its mouth and settling. At the high head lift the very tight
  close-up clips the upper muzzle; this is a visible framing limitation, not a
  claim of perfect animation or proof of frame-accurate animal/audio sync.
- `verification.json`: stream/duration/hash evidence; `verification-final.json`
  links the corrected listening result and combined review cost.
- `listening-review.json`: first listening result explicitly recognizes a neigh
  followed by a soft snort and wind, without human speech/music, but reports
  confidence `0.98`. The existing 0–100 gate correctly holds that malformed result.
- `listening-review-r2.json`: a deliberate, disclosed listening-only repeat with
  the required scale explicit passes at **95/100**, identifies the horse neigh /
  soft snort / quiet wind and finds no speech/music. The first review remains
  retained; no confidence was silently rescaled and no video was regenerated.

Generation cost: **$0 local video API**, one included built-in image whose quota
decrement/monetary attribution is unreported. Two listening checks have combined
estimated cost **$0.002586** ($0.001516 first + $0.001070 repeat), not invoice
reconciliation. Assistant planning/research usage remains unreported. No scene
film budget/ledger, accepted asset collection, historical render, source/canon,
timeline or release state was modified. This is the requested standalone animal
test, not Scripture field approval. The video is presented in this chat;
Your dot/live Mabel and SMS delivery remain unavailable and unclaimed.

Existing handoff chapter scopes remain: shot handoff Hatam Mark 2/4; coverage
handoff Hatam Mark 2/3/4. No historical conversion, new corpus approval, general
numeric FDL compiler, automatic geometry reconstruction or autonomous assistant
image dispatcher is claimed. Existing shared crew records/current-plan and
selective rerun behavior remain controlling.

Your dot/live Mabel dispatch and direct ChatGPT/SMS delivery are unavailable in
this session. Plugin discovery found no connected suitable SMS transport. This
chat reports progress/result; no SMS delivery to the supplied number ending
8114 is claimed. No unrelated naming work or new notification subsystem is added.
