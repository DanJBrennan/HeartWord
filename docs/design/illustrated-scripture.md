# Illustrated Scripture (HeartWord Illustrated)

## Status and Priority

Illustrated Scripture — comic-style pages, called **HeartWord Illustrated**
(see Naming and Branding in `docs/PRODUCT_VISION.md`) — is part of
HeartWord's architecture, but it is explicitly **lower priority than
HeartWord Films** (the video lane). This document records a mature strategy
recovered from a prior attempt's illustrated-Scripture work on Mark and Acts
(under the working name "Hatam Bible Comics"), so the strategy is not lost
even while active development stays focused on video. When Illustrated
Scripture work resumes, start here rather than re-deriving the approach from
scratch.

The prior attempt's actual assets — approved pages, character reference
sheets, and its own scripts/tooling — are a separate, later question (which
subset to import, and in what form); this document is about the *strategy*,
not about carrying the old codebase over.

## Core Strategy: Heart-Language-First, Textless Art, Deterministic Overlay

Three decisions anchor everything else:

1. **The heart language is the layout authority.** Build and approve pages in
   the heart language (e.g. Hatam) first. Other languages (English reference,
   other regional languages) are derived editions produced *after* the
   heart-language layout is approved — not the other way around.
2. **Generate artwork with no readable text at all** — no letters, labels,
   captions, speech text, or decorative writing anywhere in the generated
   image. Text (dialogue, narration, section headings) is added afterward
   through a **deterministic overlay step**, not baked in by the image
   generator. This keeps text spelling and translation accuracy entirely
   under HeartWord's control instead of at the mercy of an image model's text
   rendering, and lets the same artwork serve multiple languages.
3. **Never compress Scripture to fit a page budget.** If a passage needs more
   pages to stay readable and word-for-word, use more pages — do not shrink
   type past a legibility floor, and do not omit causal narrative actions
   merely to save space.

## Evidence-Based Pagination

Rather than guessing an overall page count, derive it from the actual text:

1. Extract the exact word count per chapter from the approved source text.
2. Pick a words-per-page ceiling (a hard maximum) and a preferred
   words-per-page density (more comfortable than the ceiling).
3. The ceiling divided into each chapter's word count, rounded up per
   chapter, gives a **planning floor** (the minimum pages that could possibly
   work); the preferred density gives a **comfortable working budget**.
   Always plan and communicate both, as a range, not a single guessed number.
4. For a long book, split it into balanced parts along a natural narrative
   arc boundary (not at a forced equal-page split).

Panel density per page should also be tied to word count, not a fixed layout
template: default to two panels, allow three when word count is still
comfortable, and only reach for four panels below a firm low-word-count
threshold and after a font-size floor is confirmed to still hold — see
Lettering below. This keeps every page visually breathable regardless of how
verbose a given passage's heart-language reading is.

## Character Canon for Illustrated Pages

See `docs/design/canonical-characters.md` for the general canon strategy
(recognition hierarchy, naming-safety, and the candidate-review workflow for
evolving a character without breaking continuity). Two things specific to
illustrated pages:

- Reference sheets used for character consistency should contain *only* the
  character(s) — no story action, no speech bubbles, no background scene —
  so they function purely as an identity anchor for prompting.
- A comic scene prompt should explicitly name which reference sheets are in
  play, state the setting/mood/composition, and explicitly instruct the
  generator not to redesign the characters — treat "preserve the established
  design for each recurring character" as a standing instruction on every
  scene prompt, not something to restate from scratch each time.

## Speech Balloons and Lettering: The Letterer's Principle

The core idea, worth stating on its own: **the lettering system must behave
like a professional comic letterer composing the page, not a script that
draws an oval, inserts text, and adds a pointer.** Every panel is planned as a
whole composition — speaker positions, gaze directions, gestures, and
available negative space — before any balloon shape is finalized. Geometry
serves storytelling; it is not the goal.

Concretely, that principle cashes out as a set of durable rules:

- **Protect the art.** Never place a balloon over a face, eyes, mouth, a
  meaningful gesture, or a central story object (a healed person's body, a
  symbolic object) merely because that region happens to be empty. Prefer
  open sky, calm water, plain walls, or unoccupied ground for balloon
  placement.
- **Proximity before tail length.** Search for a placement close to the
  speaker first; only then compute the tail. A balloon should feel attached
  to its speaker, not tethered to one from across the panel.
- **Balloon shape follows the text**, not a fixed template: a short reply is
  a small, close, short-tailed balloon; a long teaching passage may be large
  and asymmetrical, placed in real negative space, without shrinking type
  past a comfortable size. Target roughly 68-78% interior ink occupancy —
  full enough to belong on the page, not so full that letters crowd the
  border.
