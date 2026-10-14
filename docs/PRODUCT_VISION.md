# Product Vision

Status: authoritative product vision
Recorded: September 4, 2026
Origin: third attempt at this project, informed by two prior attempts made
under the working name "BVET" (Bible Video Editing Tool)

This document preserves the vision that should guide HeartWord's design,
architecture, implementation, storyboarding, media generation, editing, and
review. It is a product vision rather than a frozen implementation
specification; later explicit producer decisions may refine it.

## Lineage and Lessons Learned

HeartWord is the third attempt at this project. The first two were built
under the working name BVET:

- The original BVET accumulated coding errors and structural inconsistencies
  as it grew.
- A second attempt asked an AI coding agent (Codex) to fix those errors
  wholesale. That effort fragmented into roughly 100 individual tickets and
  lost track of the original goal somewhere in the process — the fixes became
  the project instead of serving it.

HeartWord starts fresh in code, but not from a blank slate in substance: it
carries forward a matured product vision (below, based on BVET's most
developed vision document) and reuses a curated subset of BVET-Data's
existing assets — the FCBH original heart-language audio recordings,
authorized Scripture text per language, and the in-progress canon character
library — rather than the code that surrounded them.

The operating lesson from attempt two: keep every unit of work traceable back
to this vision document. A large batch of disconnected fix-it tickets is a
warning sign, not progress. See `AGENTS.md` and `docs/NON_GOALS.md`.

## Naming and Branding

- **HeartWord AI** is the organization/company. Its domain is `heartword.ai`.
  Tagline: "Scripture media for every heart language." (Earlier drafts
  included the word "Faithful"; dropped as implied rather than stated.)
- The HeartWord AI logo is at `docs/assets/branding/heartword-ai-logo.png`.
- **HeartWord Studio** is the software described by this vision document — the
  AI production studio itself. Tagline: "An AI production studio for
  Scripture in every heart language." ("HeartWord" is used as a shorthand for
  HeartWord Studio elsewhere in this document and repo.)
- **HeartWord Films** is the finished video output produced by HeartWord
  Studio.
- **HeartWord Illustrated** is the comic/illustrated Scripture output
  produced alongside (or from) the same production.
- Each Mark video's closing scroll should credit the tool and the
  organization, e.g. "This Gospel of Mark film was produced in HeartWord
  Studio," along with the `heartword.ai` domain. See "Post Production and
  Distribution" below.
- HeartWord Illustrated is part of HeartWord's architecture, but is explicitly lower priority than HeartWord Films while the video lane is under active development. Its strategy (recovered from a prior attempt's Mark/Acts illustrated work) is recorded in `docs/design/illustrated-scripture.md`.

Naming research (2026-10-07): the [branding decision memo](design/branding-review-2026-10-07.md)
compares HeartWord with a shortlist checked for standard-registration .com
and .org domains. It is a recommendation for Dan, not an adopted rebrand;
the established names and existing film branding above remain authoritative.

## Why HeartWord Exists

The Mark 2:1-12 pilot (produced under BVET) required more than 50 editing
iterations, and likely about 100 attempts in total, many of them small changes
such as trimming two seconds or sliding audio. HeartWord should make that kind
of detailed iteration faster and more visible, while supporting the whole path
from a passage idea to a reviewed, rendered Scripture video.

HeartWord's durable product is the autonomous pipeline, not the editor:
verified Scripture, its heart-language audio, and an approved regional visual
canon go in, and a finished chapter video comes out with minimal manual
intervention (see the autonomous storyboard default in Story and Shot
Planning, and Product Behavior and Quality Standard below). The editor exists
so the producer can inspect, correct, and override what the autonomous
pipeline produced — it is not the primary way a chapter gets made. Investment
should follow that priority: pipeline judgment and automated quality control
come first; editor polish exists to support review and correction, not to
recreate a professional NLE.

HeartWord is envisioned as a Bible-centered video editor that starts with an
idea and a set of verses, then helps plan, generate, assemble, revise, and
render the result. It should understand the relationship between verified
Scripture, spoken audio, shots, characters, keyframes, generated clips, lip
sync, and comic panels. It should look and behave enough like a familiar video
editor to support precise hands-on editing without trying to reproduce every
feature of Adobe Premiere.

