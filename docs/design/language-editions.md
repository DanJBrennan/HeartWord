# Language editions from an editable chapter

Status: isolated Mark 4 donor normalized; the Meyah source map, detailed
correspondence, cast subsets and title visual have Dan's named reviews.
The isolated target now has 145 editable shots, two explicit omissions and
the selected four-second title. Dan approved the 4:9 Jesus audition; all ten
reviewed character speech runs are converted, and the 54-row cast master
preserves the other 24 original Meyah source rows. The new cast takes are
pending Dan's listening review. New picture, Kling Avatar, assembly, film QC
and editable delivery remain open.

October 25 source-binding update: Dan approved applying the projected 54-row
Meyah speaker map after exact listening review. The existing ingestion stage
now records an append-only binding from the approved 40-row verse archive,
keeping its history and source bytes intact. Stage 3 target-shot materialization
and paid voice audition require a new named review of the current speaker map;
the earlier verse-map review alone does not satisfy that gate. Dan supplied
that named speaker-map approval on October 25; review
`4a80c28d-7904-45a0-8a55-5f1ec92c7ba7` is current only for this exact
source/alignment. Target shot selection and provider requests remain separate.
Dan also approved an explicit edition-only `omit_picture` disposition for
donor placements that do not fit the reviewed Meyah source clock. Each omitted
placement remains in the ordered correspondence with its donor identity and
reason, but stage 3 creates no target shot or speech binding and stage 4
prepares no media for it. The donor timeline and assets remain intact. This
supports the proposed late repeated Jesus close-up and whispering-reaction
omissions in Mark 4:40–41; their exact placement choices still require shot-map
review. An omission cannot carry target speech, a picture handle or a new
target action, and the edition must retain at least one selected picture shot.
An `addedForEdition` coverage beat names its own reviewed, source-grounded
`addedVerseRef` and `addedAction` so image generation does not repeat the
anchor donor shot's historical verse and action. The new verse must fall within
the inherited narrative scene. Dan approved an optional explicit
`addedCharacterIds` selection for these beats after the Meyah Mark 4 map
exposed plant/field cutaways whose donor anchors contain people. The selected
IDs must be distinct, approved Papuan characters already cast anywhere in
that donor narrative scene; an empty array explicitly means no named
character. An omitted field retains the previous inherited-shot-cast behavior
for older editions. The producer reviews the new verse, action, cast and
reason before stage 3 creates a target shot. A new beat is always silent,
even when its preceding donor anchor visibly speaks; the donor's original
speaker binding remains on the inherited shot. Stage 3 and later input checks
preserve the exact reviewed cast subset. The Mark 4:35–38 storm bridge beats
use these fields for a dusk crossing and disciples turning toward the sleeping
Jesus, who remains outside the second bridge frame.

When a visible-speaking target shot already has a producer-accepted Codex
keyframe, stage 4 verifies its retained image and provenance hashes and keeps
that target frame. It does not register the donor frame as a later accepted
alternative. This applies to Dan's approved Peter 4:38 version-3 close-up in
the isolated Meyah edition; accepting that image does not approve its future
Kling Avatar take or voice.

Retained Windows donor attempts may spell their relative asset path with
backslashes. Edition preflight canonicalizes that spelling to a forward-slash
relative path inside the selected asset root, then pins and rechecks the file
hash. A separator difference alone does not invalidate an approved handle;
a changed path, file or hash still holds stage 3 or picture reuse.
Producer decisions: Dan's October 2026 language-edition conversation and
`C:/Users/danbr/HeartWordData/reviews/2026-10-22-language-editions/LANGUAGE_EDITION_HANDOFF.md`.

## Product contract

Start with an explicitly selected, producer-approved editable Hatam Mark
render. The first acceptance case is Mark 4 to Meyah. The new project is a
normal Meyah/Mark/4 chapter with its own ingestion, source review, scenes,
shots, cast audio, Avatar attempts, editorial cut, QC and export. It keeps the
approved Papuan visual character versions and historical ElevenLabs voice
identities; the target recording supplies all words, narration, order and
speech timing. Narration is never sent to Avatar. A visible speaking mouth
gets a new target-language Avatar candidate; a compatible listener or hidden
mouth picture can be locally reused without duplicating provider cost.

This uses the seven existing pipeline stages and the existing producer
workspace. The edition origin and reviewed revisions are typed append-only
`edit_commands` on a normal target project. Creation records identity and
frozen evidence only. It does not clone donor stage completions, target audio
or approvals, and never contacts a provider. The target stage ledger earns
its own completions. New provider work still needs the current target crew
plan, source/canon checks, spend controls and actual result review.