- **Tails taper continuously** (an organic "horn" shape narrowing steadily
  from base to tip) and point at the mouth or lower face, never crossing
  another face, another balloon, or text. A long, constant-width tail with a
  small point at the end is a defect, not a style choice.
- **Narration is a visually separate system from dialogue**: rectangular
  (not organic), a distinct fill color, left-aligned, no tail, placed as
  stable editorial architecture along edges or margins rather than
  competing with the action. Section-heading treatments (e.g. a bar or a
  plaque) should be visually distinct again from both dialogue and
  narration, so a reader distinguishes scene title, narration, and speech
  instantly with no legend required.
- **No speaker-name prefixes or name labels anywhere in the art** — identity
  comes from art and continuity, never from a text label. Use a display
  ellipsis (not a comma that would alter approved wording) where a narration
  line hands off directly into quoted speech.
- **Multilingual layout preserves compositional intent, not exact
  geometry.** Do not force one fixed balloon size across languages: a longer
  translation needs its own rewrap, resize, and tail recompute; a shorter one
  needs its own shrink, rather than leaving a large empty shell sized for a
  different language. Every language gets its own fitting pass from the same
  underlying composition.

## Lettering Architecture

The strategy that worked: keep generated artwork completely separate from an
editable, per-language lettering layer, so text can be corrected or
retranslated without regenerating art.

- Store, per page: the artwork (unchanged once generated), a panel/geometry
  model with protected regions (faces, key objects) and candidate
  negative-space regions, a speaker/reading-order model, and then a
  **separate lettering layer per language** — its own layout data, its own
  rendered overlay, and its own validation report.
- Treat a generated overlay as a draft to be checked, not a finished result:
  render it, inspect the actual rendered page, score it against the rules
  above, and revise before accepting. **A successful render is not the same
  thing as a visually successful page** — this is the same principle behind
  the evolving, learned review criteria in
  `docs/design/automated-quality-control.md`, applied specifically to
  lettering.
- Keep a running, growing log of concrete defects found in production (a
  character rendered at the wrong scale, a corrupted hand or face, an
  inconsistent narration box size) as durable rules that feed back into
  review — the same "evolving assessment criteria" idea from
  `docs/design/automated-quality-control.md`, grounded in real examples from
  this lane's own production history.

## Page and Book Verification Workflow

A page should move through explicit, recorded stages rather than jumping
straight from "generated" to "approved":

- **Page-level:** generated -> text verified (narration and dialogue extraction
  matches the approved source) -> speaker verified (each balloon's
  attribution matches the visible speaker) -> canon verified (characters
  still match canon, no drift) -> approved -> prepared for each delivery
  target.
- **Book-level:** source audit -> storyboard ready -> character library ready
  -> page generation -> page verification -> page approval -> delivery
  packaging (per target) -> notifications.

Do not scale a book to full production before one representative chapter has
cleared this whole pipeline end to end — the same "prove it on a
representative unit before committing to the whole" approach `docs/PRODUCT_VISION.md`
uses for the video lane's own production goal.

## Delivery Streams

Support more than one output target per book, since illustrated Scripture
may be consumed on a phone screen, printed, or both:

- A **digital-first** stream: lower-resolution, screen-oriented (e.g. a
  portrait page sized for comfortable phone reading), delivered as a digital
  document.
- A **print** stream: higher-resolution, print-oriented (e.g. A4 or a
  print-on-demand trim size with bleed), producing print-ready page images
  and assembled PDFs (full book, interior-only, and separate front/back
  cover) when a physical edition is wanted.

Print packaging is optional and comes after digital approval, not before —
digital-first keeps the loop fast while a physical run is a deliberate later
step.

## Relationship to HeartWord Films

Illustrated Scripture and the video lane share the same underlying Scripture
text, audio, and character identity, but are different visual systems built
for different media. The prior attempt's direction — and a reasonable
default here — was: the illustrated canon is the first-approved identity for
a character, and the video canon is a derived, "slightly more realistic"
translation of that same identity for on-screen video use. The video canon
must not redesign or contradict the illustrated canon, and should retain a
visible link back to it. See the open question in
`docs/design/canonical-characters.md` about whether HeartWord keeps this
same two-canon relationship or unifies them.

## Open Questions

- Which subset of the prior attempt's assets (approved pages, reference
  sheets, prompt templates) get imported, and in what form.
- Whether HeartWord rebuilds its own lettering engine or adapts the prior
  attempt's approach at the implementation level.
- Whether comic production uses its own storyboard or a derived view of the
  video storyboard (also listed as open in `docs/PRODUCT_VISION.md`).
- How the words-per-page ceiling and panel-density thresholds should be
  tuned per language, since heart-language text can run substantially longer
  or shorter than an English reference for the same passage.