The broader term for the work is **illustrated Scripture**. Both the videos
and companion comic content are intended to preserve the exact Scripture text.
Section headings belong in a comic edition but normally not in the body of the
video. A verified heart-language heading may be used as a video title.

## Product Experience and Visual Interface Strategy

HeartWord brings together passage understanding, cinematic storyboard
creation, and a professional visual editing workspace. Starting with a
passage of verified Scripture, typically a chapter, it helps the producer
identify the passage's meaning, narrative movement, relationships, and
emotional context, then express them through a storyboard of scenes and
shots. The goal is an authentic, relatable experience for native speakers,
grounded in their language and an approved regional character canon while
preserving the biblical setting and the exact Scripture.

Modern cinematography and coordinated film roles shape that storyboard. The
Director guides the scene's purpose and emotional flow; the cinematographer
guides framing, camera movement, coverage, and light; the choreographer
guides staging and action; production design (including costume and
lighting) shapes the visual world; a script supervisor / continuity role
keeps character appearance, props, and exact Scripture wording consistent
across shots; a colorist keeps the final look coherent across scenes; a
sound designer and composer shape the sonic world and score; and picture
editing assembles the result. Scripture and cultural review keep those
creative choices faithful and respectful. Each proposed choice should have a
visible purpose grounded in the passage. Music supports the mood while
giving narration and character speech priority.

The visual interface should be familiar to an Adobe Premiere user: project
and media browsers, source and program monitors, a visual multitrack
timeline, and contextual controls for the selected scene, shot, clip, or
audio cue. It supports nonlinear editing, clip placement and trimming,
accurate playback and seeking, audio mixing, comparison of takes, revision,
final rendering, and export.

Source Scripture, storyboard, and timeline are linked views of the same
chapter production. Selecting a shot should reveal its verses, exact speech,
cast, visual references, Director guidance, generated takes, and review
status. The producer can move between the whole chapter, a scene's
storyboard, and precise timeline edits while retaining that context.
Storyboard changes and editing decisions remain synchronized; picture editing
preserves Scripture sequence and meaning.

The producer can work directly with visual controls or ask the AI filmmaking
partner to propose and carry out edits through the same visible project.
Creative guidance, manual editing, playback, and export form one continuous
workflow, with review and costs accessible where decisions are made.

## Character Creation & Editing Tool

BVET's canon character library was only partially complete, and building it
out was ad hoc. HeartWord treats character creation and maintenance as a
first-class tool, not a side process. See `docs/design/character-tool.md`
for the tool's workflow in full; in summary:

- A character record covers a name, an approved headshot (built for
  close-up lip-sync work), and multiple body/pose reference images for
  different shot types.
- Voice mapping applies only to characters with spoken lines in at least
  one scene — a non-speaking character (a crowd extra, someone who only
  appears silently) never needs one. For a speaking character, voice
  mapping is a dropdown selection against ElevenLabs' available voices (v1's
  confirmed voice provider — see Generation Providers, Models, and Cost
  below) — auditioning candidate voices there is how the producer picks
  each canonical character's voice in the first place, not just a lookup
  against an already-decided ID. A live audio test then plays a sample of
  the character's own Hatam line (re-voiced via ElevenLabs' voice-changer,
  not synthesized from scratch) so the producer hears the actual assigned
  performance before approving it, not just the stock ElevenLabs sample.
- When starting a new character, the AI proposes a starting
  description/prompt for the character's appearance (informed by the
  regional canon and the role the character plays in the source text) for the
  producer to refine rather than starting from a blank page.
- Character records carry version, approval status, and provenance,
  consistent with the rest of HeartWord's asset model (see "Assets, Versions,
  and Portability" below).

This tool should make it fast to complete gaps in the character canon as new
chapters surface characters that don't yet have approved assets, rather than
blocking production or working around the gap informally.

## Initial Production Goal

- Begin with the book of Mark in Hatam.
- Produce 16 self-contained videos, one for each chapter.
- Expect roughly 15 minutes per chapter, but derive actual timing from the
  Hatam reading, which can take substantially longer than English.
- Allow pauses and visual breathing room so viewers can absorb the story
  rather than forcing the images to change continuously under the reading.