## Identity and gates

- Read-only preflight pins the exact donor render and linked producer decision,
  original render/recipe hashes and selected clip/attempt/keyframe lineage.
  A legacy mixed soundtrack recipe is pinned as provenance; rebuilding the
  old Hatam audio mix is not required because the target recording supplies
  the edition's speech and timing. Custom historical picture recipes hold
  until reconstructed on an isolated donor copy with a verifiable ordered
  timeline. Approval of an older or different render is insufficient.
  For the selected Mark 4 legacy cut, a fixed-root utility can apply a named
  frame-by-frame shot map only to the isolated donor copy. It verifies the
  exact final film and five video-only chunks, retains the previous custom
  recipe verbatim in edit history, and refuses incomplete or boundary-crossing
  maps. The reviewed map is still required; the utility cannot infer Scripture
  or shot identity from matching pixels alone. The first four seconds of this
  final cut contain Hatam lettering. The normalization records those exact 96
  frames as `replaceable_title` provenance without a donor shot identity; the
  reviewed target pre-source title replaces them once, followed by the exact
  clean moving lake interval. Final-cut picture reused from a saved shot in a
  different narrative scene needs a new scene-correct legacy shot in the
  isolated donor, retaining the source clip link; otherwise target scene
  inheritance would assign its action and verse to the wrong passage.
- Preflight pins the Meyah non-drama recording, supplied DOCX and English
  reference; selected Papuan character versions, visual hashes and cast-master
  evidence; clean title background; and title words and duration. A retained
  cast-master request sidecar pins effective historical ElevenLabs settings
  when present. The final Mark 4 cast masters have no such sidecars: their
  approved voice IDs stay pinned, while `effectiveSettings: null` and
  `historical_settings_unknown` explicitly record that gap. Missing cast audio
  or a conflicting sidecar holds. A reviewed target audition pins explicit
  current adapter settings before bulk conversion. Those current settings apply
  to any selected voice identity with unknown historical settings; each
  character keeps its own approved voice ID. Changes to pinned evidence hold
  before reuse or provider submission.
- The initial Meyah title is `Markus 4` with smaller `Meyah`, composed in the
  Mark 4 style for four seconds over the retained clean lake frame. Uppercase
  is a typography operation, not a spelling change. A local preview is
  selected into the existing opening editorial beat only after named visual
  review. The generic title renderer also supports a later `Markus 5` /
  `Hatam` update, while the approved Mark 5 film stays untouched.
- Target source alignment and its uncertainty are reviewed independently.
  Meyah DOCX entries `6 (4:5)` and `19 (4:18)` remain reference-only markers;
  they contribute no invented text or duplicated audio. Exact target
  correspondence is a named revision with a parent hash and per-placement
  reason. A confirmed continuous speech run may carry a reviewed mouth
  window across old audio-row boundaries.
  Dan heard a spoken Meyah chapter heading before verse 1. The local
  estimated-timing fallback accepts that named observation only at a measured
  opening-pause midpoint and retains the heading as a separate `verse_ref=null`
  source interval. The current 4.094-second edge is provisional; all 40 source
  intervals still need listening review. The heading audio remains source
  evidence, with film treatment decided in the normal target editorial review.
- The final Mark 4 picture includes fifteen original speaking performance
  keyframes whose older producer note only approved held motion/lip-sync
  review. Dan separately selected these originals for the isolated editable
  donor on 2026-10-25. New donor-reference attempt rows record that decision;
  the earlier note and old attempts keep their original statuses. No Hatam
  utterance binding is inferred. When a selected speaking shot lacks one,
  target casting may use the unique pinned approved character voice only after
  an exact reviewed Meyah audio window. The target binding records the voice
  provenance and reviewer.
- The original target source recording remains the narrator and the timing
  authority. Existing voicing forms a target-only cast master with the pinned
  voice settings. Short Avatar audio may receive trailing non-speech padding
  under the existing Kling contract; every spoken sample remains intact.
  The producer may explicitly retain an original target-language group
  performance for a quoted passage covered by non-speaking picture. In the
  Mark 4 Meyah pilot Dan chose this for the disciples' 4:41 question; do not
  substitute Peter's mapped voice or generate Avatar solely for that passage.
