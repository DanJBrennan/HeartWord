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

## Manual Trigger

Alongside the autonomous default (HeartWord proposes a storyboard and shot
plan on its own, per `docs/PRODUCT_VISION.md`'s Product Behavior and Quality
Standard), the UI should provide an explicit **"Create Storyboard"** action
for a chapter, for when the producer wants to control exactly when and for
which chapter that work happens rather than relying on an automatic run. The
action's result is the same chapter-level storyboard described above,
whether it was triggered automatically or manually — manual operation is a
different trigger, not a different output.

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
