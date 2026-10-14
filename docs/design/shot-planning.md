# Storyboard and Shot Planning

## Scope

How a chapter's storyboard and shot plan actually gets produced: the
book/chapter storyboard hierarchy, the manual trigger for producer-controlled
runs, and the multi-agent process that plans shots by having the film-
production role agents interact with each other rather than one model
deciding everything alone.

## Book-Level and Chapter-Level Storyboards

A storyboard exists at two levels of detail:

- **Book-level (overarching).** Spans the whole book (e.g. all of Mark) at a
  lighter level of detail: the narrative arc, where major turns happen,
  recurring settings and characters, and how chapters relate to one another.
  This exists before any single chapter is worked in detail, and gives every
  chapter's planning agents shared context about what comes before and after.
- **Chapter-level (detailed).** Produced when a specific chapter is actually
  worked on. This is where concrete scenes, shots, casting, staging, and
  camera coverage get decided — informed by the book-level storyboard's
  context for that chapter's place in the larger arc.

Working a chapter should update the book-level storyboard only where the
chapter's detail reveals something that changes the book-level picture (a
setting that recurs differently than assumed, a character introduced
earlier than expected) — the book-level storyboard is a living overview, not
a plan that gets silently invalidated by chapter work.

## Chapter-opening strategy

The first scene's shot planner also proposes a **separate, pre-source-clock**
chapter opening. It is not a verse-timed scene shot and never consumes,
shortens, or retimes the approved Scripture recording.

- Every chapter has the series' 2–3-second title card, using the verified
  source-language chapter title and language name. Its background is a
  darkened frame of the opening establishing view (or the first story view if
  no separate location footage is justified). See `chapter-title-card.md`.
- When the first scene establishes a setting, plan a short wordless progression
  from a wide location view toward the first story space. An arrival view may
  follow directly. A connecting bridge is optional and belongs only between
  two known views whose geography supports the move; its generated first and
  last frames must match those views. Never invent a landmark, route, arrival,
  dialogue, or Scripture action merely to fill an opening.
- Shot count and durations are justified by location clarity, pacing, and
  cost. Mark 3's three eight-second shots are a worked example, not a default
  quota. No location shot is required when the first scene has no grounded
  location to establish; that case remains visible for review.
- The card and each pre-story shot require audible, appropriate location
  ambience, not generated speech. The complete source recording starts with
  the first verse-timed picture after the opening. Assembly/QC must verify
  continuous audio, the visual seams, and the exact source-clock offset.
- Reusable footage is a discovery candidate, not an automatic timeline
  selection. Location, approved regional canon, continuity, target-shot fit,
  and provenance must pass the normal reuse review before assignment.

The chapter-level plan records each shot's purpose, exact grounding phrase,
duration, ambient-audio requirement, endpoint constraint, unassigned media
state, and the calculated source-clock entrance. In v1 it is stored separately
from `shots` in `chapter_intro_plans` and shown beside the storyboard. This
planning record does not itself generate or approve footage; media generation
and assembly must fulfill it through their existing reviewed stages. An
ungrounded or malformed proposal is held for review rather than silently
turned into a forced three-shot opening.

## Chapter-ending handoff

The last scene's planner also reads the **verified first English-reference verse
of the next chapter**, when it exists, to consider a separate wordless ending
after the current chapter's complete source performance. This is not another
verse-timed scene shot. It may propose zero to three 3–8-second shots that
connect the present setting to the next opening through a departure, journey,
or destination hint. Each shot records exact evidence from both chapter
boundaries, a reason, duration, ambience/optional score, and unassigned media
status. The inferred travel or recognition is labelled visual staging, not
Scripture. No route, crowd, aerial, or fixed duration is obligatory. The next
chapter's actual teaching, dialogue, boat use, or other action waits for its
own source recording; the ending may orient viewers but may not consume it.

The plan is retained in `chapter_ending_plans`, supplied to the existing
creative crew, and displayed beside the storyboard. Missing next-chapter
source evidence or invalid citations hold the handoff for review instead of
silently inventing a location. Its last image should be considered alongside
the next chapter's opening strategy for geographic/visual continuity. Generated
media and music remain candidate-only under their normal gates, and assembly
must confirm the source recording plays fully before any post-source tail.

## Manual Trigger

Alongside the autonomous default (HeartWord proposes a storyboard and shot
plan on its own, per `docs/PRODUCT_VISION.md`'s Product Behavior and Quality
Standard), the UI should provide an explicit **"Create Storyboard"** action
for a chapter, for when the producer wants to control exactly when and for
which chapter that work happens rather than relying on an automatic run. The
action's result is the same chapter-level storyboard described above,
whether it was triggered automatically or manually — manual operation is a
different trigger, not a different output.

## Implied Emotion within the existing shot plan

Continuous-speech update (2026-10-14): a confirmed run supplies the speaker,
covered verse range and exact outer audio bounds, while its internal verse
timing remains approximate/unresolved. Scene headings and picture changes may
cross that range without splitting the soundtrack or prompting for each verse's
exact word boundary. A confirmed run spanning a narrative scene heading supplies
its speaker to both scenes. It does not turn the heading into an audio edit.
Initial casting marks such coverage as needing an exact performance/phrase
window rather than claiming the whole speech's duration belongs to each verse
shot. Coverage-manifest construction uses saved exact shot bindings and reports
`needs_exact_interval` for unbound run/partial-range timing; existing generated
or accepted beats are retained. June owns attribution/alignment evidence, Kit
consumes exact performance windows, and Nell changes picture under continuous
audio. Emotion inference alone cannot provide phrase timing or authorize a pause.
See [audio and speakers](audio-and-speakers.md).