- Before whole-chapter voice conversion, the producer selects one complete
  2–15 second target-language speech interval (or confirmed short speech run)
  after source and correspondence review. The existing voicing route converts
  only that sample. A named listener hears its retained cast audio and records
  pronunciation/source-fidelity evidence. The approval pins the source bytes,
  cast bytes, voice sidecar, exact current settings and plan revision. Changed
  evidence holds bulk voicing. A stale saved audition cannot be bypassed by
  starting another scoped provider request. The first paid audition is now a
  single isolated Jesus 4:9 candidate; its source is 142.703–152.394 seconds
  and its generated cast duration is 9.706 seconds. Dan approved that audition
  after the source-versus-cast listening review. The approval pins source,
  cast, sidecar, voice identity, exact current settings and correspondence
  revision. Nine other reviewed speech runs were then converted in scoped
  batches; the final 54-row cast master reused all 30 character rows and
  locally carried through 24 original Meyah rows. Their cast output review
  remains distinct from the earlier audition approval.
- Local picture reuse is derived from selected donor clip stems, muted and
  trimmed with FFmpeg. The mixed finished donor film cannot be a picture stem.
  The five retained Mark 4 final-picture chunks are already video-only and
  decode exactly to its final 13,484 frames; they may supply reviewed source
  intervals once shot identity and trim are established. The producer may
  instead select another accepted non-speaking take of the same donor shot and
  review a longer or shorter source trim against Meyah narration. That take,
  its hash and trim are pinned in the target correspondence; the derived clip
  is muted. Use existing picture handles and normal Picture Editor timing
  before requesting new media. An actual uncovered interval uses the existing
  Codex image handoff for target-owned reviewed
  keyframes and the local LTX motion path. Dan confirmed this means the
  default Codex handoff, whose image model is hosted and whose results are
  saved locally; no new computer-hosted image backend is needed. Stage 4
  holds an exact `needs_coverage` shot until its Codex keyframe
  and, for a non-speaking shot, accepted local LTX picture exist. A speaking
  shot proceeds to a new target-language Avatar take after its keyframe.
  When the final donor visibly speaks but the target recording only narrates
  that action, the reviewed correspondence may replace that insert with a
  passage-grounded non-speaking `needs_coverage` shot. It records the target
  action and reason, has no character speech window or mouth binding, and
  requires its own accepted Codex keyframe and local LTX clip. Mark 4:39 is
  this case in the Meyah pilot; do not assign the old Hatam Jesus mouth
  performance to the Meyah narrator passage.
  There is no loop/freeze or silent story change. Editorial assembly adapts to
  the target audio clock through the ordinary Picture Editor cut and
  source-coverage checks.
- The longer Meyah source may need more than extended handles. A reviewed
  correspondence can add a target-only coverage beat immediately after an
  inherited donor shot in the same scene. It records a passage-grounded reason
  and, for visible speech, an exact target-audio window. Stage 3 creates a new
  target shot; stage 4 requires its own Codex keyframe and local LTX video for
  non-speaking action, while visible target speech uses Kling Avatar in stage
  5. The inherited donor picture is never silently copied into the added beat.
  The normal target shot edit and crew review can redesign its action or camera
  where keeping the old visual would fail the passage.

Sougb remains held pending verified chapter text extraction and native title
metadata. MP4-only import, translation/TTS and global voice reassignment
remain outside this edition workflow. No language/canon eligibility is
granted to an ordinary unlinked project.

## Preservation and rollout

Chapter packaging closes selected donor JSON lineage plus the four shot and
attempt child relations; the target package restores with the original donor
assets unavailable. Relative paths and hashes stay stable across relocation.
An accepted donor does not transfer human film approval, QC, release rights
or cost ledger charges to the target.

Run implementation checks on an isolated worktree and disposable data. The
real Mark 4 `Markus-4.mp4` was confirmed by Dan on 2026-10-24 as his final
distribution-named output. Its original historical recipe was custom and
held, and it lacked an exact linked producer decision in the live database. A
separate decision and the approved 114-placement normalization now exist only
in the isolated donor copy. See
`docs/production/mark4-final-donor-evidence-2026-10-24.md`. Record that
producer selection only in an isolated donor copy; do not alter the live
database. Before rollout, reconcile
  the current Mark 5 production state, take a consistent DB/media backup, pin
the code revision and validate an isolated restore. Roll back application
code while preserving any newer edition rows/assets; never restore the old
review snapshot over current production. Paid Meyah voice audition, Avatar
pilot, whole-film review and field distribution require their normal later
authorizations and evidence.
