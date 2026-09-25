# Automated Quality Control

## Scope

Automated checks that run across generated media and the assembled chapter
video, to catch obvious problems the pipeline itself can detect (rather than
relying on the user to spot everything by eye), both per-shot as media comes
back from a generation provider and across the whole assembled video before
it's handed to the user for review.

## Automated Media Review (per returned shot)

Whenever a media producer (an image or video generation provider) returns a
result — a cheap draft or a full-resolution final, see
`docs/design/media-generation.md`'s Draft Room — HeartWord should
automatically examine it for:

- **Adherence to the request.** Does the returned media actually reflect
  what the shot asked for: the correct characters present, the specified
  action/blocking, and the intended camera framing?
- **Exact planned moment.** Does the image preserve the shot's causal state,
  rather than substituting a visually plausible adjacent event such as an
  arrival for a reaction shot?
- **Tone alignment with the Scripture passage.** Does the shot's emotional
  register match the passage being depicted (for example, not rendering a
  solemn passage comically, or a joyful passage somberly)?

Rather than relying on one fixed checklist, HeartWord should build and
evolve its own set of assessment criteria over time: track patterns in what
human reviewers approve versus reject, and refine the automated criteria used
for future review accordingly. This is meant to be a learning/adaptive
rubric, not a static one — closer in spirit to the Story Validator's retained
scoring rubric in `docs/PRODUCT_VISION.md` than to a hardcoded checklist.

Good seed dimensions for that rubric, beyond the two above — not a fixed or
complete list, but concrete enough to start from rather than inventing
criteria from nothing: canonical likeness (does the character actually match
their approved reference, not a generic look-alike), correct characters
present and no extras invented, plausible mouth-sync for a lip-synced
close-up, malformed or extra hands/faces, unwanted text or artifacts baked
into the image, continuity with the immediately preceding shot, and coverage
of the requested action without silently dropping part of it.

### Named-character wardrobe continuity

For every named character with an approved visual reference, review must also
compare the candidate's **visible wardrobe directly** to that reference. This
is separate from facial likeness and historical plausibility: garment cut and
neckline, layers and mantle arrangement, locked color-block and bands, visible
tassel/fringe treatment, and visible footwear are continuity facts. A material
visible mismatch fails the character-continuity gate and cannot be accepted;
an obscured wardrobe may be recorded as not visible, but a malformed or absent
assessment is held for review rather than silently passing. The result must
name the concrete drift so the next generation can correct it.

