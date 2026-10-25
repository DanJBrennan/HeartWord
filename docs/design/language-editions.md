# Language editions from an editable chapter

Status: isolated implementation, held for donor edit reconstruction and safe deployment.
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
  reference; selected Papuan character versions, visual hashes, retained
  cast-master sidecars with the effective ElevenLabs voice/model/settings;
  clean title background; and title words and duration. Changes hold before
  reuse or provider submission.
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
- The original target source recording remains the narrator and the timing
  authority. Existing voicing forms a target-only cast master with the pinned
  voice settings. Short Avatar audio may receive trailing non-speech padding
  under the existing Kling contract; every spoken sample remains intact.
- Before whole-chapter voice conversion, the producer selects one complete
  2–15 second target-language speech interval (or confirmed short speech run)
  after source and correspondence review. The existing voicing route converts
  only that sample. A named listener hears its retained cast audio and records
  pronunciation/source-fidelity evidence. The approval pins the source bytes,
  cast bytes, voice sidecar and plan revision. Changed evidence holds bulk
  voicing. The first paid audition is a later explicit producer action.
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
distribution-named output. Its historical recipe remains held and lacks an
exact linked producer decision in the database. See
`docs/production/mark4-final-donor-evidence-2026-10-24.md`. Record that
producer selection only in an isolated donor copy; do not alter the live
database. Before rollout, reconcile
the current Mark 5 production state, take a consistent DB/media backup, pin
the code revision and validate an isolated restore. Roll back application
code while preserving any newer edition rows/assets; never restore the old
review snapshot over current production. Paid Meyah voice audition, Avatar
pilot, whole-film review and field distribution require their normal later
authorizations and evidence.