- Let each chapter stand alone while anticipating the next chapter.
- Design for YouTube and download by translation checkers, Hatam leaders,
  seminary classrooms, private viewers, and ultimately anyone using a mobile
  phone.
- Treat the existing Mark 2:1-12 rough pilot and the prior BVET attempts as
  evidence of what works and what doesn't, not as formats or architectures to
  copy.

## Scripture and Language Principles

### Production-corpus decision

- Video production is eligible for the 27 New Testament books and Genesis.
  Genesis is the only Old Testament book eligible for chapter or scene video
  production. Exodus through Malachi remain outside video production even
  when source or language files are present.
- A New Testament passage may reference a person from an excluded Old
  Testament book. HeartWord may retain citation metadata and an approved,
  distinctive canon identity, voice, and portrait inset for that person
  without making the cited book video-production eligible.
- Video-book eligibility, citation-reference eligibility, and canon-identity
  scope are separate authorities. No import, migration, project, workflow,
  generation, or export operation may infer book approval from another
  scope.
- Genesis currently has explicit Hatam-primary and English-reference source
  approval. Other language editions remain downstream editions for specific
  books only; a language does not silently extend to another book merely
  because files exist.

- Scripture is the controlling source for the production, not material to be
  adapted or paraphrased.
- Hatam is the initial production language. Verified Hatam Scripture rules
  remain mandatory: never invent Hatam text.
- HeartWord should show the exact Hatam words and corresponding English so
  the producer can follow the passage during planning and editing.
- Verse numbers must be clearly visible throughout the editing workflow so it
  is always obvious which verse is being worked on.
- A video title, if used, should remain in the heart language. For example,
  the title for Mark chapter 3 should read "Markus 3."
- The video should not introduce English display text into a Hatam
  deliverable.
- The architecture should support later language replacement. A completed
  chapter may receive a new language audio track, with only the affected
  close-up lip-sync clips regenerated.
- Plan shots and dialogue so language changes, especially between English and
  the more verbose Hatam, do not create overlapping spoken clips.

## Visual World and Character Direction

**Aspect ratio: 16:9 landscape** (confirmed 2026-09-06, Dan). Every
image and video generation call must request this explicitly rather than
accepting a provider's own default -- caught as a real, live gap the same
day: `GeminiVideoProvider.generateFinal()` already hardcoded 16:9 for Veo,
but the image generation calls (Nano Banana) requested no aspect ratio at
all and were landing mostly portrait, a real mismatch between the
keyframes and the landscape video they're meant to feed into. Fixed in
`src/providers/gemini/index.ts`'s `GeminiImageProvider.generate()` via
`generationConfig.imageConfig.aspectRatio`.

The people should have Hatam/Papuan faces while the physical setting remains
first-century Jerusalem and Galilee. Characters wear traditional first-century
tunics and robes. Buildings, landscapes, props, and Roman soldiers remain
historically coherent with that world. The underlying principle is that
viewers identify with the message through familiar faces; the clothing,
trees, and buildings do not need to be transplanted to modern Papua.

