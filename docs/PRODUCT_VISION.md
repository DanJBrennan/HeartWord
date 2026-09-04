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

## Why HeartWord Exists

The Mark 2:1-12 pilot (produced under BVET) required more than 50 editing
iterations, and likely about 100 attempts in total, many of them small changes
such as trimming two seconds or sliding audio. HeartWord should make that kind
of detailed iteration faster and more visible, while supporting the whole path
from a passage idea to a reviewed, rendered Scripture video.

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
guides staging and action; and production design, continuity, picture
editing, and sound contribute to a coherent experience. Scripture and
cultural review keep those creative choices faithful and respectful. Each
proposed choice should have a visible purpose grounded in the passage. Music
supports the mood while giving narration and character speech priority.

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
first-class tool, not a side process:

- A character record covers a name, an approved headshot (built for
  close-up lip-sync work), and multiple body/pose reference images for
  different shot types.
- Voice mapping is a dropdown selection against the available voice
  providers/IDs (e.g. ElevenLabs), with a live audio test so the producer can
  hear a character's assigned voice before approving it.
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

The people should have Hatam/Papuan faces while the physical setting remains
first-century Jerusalem and Galilee. Characters wear traditional first-century
tunics and robes. Buildings, landscapes, props, and Roman soldiers remain
historically coherent with that world. The underlying principle is that
viewers identify with the message through familiar faces; the clothing,
trees, and buildings do not need to be transplanted to modern Papua.

The existing companion comic uses partially stylized characters. The video
lane uses realistic or slightly realistic characters. HeartWord should help
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
- iteration, comparison, review, correction, and improvement rather than a
  one-pass generation workflow; and
- reliable final rendering.

HeartWord should offer a way for the producer to inspect and direct the
workflow through an AI assistant, not only through direct manipulation. The
producer is looking to that assistant not only for software operation but for
active insight and guidance as a director, choreographer, costume designer,
lighting designer, staging designer, and post-production partner.

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

## Generation Providers, Models, and Cost

- Candidate video generation: a fast/cheap tier (e.g. Veo 3.1 Lite with
  audio) for ordinary shots, escalating temporarily to a stronger model when
  the lower tier repeatedly misses the concept.
- Model choice must be visible and controllable inside HeartWord rather than
  buried in code.
- Candidate image/keyframe generation: a cost-efficient default model, with
  the ability to move to a higher-capability option when results are not
  sufficient.
- A dedicated close-up audio-to-video lip-sync provider (e.g. Kling Avatar)
  is a likely fit for character dialogue shots.
- HeartWord must monitor generation cost, especially keyframe and video
  calls, and associate costs with the resulting assets and attempts.
- Track every generated clip, keyframe, provider, model, prompt, source
  asset, version, retry, status, and approval decision. No accepted result
  should lose its generation provenance.

These are starting preferences based on what worked (and what didn't) in
prior attempts, not permanent hard-coded dependencies. HeartWord should make
it possible to test, compare, and replace providers as their quality, cost,
and APIs change.

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
final quality control. The initial delivery package should plan for a
master, a mobile-resolution copy, a low-data copy, a review preview, and an
audio-only edition. External editors (e.g. Premiere Pro, Filmora) remain
integration/export targets to evaluate rather than hidden runtime
dependencies; HeartWord retains the project timeline and provenance as its
own source of truth.

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

- the application architecture (e.g. a browser-based app with an AI
  assistant integrated into it, versus a stand-alone editor calling an AI
  assistant through an API);
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
  influences.