When review yields a verdict, it should resolve to one of a small set of
concrete outcomes rather than a bare pass/fail: accept, retry with the same
prompt (useful for a provider's own generation variance), retry with a
modified prompt, escalate to a different provider or tier, or hold for human
review. This gives the Draft Room's iteration loop
(`docs/design/media-generation.md`) something concrete to act on
automatically rather than stopping at "this draft looks wrong."

This review is especially valuable at the cheap draft-tier stage: catching an
off-tone or off-request draft before it's escalated to an expensive
full-resolution render protects the cost-governance model in
`docs/PRODUCT_VISION.md`. It should also run on full-resolution finals as a
last check before assembly.

As with other automated judgments in this project (see the Source Material
Validator's 0-100 assurance-score model in `docs/PRODUCT_VISION.md`),
automated media review should express a confidence level and hold uncertain
results for human review rather than silently approving or rejecting
borderline results. This connects directly to the Image Validator and Video
Validator stages in the staged production workflow.

A held-for-human-review result is a candidate producer-notification
event — see `docs/design/notifications.md`.

## Candidate checks (assembled video)

### Whole-cut editorial review rubric (implemented)

The existing Stage 7 finishing review now requires the Picture Editor to
return a timestamped verdict for each of eight reusable questions before a cut
can be approved: repeated stills/takes or long unvaried angles; face-readable
coverage when a named character speaks; a listener or second character visibly
mouthing the active speaker's words; frozen action or awkward holds; approved
canon and spatial/staging continuity; intended wordless pauses with
appropriate ambience; and implied emotion expressed through passage-grounded,
nonverbal reactions without an invented event or generic synchronized celebration;
and a planned chapter-ending handoff without a stray frame, missing final speech,
geographic jump, or premature next-chapter action (not applicable if none is planned).
Each verdict is `clear`, `concern`, `unverified`, or
`not_applicable`, with evidence and a requested change. Concern or uncertainty
holds automatic approval; an absent checklist is an incomplete review.

The saved timeline also supplies deterministic *review targets* for long
consecutive placements of one shot, a shot reused three or more times, and a
planned wide lip-sync framing. These are leads for inspecting the actual
audiovisual cut, not evidence that the picture is defective. A compressed
review proxy cannot certify exact Hatam word boundaries, sample-accurate lip
sync, or a face's canon identity; those remain separate source/canon gates or
must be reported as unverified. In particular, a dramatic pause may be
suggested only when source timing and producer direction support it; QC never
inserts silence into a source utterance on its own.

- A speaking turn that becomes active again after a substantial pause, then
  ends abruptly on that new onset. Check the actual rendered speech asset at
  speaker changes and chapter end, not at every visual cut; allow a continuing
  same-speaker turn. Hold the affected render before promotion, retaining the
  detected gap, onset duration, level, and source interval IDs for automatic
  source-boundary reconciliation. Do not trim a phrase away to make QC pass.
- Audio/video sync drift across scene boundaries.
- Lip-sync accuracy/confidence per character line.
- Character appearance consistency across scenes (same character looks the
  same).
- Coverage: every line in the source text/audio is represented somewhere in
  the video, nothing dropped silently.
- Scene action doesn't contradict the source text (guards against the "not
  free-form content generation" non-goal in `docs/NON_GOALS.md`).

## Future audience-facing whole-film review pair

After HeartWord assembles a first rough cut, a future two-house review pair
will assess the chapter as a first-time viewer experiences it. This is an
original HeartWord review format, inspired only by the usefulness of a
conversational critic duo; it must not use any real critics' names,
likenesses, voices, trademarks, or imitate any particular people.

- The **Story Critic** assesses first-time-viewer clarity, emotional movement,
  and engagement.
- The **Film Critic** assesses filmmaking craft: shot choices, performances,
  pacing, coverage, transitions, and sound.

They first review the assembled rough cut independently, then produce a short,
producer-visible discussion. Each review reports one strongest success, no more
than three evidence-based concerns with timestamps, and one recommendation:
**ready**, **revise**, or **hold**. The pair should not manufacture criticism
when the cut is working.

This is an audience-facing whole-film assessment, not a replacement for
Scripture review, cultural review, source-fidelity checks, or producer judgment.
It is planned to run once on the first rough cut and again after major
revisions, before final approval. It is a future role/gate only: no current
pipeline stage, provider call, or UI represents it as implemented.

## Reviewed-evidence evaluation

Evaluation cases are producer-adjudicated links to retained project records
(shot, clip, audio segment, review note, or project) and an immutable artifact
hash. They are not inferred from a model verdict. Cases and their human labels
are append-only; synthetic fixtures are explicitly excluded from comparisons.

Use `npm run evaluate:reviewed-evidence -- export <version>` to export a
versioned prediction baseline, `... -- import <version> <json-file>` to add a
validated candidate, and `... -- compare <baseline> <candidate> [held-out-project-id]`
to persist a reproducible comparison. Each prediction must include case ID,
label, evidence, optional confidence/cost, and any training-case provenance.
The comparison reports honest sample counts and insufficient calibration below
five factual cases. Protected source/canon/producer-hold regressions or use of
a held-out chapter in training provenance result in `do_not_adopt`; a passing
comparison only makes a candidate eligible for producer review, never deploys
it or changes authority.

## Open questions

- Which checks are automatable now vs. need a human reviewer in the loop.
- What happens on a failed check — block assembly, flag the scene, or just
  surface a warning to the user alongside the finished cut.
- How the evolving assessment-criteria set is actually stored and updated:
  what counts as a new "criterion," how conflicting human decisions are
  reconciled, and how a producer can inspect or override what the system has
  learned to check for.
