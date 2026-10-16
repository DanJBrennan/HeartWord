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

### Micro-clip / flash guard (implemented)

A **flash candidate** is any contiguous visual run of five encoded frames or
fewer (at the chapter's declared frame rate). It becomes a **flash** only when
the final encoded picture is visually discontinuous from both of its immediate
neighbours. A short tail continuing the prior close-up, or a short head that
continues into the next shot, is valid coverage and must pass.

Normal assembly and editorial rendering run the post-render rapid-scene-cut
audit before promotion. It samples the encoded boundary frames and holds only
the candidates that break continuity on both sides. The similarity floor is
calibrated to tolerate continuous camera or subject motion, rather than
mistaking motion for a new scene. Its findings are a
hold/review signal, not authorization to modify Scripture, source audio, or
the edit automatically. The remedy remains intentionally not automatic:
extend adjacent approved coverage or request a producer-reviewed repair; do
not invent, duplicate, or freeze picture simply to clear the gate.

### Post-render scorecard recurrence gate (implemented)

Every held chapter render is assessed by the deterministic scorecard gate before
promotion. It holds—not repairs—the cut when any of the following is present:
discontinuous flash candidates, near-frozen three-second-or-longer shots,
non-adjacent duplicate candidates, unintended sub-1.5-second inserts after
declared storm-impact exemptions, a within-scene colour discontinuity, a named
previously repaired defect that has recurred, a program minute whose 10th-percentile
short-term ambience is below -46 dB, editorial breaths outside their audible
target range, or a delivery
audio rate other than 48 kHz. The gate takes its facts from the reproducible
render analysis and records why the cut is held. It does not replace source
audio, extend shots, or generate media. Set-reference and performance-window
checks are input-plan gates: before a provider request,
`assertPerformancePlanReady` requires a new speaking image to cite the exact
approved set-reference attempt for its scene and requires its source window to
begin at the end of, and end at the start of, attested source pauses of at
least 250 ms. A failed plan is held; the gate never trims wording or silently
substitutes a different set.

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

Advance-treatment extension (October 14): for new plans with an accepted
emotional treatment, Nell additionally returns `emotionalBeatChecks`, one
actual-cut timestamped effect assessment per accepted beat. Missing, duplicate,
foreign or unverified beat evidence cannot approve a cut. Sam and Composer
return treatment verdicts for scene fit, cue transitions/levels/releases,
speech priority and mobile listening clarity. These extend existing finishing
contributions, findings and holds; the eight-item rubric remains intact.
Metadata and scripted fixture replies do not establish dramatic success or
real-phone approval. Existing accepted treatment/run/hash accompanies the cut.

New soundtrack listening reviews also require `speechDetected=false`, separate
from `intelligibleSpeech=false`: unintelligible voices/gibberish remain speech
and hold ambience/music admission. Historical accepted sound assets are not
retroactively relabelled. Source/cast speech stays independent of these assets.

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

## Bounded production craft feedback (October 15 implementation)

This extends the existing crew runs in stages 3, 6 and 7. Nell, the executable
Picture Editor who already owns whole-cut editorial assessment, owns the craft
rubric. Her existing call follows the other production specialists, before the
independent challengers and Production Director. Theo remains an independent
clarity challenger. Vera remains declared; presentation-only critics acquire
no production authority. The future audience-facing pair below remains proposed.

Three kinds of evidence stay separate:

| Record | Meaning / authority |
|---|---|
| `acceptanceChecks`, deterministic checks, specialist findings and retained objections | Non-negotiable source wording/order/speed, safe pause/coverage, approved canon, producer decisions and applicable prerequisite gates. Failed/unverified checks hold; scores cannot compensate. Director `clear` cannot waive an independent check. |
| Nell's `craftAssessment` | Five evidenced ordinal judgments and up to three creative findings routed to accountable production owners. These can request a bounded revision, never dispatch a paid repair. |
| Dimension/finding confidence and limitations | Uncalibrated certainty in the particular claim; not quality, severity, weight or audience approval. Missing observations stay unscored. |

`heartword-craft-v1` assesses clarity, emotional development, pacing,
continuity of presentation, and feasibility with equal 20% weights. Scores
are 0 seriously ineffective, 1 weak, 2 mixed, 3 adequate for stated intent,
4 strong. Exact-source and canon continuity remain hard checks independently
of creative flow. Each dimension retains evidence, shot IDs, optional actual-cut
timestamps, confidence and limitations. A missing dimension is `null`; it
does not become zero or a renormalized comparable total. Full totals span
0–100, with five points per ordinal step in one dimension.

The [calibration audit](../production/CREATIVE_FEEDBACK_CALIBRATION.md) compares
Dan's recorded rejected/selected work. No producer-adjudicated evaluation cases
or matched numeric craft ratings exist in the inspected production database.
An example target of 3/4 in each dimension (75/100) is **proposed and inactive**.
No numeric cutoff is used to approve, hold or predict audience approval. Nell's
evidence-backed recommendation drives the bounded creative revision request.

Milestones use the existing records and calls:

- Planning: review Rufus's treatment and the specialist storyboard before
  keyframe spending. Existing treatment reviews, objections and generation
  authorization remain controlling; no additional chapter-plan signature.
- Editing/media: Nell examines accepted coverage/assembly intent and up to
  three selected MP4s, totaling at most 18 MiB, within her existing call.
  Captions retain shot/clip IDs and byte hashes and label omitted footage
  unobserved. Existing per-image/per-video QC and its saved notes remain
  separate gates; up to 50 retained chapter-scoped asset-review notes enter
  editing/finishing briefs as evidence, never producer instructions or current
  acceptance. A clip sample does not establish whole-cut pacing or source sync.
- Assembled cut: existing finishing review supplies the actual compressed
  audiovisual cut; timestamps must fit its bounds. Proxy limitations, the
  whole-cut checklist, emotional beat checks, source map and structural gates
  remain. Structural or stale-cut failure also updates the feedback explanation.

Policy comparison and limits:

| Concern | Existing behavior | This extension |
|---|---|---|
| Planning | Initial complete pass + one revision, 15 calls each; UI cap 30 | Same two passes / 30-call ceiling. |
| Editing | Eight-call first pass, five-call revision; UI cap 16 | Same roster and ceiling, at most 13 calls for both passes. |
| Finishing | Ten-call first pass, seven-call second; UI cap 16, autonomous calls capped at 14 | Cap/default becomes 17 for both manual and autonomous review, exactly funding one complete revision. Lower explicit budgets stop before a partial pass. No third pass. |
| Stage 7 cycle | Up to three reviews capped at 14 calls each (42 role calls), eight asset/listening pairs, one mix | Same outer cycle, now at most 51 role calls (3 × 17); nine more potential calls only when evidenced revisions need them and spending gates permit. No additional media generation pairs or mixes. |
| Image retries / gap negotiation | Existing five-correction image ceiling and ten-revision gap negotiation | Unchanged; no new retry budget or paid-image fallback. |
| Money | Existing evidenced per-call bound, reservations, ledger, outstanding-charge reconciliation and $200 cumulative film ceiling | Same gates before each real call; save configured per-call and derived run bound. Missing bound/cost stays unreported and cannot authorize a paid call. Test injection creates no provider spending. |

A new saved crew run requires the assessment and separate acceptance verdict.
An initial acceptable version may receive one creative revision when concrete
findings and the remaining complete-pass budget justify it. Stable finding IDs
route changes to owners. Owners must answer their assigned findings with change
and evidence; other affected roles may cite the same finding for a dependent
adjustment. A substantive creative change must cite retained creative feedback
or an existing explicit owner/objection response. The next review sees the
prior assessment and responses. Malformed, missing or foreign evidence cannot
pass. Existing hard-objection revision behavior remains protected.

Comparisons stay within the same run, milestone, input/media scope and rubric.
Improvement requires at least one higher ordinal dimension with none lower.
Ties, regressions and unscored comparisons are plateaus; ties retain the earlier
acceptable version. After the single possible revision there is no third pass.
Source/canon/producer changes during review still invalidate it through existing
hash/revision checks. A new deliberate run is not an implicit paid retry.

Dan selected **continue the best acceptable version and show the shortfall**
in this chat on October 15. At a plateau or call limit, apply that policy only
when all applicable hard checks and saved objections pass. Hard failure or
uncertain review holds, even when an earlier candidate was acceptable. An
explicit Director hold remains a hold. Best-version selection preserves its
directions, treatment and FDL snapshot; every later event/alternative remains
history. The saved result and existing producer panel show scores, evidence,
responses, selected pass, limits, and why production continued or stopped.
Old records acquire no invented scores or new approvals. Producer edits remain
authorized through their existing immutable-successor workflow; an earlier
assessment is evidence of its own input scope, not a new score for edited work.

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
