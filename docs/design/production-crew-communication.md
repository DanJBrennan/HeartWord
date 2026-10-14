# Production Crew Communication Protocol

## Status and purpose

This is HeartWord Studio's authoritative production-role contract. It serves
the producer workflow: verified Scripture, source audio, and approved regional
canon enter a chapter; bounded, inspectable proposals and reviews lead to a
producer-reviewed film. Runtime labels in the application state what is
implemented; this document does not turn every named role into a live worker.

Every operation uses an immutable chapter brief: source/reference hashes,
measured source audio, approved canon and versioned assets, accepted media,
scoped producer decisions, spend/retry bounds, and prior evidence. Every
contribution records owner, input versions, verse/audio/shot scope, rationale,
evidence, status, and destination. No role may alter verified Scripture,
source performance, approved canon, producer holds, or another role's record.

Each newly reported finding or production-director verdict also records an
uncalibrated 0–100 agent confidence estimate and its limitations. This is
specific to that claim, distinct from severity and evidence, and helps the
next reviewer decide what to investigate. It is never a vote, an authority
ranking, a calibrated probability, or a way to waive source/canon/cost/human
gates. Legacy records without the fields remain “not reported.”

## Roster and authority

The nineteen production roles are Mabel (Production Coordinator), Rufus
(Creative Director), June (Source and Alignment Specialist), Miriam
(Scripture and Cultural Reviewer), Dottie (Casting and Canon Steward), Pippa
(Storyboard Planner), Leon (Cinematographer), Tessa (Choreographer), Arlo
(Production and Staging Designer), Costume Designer, Lighting Designer, Orion
(Script Supervisor / Continuity Reviewer), Gus (Generation Specialist), Vera
(Media Quality Reviewer), Kit (Dialogue / Lip-Sync Specialist), Nell (Picture
Editor), Sam (Sound Designer / Mixer), Composer, and Colorist. Costume,
Lighting, Composer, and Colorist are unnamed role specialists. Benny is
historical presentation material only; Nell and Mabel direct assembly, render,
encode, and package tools.

Mabel owns run state, idempotency, finite retry/cost gates, stale-work
invalidation, recorded handoffs, and escalation—not creative, Scripture,
canon, or release decisions. Rufus resolves bounded creative tradeoffs but
cannot waive evidence. Ada (fidelity), Theo (viewer clarity/dramatic impact),
and Cora (feasibility/cost/scope) are independent milestone challengers; they
advise and can raise evidence-backed holds, never dispatch work. Gene Siskel
and Roger Ebert are optional presentation-only critics with no production
authority.

## Required handoffs

1. June, Miriam, and Dottie establish source/alignment, fidelity, and canon
   readiness. Missing source, unapproved canon, or unresolved ambiguity is a
   producer hold.
2. Rufus supplies a passage-grounded treatment. Pippa coordinates Leon,
   Tessa, Arlo, Costume, Lighting, and Orion into a shot plan. Miriam and June
   review it; relevant challengers review material changes.
3. Mabel records proposal → objection → revision → resolution and dispatches
   only an accepted, versioned packet. Gus prepares or executes only
   authorized provider work; cost is reserved, results are idempotent, and
   failures never silently retry.
4. Vera reviews asset compliance; Orion reviews continuity; Kit reviews
   applicable speech treatment/sync; June retains source-alignment ownership.
   Repairs return to the accountable owner, never directly from a reviewer to
   a provider.
5. Nell assembles accepted coverage while preserving source performance; Sam
   mixes with speech priority; Composer and Colorist submit bounded parameters.
   Miriam, Orion, Vera, and milestone challengers review meaningful rough-cut
   changes. Human language/field/release approval remains with the producer.

## Learning from corrections

A producer correction is retained with source note, project, language, book,
chapter, regional canon and approved canon-version context. One bounded
text-model call may propose a reusable principle; it is inactive until the
producer inspects, edits if needed, and activates it. Failed synthesis is
visible and never retried silently. Editing creates a superseding lesson and
keeps prior lesson/action history.

Accepted lessons are application memory, not model training. They are supplied
only to matching briefs: chapter/scene/shot lessons remain in their actual
project and target; book, language, and region lessons must match stored
context; global scope requires explicit producer activation. Disabled and
superseded lessons are history. A brief displays exactly which accepted lessons
were supplied, including scoped target.

## Runtime truth

The [FDL v2 design](film-description-language-v2.md) defines proposed shared
meaning beside prose, with canonical owner IDs and immutable input/context
references. It does not add a property to today's crew contracts or turn
declared roles into live workers. Runtime integration would extend the same
saved briefs, contributions, review/objection records and producer controls;
manual/autonomous operation must not acquire separate mutable FDL authorities.

Continuous-speech handoff (2026-10-14): the saved brief carries confirmed run
scope and honest internal verse timing beside individual source intervals,
plus exact shot utterance windows and independent timing evidence in retained
history. June's broad speaker attribution is not Kit's phrase-timing proof.
Pippa/Leon/Nell may change coverage under continuous speech without requesting
soundtrack splits at ordinary verses. Source-supported emotional performance
changes need their own exact evidence; a safe internal pause additionally needs
reviewed boundary evidence. Manual controls and autonomous stages read the same
saved confirmations. Role runtime classifications and authority stay unchanged.

Current bounded implementation persists crew contributions, handoffs, source
and canon validation, timing gates, producer corrections, and monitor events.
The monitor shows only recorded events and full saved structured output; it
does not expose hidden reasoning or presentation dialogue. A later-resolved
hold is historical rather than a permanent current alert. No runtime claim
authorizes generic unimplemented stages, paid generation, or human-approval
substitution.

Avatar direction handoff (October 14): Kit/Tessa/Rufus's source-grounded acting
intent and Gus's verified baseline/override settings use the same saved
`set_avatar_performance` edit-history packet for related shots, manual API
controls and stage5. Existing exact source/voice bindings remain controlling;
English supplies semantics rather than Hatam phrase timing. Requests retain
actual supported parameters and submitted audio separately from desired acting
and unreviewed results. Required unsupported controls, changed bindings and
unreconciled/outstanding charges hold before Avatar spending. This adds no
live Mabel/Your dot worker, routine chapter-plan signature, external notification
transport or general FDL parser. See the [evidence and limits](../production/KLING_AVATAR_DIRECTION.md).

Dan subsequently approved the recovered warm/gentle prompt as the preferred
baseline for most neutral/positive speech. The shared crew guidance and Avatar
compiler now use that preference for explicitly eligible saved treatments;
rebuke/anger/grief/fear and uncertain passages cannot silently inherit a smile.
Rufus/Tessa/Kit retain source-grounded treatment and exception reasons. Existing
prompt overrides take precedence, and no role may infer Hatam timing, alter the
recording or regenerate accepted media merely to adopt this preference.