The existing companion comic (HeartWord Illustrated) uses semi-realistic
characters. The video lane (HeartWord Films) uses realistic characters.
Whether Illustrated moves to realistic characters in the future is an open
question, not yet decided. HeartWord should help
the producer create and complete the video character canon (see "Character
Creation & Editing Tool" above), including the characters needed for Mark.
Character headshots should be very high quality, with useful full-body and
pose reference images as well.

The active regional video canon for Hatam HeartWord work is Papuan. Video
references and provider requests must come only from the approved Papuan
regional canon. Other regional canons (e.g. Horn of Africa) are separate and
must not be substituted. Companion comic canon artwork may remain available
as a narrative reference, but it must not be used as a video identity or
keyframe source without an explicit decision to do so. When a Mark character
does not yet have an approved Papuan video-canon asset, HeartWord should show
that gap and block generation rather than falling back to another canon — and
should make it fast to close that gap using the Character Creation & Editing
Tool.

Whether comic panels should use the video references directly or retain their
own stylized references remains an explicit design decision. HeartWord must
not silently collapse or redesign established comic and video canons.

## Story and Shot Planning

A storyboard exists at two levels: an overarching, book-level storyboard
covering the whole book at a lighter level of detail, and a detailed
chapter-level storyboard produced when a specific chapter is actually worked
on. Alongside HeartWord's autonomous default, the UI provides an explicit
"Create Storyboard" button for a chapter for producer-controlled, manual
operation. See `docs/design/shot-planning.md` for how that storyboard is
actually produced: each film-production role (director, cinematographer,
choreographer, and the rest — see Editing Experience below) runs as its own
agent, and shots are planned through those agents interacting with each
other rather than one model deciding everything alone. That interaction is
captured in a log accessible from the UI, not just the resulting storyboard.

HeartWord should:

- create an initial storyboard for a chapter and keep it synchronized as the
  production changes;
- decide how many shots and keyframes a passage needs based on meaning,
  pacing, audio duration, generation cost, and useful visual continuity;
- identify character-spoken portions that need close-up lip-sync treatment;
- identify the exact heart-language and English words associated with every
  planned spoken shot;
- propose the shots, staging, blocking, choreography, costumes, lighting,
  environments, camera coverage, and moments of rest needed to communicate
  the passage clearly;
- generate or prepare keyframes for video generation;
- make selected keyframes reusable as comic-panel candidates when
  appropriate;
- retain causal narrative actions instead of compressing the story merely to
  reduce shot count; and
- determine during design whether a companion comic requires a separate
  storyboard or a derived view of the video storyboard.

## Editing Experience

HeartWord should provide the fundamentals needed for rapid review and final
rendering, including:

- a language / book / chapter selector so the producer can navigate
  directly to any (language, book, chapter) combination and see that
  video's current state, rather than only working through one continuous
  project;
- a visual, multitrack timeline;
- drag-and-drop clip placement and reordering;
- trimming from either end of a clip;
- recognizable visual previews or thumbnails of clip contents;
- clear verse markers and Scripture context on the timeline;
- video preview and accurate playback;
- precise audio/video synchronization;
- clip, shot, scene, and chapter organization;
- useful post-production controls, selected and designed with expert
  guidance;
- edits that are preserved automatically as they're made, with no separate
  manual save step;
- undo and redo for editing actions (see the edit-history design in
  `docs/design/timeline.md`);
- iteration, comparison, review, correction, and improvement rather than a
  one-pass generation workflow; and
- reliable final rendering.

HeartWord should offer a way for the producer to inspect and direct the
workflow through an AI assistant, not only through direct manipulation. The
producer is looking to that assistant not only for software operation but
for active insight and guidance across the same film-production roles named
above: director, cinematographer, choreographer, costume designer, lighting
designer, staging designer, script supervisor / continuity, colorist, sound
designer, composer, and post-production/editing partner. The assistant
should be askable to "put on" one of these hats for a specific question
(e.g. "as the colorist, does this scene match the previous one") rather than
only giving generic feedback.

## Audio Model

- The Hatam audio for Mark already exists (recovered from prior BVET-Data
  work) and should be verified and reused rather than re-recorded.
- The approved Hatam Scripture text exists as verified source documents from
  prior work. HeartWord should use those verified sources rather than
  reconstructing text from media or generating it.
- Existing voice assignments (many based on ElevenLabs voices) from prior
  work should be reviewed and reused where still appropriate, via the
  Character Creation & Editing Tool's voice mapping and live test.
- Each production needs at least a Hatam track and an English track.
- The editor must allow tracks to be muted or enabled independently and
  provide volume and balance controls.
- The design should determine whether narration and character speech should
  be separated and whether individual speaking characters need their own
  tracks or stems. That choice should support editing, lip-sync replacement,
  and later language editions without making the timeline unnecessarily
  cumbersome.
- When a lip-sync clip is created, HeartWord must preserve its precise
  relationship to the source audio.
- For a new language edition, HeartWord should identify every lip-sync clip
  that must be regenerated and extract or reference the exact audio needed
  for an audio-to-video request.

### Three-Layer Audio Architecture

HeartWord uses three distinct audio authorities:

1. The original heart-language reading master is immutable source evidence.
2. The composite complete cast master is one continuous, complete
   performance. Narration is inherited from the immutable original reading
   master and does not receive a separate voice assignment. Quoted character
   speech uses the approved voice for each speaking character. The composite
   master contains no editorial timing gaps and is the only
   dialogue-performance source for lip-sync extraction.
3. The spaced production timeline references exact ranges of the complete
   cast master and inserts explicit editorial-gap objects at safe
   boundaries. It never time-stretches Scripture speech.

Each gap records a duration, narrative purpose, ambience policy, linked
scene/shot, and approval status. Changing a gap shifts all later dialogue and
picture while preserving the underlying master and previously generated
lip-sync media. Provider-video audio remains muted in the production edit;
the spaced production dialogue plays underneath it.
Environmental audio from LTX may be retained as a separate editable ambience
stem after listening review confirms it is speech-free. The existing sound
design and finishing mix can place it beneath the authoritative source/cast
recording. Generated dialogue, including unintelligible voices, is held.

## Generation Providers, Models, and Cost

Producer update (2026-10-06): use local LTX 2.5 Fast on the dedicated M4 Pro
Mac mini as the primary scene-video provider because it has no per-call API
cost. Keep Veo and Kling selectable for an extended testing/comparison period.
The autonomous pipeline, approved canon, Scripture fidelity and reviewed
producer workflow remain the product; this is a provider choice rather than
a reorganization around local hardware. Setup and limits are recorded in
`docs/production/LTX_LOCAL.md`.

Confirmed v1 providers (see `docs/ARCHITECTURE.md`'s Provider interface for
how these map onto the provider abstraction):

- **Image generation:** Google Nano Banana for routine keyframes, Nano
  Banana Pro for canon-critical or higher-quality needs — the same
  cost-tiering the vision already called for (routine vs. canon-critical),
  now naming the actual models. Authenticated via `GEMINI_API_KEY`.
- **Video generation:** Google Veo 3.1 Lite — 720p for most shots, 1080p for
  emotionally important or otherwise higher-priority shots. Also
  authenticated via `GEMINI_API_KEY` (same credential as image generation,
  since both are part of the same Google/Gemini API family).
- **Draft tier, keyframe-guided generation, and targeted image editing:**
  Google Gemini Omni 1.1 — the 360p Draft Room tier (see
  `docs/design/media-generation.md`), the start/end-keyframe-guided scene
  generation feature (more directorial control over a shot's beginning and
  end than open-ended generation gives), and editing just a region of an
  existing image (e.g. correcting a costume detail like a belt buckle)
  without regenerating the whole image. Also under `GEMINI_API_KEY`. The
  targeted-edit capability is a first-class operation HeartWord should
  expose, not just a fallback — it's the fast path for both fixing an
  approved character asset (see `docs/design/character-tool.md`) and
  correcting a returned shot that's otherwise right.
- **Voice/re-voicing:** ElevenLabs' voice-changer (speech-to-speech) API,
  authenticated via `ELEVENLABS_API_KEY`. Confirmed 2026-09-05. Used two
  ways: (1) auditioning ElevenLabs' available voices to pick each
  canonical speaking character's voice, and (2) re-voicing that
  character's real Hatam dialogue -- the original narrator's actual
  reading, from stage 1's `original_reading` audio segments -- into the
  chosen voice for the composite cast master (see Three-Layer Audio
  Architecture above). This is speech-to-speech, not text-to-speech: no
  Hatam TTS model exists, so the actual heart-language audio a real
  narrator already recorded is what gets re-voiced, preserving Hatam
  pronunciation and performance rather than synthesizing it from text.
- **Lip-sync:** Kling.ai's Avatar API, authenticated via `KLING_API_KEY_1`
  (a separate credential/vendor from ElevenLabs and the Google-family
  models above). Takes the composite-cast-master audio clip for a
  character's line plus a scene keyframe -- close enough on the character
  to show lip movement, but still framed with the scene's actual
  background -- as the reference frame; the character's approved headshot
  is also passed alongside the keyframe for added likeness/lip-sync
  quality.
- Model choice must be visible and controllable inside HeartWord rather than
  buried in code.
- HeartWord must monitor generation cost, especially keyframe and video
  calls, and associate costs with the resulting assets and attempts.
- Track every generated clip, keyframe, provider, model, prompt, source
  asset, version, retry, status, and approval decision. No accepted result
  should lose its generation provenance.

These are v1's actual providers, not placeholders — but they still sit
behind the single provider interface described in "Provider abstraction" in
`docs/ARCHITECTURE.md`, precisely because this list is expected to keep
changing as vendors ship new capabilities or drop prices; HeartWord should
make it possible to test, compare, and replace providers as their quality,
cost, and APIs change without rewriting pipeline stages.

### Cost Governance

- Each paid generation call creates one immutable attempt event containing
  its project, shot, attempt, provider, model, provider operation, duration,
  resolution, audio setting, price basis, usage data when supplied, and
  result provenance.
- A project maximum-spend gate uses an append-only live ledger, never
  editable per-shot cost fields.
- HeartWord should be able to show a live calculated project cost, a
  provider-billing-pending figure, and a reconciled billed figure,
  separately, rather than treating an estimate as an actual.
- Chapter estimates should include keyframe and video attempts by chosen
  resolution; exact excerpt duration and selected resolution drive the
  forecast and spend gate.
- Pricing and model suitability should receive a periodic review. Routine
  keyframes may use a lower-cost image model, while canon-critical or
  repeatedly unsuccessful work may escalate. Most shots should target a
  standard resolution; emotionally important close-ups may select a higher
  one.

## Staged Production Workflow

The workflow is explicit and reviewable, in stages:

1. Source Material Validator
2. Canon Builder
3. Story Creator
4. Story Validator
5. Scene Choreographer
6. Image Generator
7. Image Validator
8. Video Generator
9. Video Validator
10. Post Production
11. Distribution

The Source Material Validator checks verse completeness, quotation
boundaries, speaker attribution, source-audio alignment, and safe utterance
boundaries. It uses a text-first assurance model so the producer is not
required to understand or listen to the heart language: verified quotation
integrity, an authoritative dictionary and Scripture-derived corpus,
cross-version structure, waveform pauses, quote-pure segmentation, and
targeted audio-text detection are retained as written evidence. Each decision
receives a 0-100 assurance score. Scores of 90-100 are auto-decided; 80-89
proceed conservatively with a visible caveat; scores below 80 hold only the
affected item for a qualified language specialist. Autonomous linguistic
judgments remain capped below 100 without an independent fluent reviewer. For
Hatam Mark, verified Hatam remains the authority; other translations and
back-translations may inform structure but never substitute for Hatam
lexical evidence.

The Story Creator acts as an expert cinematographer and director. It turns
the selected Scripture chapter, selected-language text, and matching English
text into a believable production script made of scenes and multi-shot
coverage. It owns opening context, natural character interaction, lighting,
camera angle and movement, focus, scenery, emotional narration, speaker
attribution, exact quoted speech in both languages, and quotation-anomaly
reporting. Narration is never lip-synced. Expensive visible lip-sync normally
holds on the speaker for no more than five or six seconds before rear
over-shoulder or listener-reaction coverage and a later return to the
speaker.

The Story Validator independently reviews the complete production script for
Scripture-story intent, emotional continuity, respectfulness, biblical
values, confusion, and improvements, against a retained scoring rubric.

The Scene Choreographer consumes the approved production script and Story
Validator findings. It owns keyframe prompts, video prompts, required canon
asset packages, and exact timing. It creates the language-spaced-out track
(e.g. Hatam Spaced Out) by retaining immutable source-audio windows and
adding deliberate pauses for dramatic beats and scene transitions.

The Image Generator owns cost-gated keyframe production. The Image Validator
comes afterward: lip-sync keyframes must be close enough for clear mouth
motion, normally using an approved headshot blended into a scene with ¾ or
camera-facing positioning; all keyframes must preserve canon and reject
random text or otherwise unacceptable results. Paid video generation stays
blocked until the preceding source, story, choreography, image-generation,
and image-validation gates pass.

## Canon Builder and Voice Approval

The Canon Builder may organize multiple regional libraries (e.g. Papuan, Horn
of Africa, and future planned regions) without making every region eligible
for every project. Hatam Mark remains locked to the Papuan video canon.
Character records retain high-quality headshots, full-body and production
poses, version, approval, and source provenance (see "Character Creation &
Editing Tool" above). The narrator always uses the voice on the immutable
original reading master and is excluded from voice assignment. Every
speaking-character voice is selected and approved before the composite
complete cast master is built. Collective/crowd lines may be voiced by a
single representative speaker while the rest of the group is shown reacting
silently, matching how the source recording actually attributes the speech.

## Post Production and Distribution

Post production should support a consistent chapter identity, restrained
scene-appropriate music, ambience and effects, opening/closing treatment, and
final quality control. Concretely, HeartWord should provide post-production
capabilities for:

- **Special effects** — visual effects applied after scene generation
  (transitions, light/particle effects, color treatment) rather than only
  what a generation provider bakes into a shot, so a scene doesn't need to be
  regenerated from scratch just to add or change an effect.
- **Titles** — chapter/section title cards and any recurring opening
  treatment, respecting the Scripture and Language Principles above (a title
  stays in the heart language; no English text leaks into a heart-language
  deliverable).
- **An ending scroll** — closing credits/acknowledgments, separate from the
  narrative footage itself.

The initial delivery package should plan for multiple resolution/quality
tiers on export, rather than a single fixed output, driven by how the video
actually reaches its audience:

- **Real-world distribution path.** The target playback device is an
  Android phone (a few village leaders have laptops). Distribution is
  multi-channel: a YouTube upload carries the highest-quality copy, useful
  for initial tests and for when leaders visit the city for high-speed
  internet — YouTube handles its own bandwidth-adaptive downscaling, so this
  copy doesn't need to be size-optimized itself. Inside the tribal region
  itself, the primary distribution channel is WhatsApp: the missionary
  partner shares each chapter video to roughly 150 village leaders, who
  redistribute to roughly 200 people per village, with further
  redistribution between individuals often happening over Bluetooth or a
  USB-C cable rather than any network at all. This means final file size —
  not just resolution — is a first-class constraint for the copy that
  actually reaches most viewers, and WhatsApp's own video re-compression on
  send is a real factor to account for (e.g. deciding whether to send as a
  video message versus a file/document to control what quality survives). A
  third channel, the `heartword.ai` website itself, is planned but does not
  exist yet; once built it would likely host the YouTube-quality master
  copy for browser/laptop viewing rather than needing its own tier. Public
  YouTube publication additionally requires securing rights clearance from
  FCBH (the source-audio rights holder) first; HeartWord should still
  design and produce the YouTube-quality master, but no chapter is actually
  published to YouTube until that clearance is in place — independent of
  when it's ready for WhatsApp/tribal distribution, which does not wait on
  it.
- **Master** — the highest resolution the generation and upscale path
  actually produced for that chapter (up to 4K where the Draft Room's
  upscale-from-360p-draft path in `docs/design/media-generation.md` was
  used, otherwise 1080p), kept as the archival copy, the YouTube upload
  source, and the source for any future re-export.
- **WhatsApp/tribal distribution copy** — sized and encoded specifically for
  the WhatsApp → Bluetooth/USB-C chain above: Android-phone-appropriate
  resolution, a deliberately small file size, and a codec/container choice
  tested against what WhatsApp actually preserves on send.
- **Low-data copy** — an even more aggressively compressed export for the
  most constrained hops in that chain, prioritizing playability and small
  size over visual fidelity.
- **Review preview** — a fast, low-resolution export (reusing the Draft
  Room's cheap-tier output where possible) for internal review before a
  full-resolution final is rendered.
- **Audio-only edition** — for audio-first distribution or accessibility.

Exactly which resolutions, bitrates/file-size targets, and container/codec
choices (e.g. MP4/H.264 as a likely safe default, and how to package for
WhatsApp specifically) HeartWord commits to is not yet finalized — see
Design Decisions Intentionally Left Open. External editors (e.g. Premiere
Pro, Filmora) remain integration/export targets to evaluate rather than
hidden runtime dependencies; HeartWord retains the project timeline and
provenance as its own source of truth.

The ending scroll for each Mark video should include a brief credit naming
HeartWord Studio as the production tool and the `heartword.ai` domain (e.g.
"This Gospel of Mark film was produced in HeartWord Studio"), alongside any
Scripture-source and translation-team acknowledgments. It should stay
understated relative to the Scripture content itself.

### Field Review Before Distribution

Because the WhatsApp/Bluetooth/USB-C distribution chain is effectively
one-way — once a chapter reaches village leaders there is no way to recall
or quietly replace it — field review is a hard gate before that channel,
not an optional nicety. Ryan, the missionary partner who distributes each
chapter, speaks Hatam and leads a team of native Hatam speakers who review
every chapter before it goes out; their approval is what actually clears a
chapter for WhatsApp distribution, on top of HeartWord's own automated
validators (Staged Production Workflow, above). An early 4-minute pilot
made this way was already distributed to at least 10 people and received
positive feedback, ahead of the full Mark series.

Feedback from that review, and from the field generally, reaches the
producer directly through Ryan rather than through any in-app analytics or
reporting feature. HeartWord is designed for a single producer (Dan) who
makes the resulting edits; it is not a multi-user review/approval system,
and native-speaker reviewers are not expected to need accounts or roles
inside the tool itself.

## Music and Finishing

HeartWord should help request or create music appropriate to each scene, and
should decide whether a book needs a common opening, recurring identity,
title treatment, closing, credits, website text, or shared musical motif.

Music is a deliberate part of illustrated-Scripture storytelling, not
decoration: it should be selected or created per scene and placed
strategically to enhance mood, support transitions, and give moments of
reflection room to register. Indigenous instruments, rhythms, or textures
(traditional instruments, foot stomping, unison singing) may inspire the
score where they suit the scene and respectfully connect with the audience —
used with restraint and scene appropriateness, not as a constant effect or
cultural decoration, and preserving the established historical setting.

Narration and character speech always take priority. Music must remain clear
of the spoken words in both volume and arrangement, with controlled fades and
volume reductions beneath speech, and silence wherever it better serves the
passage. Fuller musical moments may occupy suitable pauses or transitions.
Every cue should have a clear purpose, entrance, exit, and relationship to
the dialogue; continuous music is not a default. Review the mix for speech
clarity, including on mobile-phone speakers. Music should support the
passage's mood without imposing a meaning or judgment unsupported by
Scripture.

## Assets, Versions, and Portability

- HeartWord should have a dedicated asset area, separate from any legacy
  comic or prior-attempt outputs it draws from.
- It may copy useful source material (from prior BVET-Data work) into its own
  managed workspace while preserving canonical originals and provenance. It
  must not overwrite legacy editions or established canon assets.
- The project data model should track chapters, verses, passages, shots,
  storyboards, panels, keyframes, clips, audio segments, tracks, models,
  providers, prompts, costs, versions, reviews, approvals, renders, and
  language replacements.
- HeartWord's project and asset formats should avoid unnecessary dependence
  on any one deployment's folder layout, since the tool may be used across
  multiple projects/languages over time.
- A future user should be able to provide a new language, replace comic
  text, replace video audio, and regenerate only the close-up lip-sync
  footage that actually changes.

## Product Behavior and Quality Standard

HeartWord should help the producer begin a chapter, not merely present an
empty timeline. It should analyze the verified text and available audio,
propose a workable storyboard and shot plan, identify missing canon assets,
prepare generation requests, and explain the decisions that need human
review.

The production standard is iterative. HeartWord and its AI assistant should
review generated and edited results, notice mistakes or weak choices, and
make corrections and improvements in the manner of a real directing and
post-production team. Cost and speed matter, but do not excuse Scripture
errors, broken continuity, confusing staging, poor synchronization, or an
unreviewable asset history.

## Design Decisions Intentionally Left Open

These are product questions for HeartWord's architecture and design phase to
answer, not omissions:

- the most useful limited set of post-production capabilities;
- whether comic production uses a separate storyboard;
- whether comic panels and realistic video use the same character references
  or related but distinct derived canons;
- the number and structure of audio tracks or stems;
- the number of keyframes and the degree of video/comic keyframe reuse;
- the use of a recurring title, opening, music identity, credits, end card,
  or website reference;
- the appropriate generation model for each kind of image, keyframe, action
  shot, dialogue close-up, and retry; and
- the appropriate use of generated music and heart-language musical
  influences; and
- the exact resolution, bitrate/file-size target, and container/codec
  choices for each export tier, including how to package the WhatsApp/
  tribal-distribution copy so it survives WhatsApp's own re-compression
  (see Post Production and Distribution above); and
- the heartword.ai website itself (not yet built): its scope, and how/
  whether it becomes a distribution channel alongside YouTube and WhatsApp.