The shot planner treats emotion as an inference about **how people respond to
an event the passage already supplies**, not as permission to add an event,
line, or theological claim. For every scene its saved reasoning identifies
the textual trigger, the people affected, the emotional progression, the
intended intensity, and any uncertain interpretation. Shot actions make the
response filmable through specific facial, hand, body, or group behavior.
The source-grounded reasoning and shot action are the v1 record; this does
not create another pipeline stage or a separate emotional soundtrack.

After a healing, for example, the healed person may first be stunned and
then cautiously test restored movement before showing amazement. Nearby
witnesses may react at different moments with looks, breath, gasps, or
restrained applause. An opposing group may respond with visible frustration
and depart where the text says it does. A broad celebration or dance is a
passage-specific proposal for cultural and producer review, not a default
assumption about a people group. Contrast should preserve the scene's next
narrative turn, not drown it out.

The Director owns the progression; choreography specifies beginning, change,
and end of the physical response; cinematography supplies distinct coverage;
sound design proposes separately controllable nonverbal ambience; and script
supervision checks source, canon, speaker, causal order, and scene geography.
Prefer a motivated angle within measured narration coverage to a new clip.
When a short non-lip-sync reaction shot is needed, it follows the existing
generation, cost, review, and approval gates. No reaction may stretch or
replace source speech, show a listener mouthing it, or create intelligible
dialogue. Stage 7 judges the emotional progression on the assembled cut and
holds uncertain or unsupported inferences for producer review.

## Shot Planning as Multi-Agent Collaboration

Each film-production role named in `docs/PRODUCT_VISION.md` (director,
cinematographer, choreographer, costume designer, lighting designer, staging
designer, script supervisor/continuity, colorist, sound designer, composer)
is implemented as its own agent, not folded into one monolithic planning
call. For shot planning specifically, the core participants are the roles
that actually shape a shot: the director (scene purpose and emotional
intent), the cinematographer (framing, camera movement, coverage, light),
the choreographer and staging designer (blocking and action), the costume
and lighting designers (what's visually present), and the script
supervisor/continuity role (keeping characters, props, and exact Scripture
wording consistent with what's already been approved). Colorist, sound
designer, and composer typically engage later, closer to post-production,
but may weigh in during planning when a shot's plan depends on them (e.g. a
shot built around a musical beat).

These agents plan a chapter's shots by **interacting with each other**, not
by each independently proposing in isolation and having the results merged
silently. A director's stated intent for a scene should visibly inform the
cinematographer's coverage proposal; a staging/blocking choice should be
checked against continuity; a disagreement (e.g. a proposed shot the script
supervisor flags as inconsistent with an established character detail)
should be visible as a disagreement and its resolution, not silently
smoothed over.

## Interaction Log

An unresolved disagreement, or a chapter reaching a reviewable state, is
also a candidate producer-notification event — see
`docs/design/notifications.md`.

The full multi-agent planning interaction for a chapter is captured as a log
— who (which role) said what, in what order, including proposals,
objections, and the final resolution — and that log is accessible from the
UI alongside the resulting storyboard, not just the storyboard's final
output. This follows the same reasoning as `AGENTS.md`'s existing principle
that a judgment call about content should log its reasoning so a human can
review and correct it, applied here to the planning conversation itself
rather than only to the pipeline stage's final decision. A producer should
be able to open a chapter's storyboard and see *why* it looks the way it
does — which role proposed what, and how any disagreement was resolved —
not just the final shot list.

### Shared scene-space plan

Before the individual shots for a recurring location are finalized, planning
records one shared spatial-continuity description: the location's relative
scale, stable architectural anchors, and staging zones. This is a
producer-reviewable production reconstruction, not an assertion that
Scripture specifies uncertain architectural details. Each shot records how
its camera relates to that shared space; a close view may deliberately omit
the wider room but may not contradict its scale or geography.

After an earlier view of the scene is approved, later keyframe generations
receive it as a set reference. It preserves room scale and visible anchors,
but is explicitly not a character reference and must not cause people, poses,
or framing to be copied. This gives a chapter continuity even before a
location has an approved archaeological research packet; such a packet may
refine the shared plan later without changing this control.

## Open questions

- How this multi-agent role model relates to the Staged Production
  Workflow's named stages in `docs/PRODUCT_VISION.md` (Story Creator, Story
  Validator, Scene Choreographer): whether each stage internally runs a
  subset of these role agents interacting, or whether the role-agent model
  and the staged-workflow model need to be reconciled into one design.
- How much of the interaction log a producer sees by default (a full
  transcript vs. a summarized version with the full transcript available on
  request).
- How disagreement between role agents actually gets resolved when it isn't
  obviously answered by Scripture text or established canon (a
  producer-decision prompt vs. a deference order between roles).
- Whether role agents are also used outside shot planning (e.g. during
  review of generated media, tying into
  `docs/design/automated-quality-control.md`) or are scoped to planning only.
