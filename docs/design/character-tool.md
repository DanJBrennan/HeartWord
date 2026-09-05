# Character Creation & Editing Tool

## Scope

The tool where canon characters are created, completed, and maintained —
headshots, body/pose references, voice mapping, and approval — as a
first-class part of HeartWord rather than an ad hoc side process (BVET's
canon character library was only partially complete, built up informally).
This doc covers the tool's workflow and UI surface. See
`docs/design/canonical-characters.md` for the identity rules — recognition
hierarchy, naming/identity safety, non-destructive evolution — that this
tool exists to enforce, not duplicate.

## Character Record

- A name.
- An approved headshot, built for close-up lip-sync work.
- Multiple body/pose reference images covering different shot types (e.g.
  wide, action, group).
- Voice mapping — only for a character that has spoken lines in at least
  one scene. A non-speaking character (a crowd extra, a silent bystander)
  has no voice field to fill in at all, not just an empty one. For a
  speaking character: a dropdown selection against available voice
  provider IDs (e.g. ElevenLabs), with a live audio test so the producer
  can hear the assigned voice before approving it.
- Version, approval status, and provenance, consistent with the rest of
  HeartWord's asset model (see Assets, Versions, and Portability in
  `docs/PRODUCT_VISION.md`).
- Membership in exactly one active regional canon at a time (e.g. Papuan) —
  see canonical-characters.md; a character's assets are not shared across
  regional canons.

## Starting a New Character

When the producer starts a new character, HeartWord proposes a starting
description/prompt rather than presenting a blank page, informed by:

- the character's role in the source text (e.g. a fisherman disciple vs. a
  religious authority) — see Story and Shot Planning and Canon Builder and
  Voice Approval in `docs/PRODUCT_VISION.md`;
- the active regional canon's established look (existing approved
  characters, so a new character reads as part of the same visual family);
- the recognition-hierarchy and naming-safety rules in
  canonical-characters.md, so a proposed design doesn't already collide with
  an existing character's silhouette or a confusable biblical name.

The producer refines that starting point rather than writing a description
from scratch. Approving the initial headshot and body/pose set is what
creates the character's canon-locked v1 record.

## Gap Detection and Fast Completion

When shot planning needs a character that doesn't yet have an approved
asset in the active regional canon, HeartWord should surface that gap
directly and block generation for that shot — never silently substitute
another regional canon's asset (see Visual World and Character Direction in
`docs/PRODUCT_VISION.md`). The gap should link straight into this tool,
pre-filled with the AI-proposed starting description above, so closing a
canon gap is a fast, in-context action taken from the point where it
blocked production, not a separate offline task the producer has to
remember to come back to.

A missing voice mapping is its own gap, separate from a missing visual
asset, and is only ever raised for a shot where that character actually
speaks. A character can be fully visually approved and still block
generation later purely on voice, the first time a scene gives them a
line — that's expected, not a sign the character record was incomplete
before.

This is expected to be the tool's most common real use: the canon started
only partially complete, and it keeps growing one gap at a time as new
chapters surface characters that don't have approved assets yet.

## Evolving an Existing Character

This tool is where the non-destructive candidate-review workflow in
canonical-characters.md is actually used, not just described: generate a
"v2" candidate alongside the existing approved version, review the two
side by side against the recognition-hierarchy and naming-safety criteria,
and promote the candidate only if it's clearly better. The existing
approved version is never overwritten, and both stay available so a
promotion can be rolled back.

## Voice Mapping and Live Test

- Applies only to characters with spoken lines. Most named characters in a
  given chapter will need this; most crowd/background characters won't —
  the distinction is whichever the source text and scene breakdown actually
  attributes speech to, not the character's prominence.
- The voice dropdown lists ElevenLabs' available voices (v1's confirmed
  voice provider, 2026-09-05) for the character to audition and choose
  from.
- A live audio test plays that character's own Hatam line, re-voiced via
  ElevenLabs' voice-changer (speech-to-speech, not text-to-speech -- it
  re-voices the real narrator's original recording rather than
  synthesizing Hatam from text, since no Hatam TTS model exists) in the
  candidate voice, before the producer approves it -- so a voice/face
  mismatch is caught by ear against the character's actual line, not
  guessed from a provider ID or a generic sample.
- Existing voice assignments recovered from prior BVET-Data work (see Audio
  Model in `docs/PRODUCT_VISION.md`) should be reviewed and reused through
  this same mapping rather than reassigned from scratch.
- Collective/crowd lines may be voiced by a single representative speaker
  while the rest of the group is shown reacting silently (see Canon Builder
  and Voice Approval in `docs/PRODUCT_VISION.md`) — that representative
  speaker is the one who gets a voice mapping, not the whole group.

## Open questions

- What "approval" requires in practice today, given HeartWord is a
  single-producer tool for now (see Field Review Before Distribution in
  `docs/PRODUCT_VISION.md`) — versus whether a future reviewer role changes
  that.
- Whether body/pose reference images are generated up front for every shot
  type, or generated on demand the first time a given shot type is actually
  needed for that character.
- How many body/pose references count as "enough" for a character to be
  usable in generation, versus a minimum viable set that gets extended
  later as new shot types come up.
- Whether/how a character's regional-canon membership can change (e.g. the
  same biblical figure needed in a second regional canon later) without
  duplicating or losing identity/version history.
