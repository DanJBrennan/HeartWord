# Production Crew Communication Protocol

## Approved roster amendment (2026-09-16)

This amendment supersedes earlier descriptions of June as Production Director, Orion as Gemini Analyzer, and Benny as an active Assembly Lead. The production roster is **nineteen roles**: Mabel (Production Coordinator), Rufus (Creative Director), June (Source and Alignment Specialist), Miriam (Scripture and Cultural Reviewer), Dottie (Casting and Canon Steward), Pippa (Storyboard Planner), Leon (Cinematographer), Tessa (Choreographer), Arlo (Production and Staging Designer), Costume Designer, Lighting Designer, Orion (Script Supervisor / Continuity Reviewer), Gus (Generation Specialist), Vera (Media Quality Reviewer), Kit (Dialogue / Lip-Sync Specialist), Nell (Picture Editor), Sam (Sound Designer / Mixer), Composer, and Colorist. Costume, Lighting, Composer, and Colorist are role labels; no personal presentation identity is implied. Benny is retained only as historical presentation material; assembly, render, encode, and package are tools directed by Nell and Mabel.

Ada, Theo, and Cora are independent milestone challengers, respectively for fidelity, audience clarity/dramatic impact, and feasibility/cost/scope. They do not participate in every operation. Gene Siskel and Roger Ebert remain optional presentation-only critics, outside production authority.

### Operating flow and limits

Every operation begins from one immutable, versioned chapter brief: verified source/reference text and hashes, measured source-audio intervals, approved canon/voice references, prior accepted assets and edits, scoped producer guidance, cost/retry budget, and prior findings. Roles may read the scoped brief and write only their proposal, review, or handoff; they may not mutate another role's work. A record always names its source/asset versions, verse/audio scope, rationale, evidence, status, and destination.

1. Mabel verifies prerequisites and schedules a bounded run. June reports source completeness/alignment uncertainty; Miriam reports Scripture/cultural concerns; Dottie reports canon gaps. A missing source, unapproved canon/voice, or unresolved ambiguity is a hold, not a workaround.
2. Rufus sets visual intent. Pippa turns it into speech-measured scene/shot coverage with Leon, Tessa, Arlo, Costume, Lighting, and Orion consulting. Rufus may resolve creative tradeoffs, but cannot overrule a fidelity, source, canon, cost, or continuity finding.
3. At a meaningful treatment or changed-shot milestone, Ada, Theo, and/or Cora independently challenge the proposal. Mabel records proposal → objection → revision → resolution. Persistent blocking evidence goes to the producer; it is never smoothed over by a vote.
4. Gus turns accepted work into provider-ready briefs. Provider execution is a tool under existing authorization, with reserved cost, idempotency key, provenance, and finite retry budget. A stale plan invalidates unspent work; a completed request reuses its result; failures do not cause silent paid retries.
5. Vera reviews returned media independently; Orion checks continuity; Kit checks only approved speech treatment and sync while June retains source-alignment ownership. A repair packet goes to the accountable owner, not directly to a provider. High-risk/failed material can receive a milestone challenge.
6. Nell assembles accepted coverage, preserving the entire source performance and producer edits; Sam mixes with speech priority; Composer and Colorist contribute only bounded reviewed parameters. The rough cut receives Miriam/Orion/Vera evidence and the three independent milestone reviews. Release, human language/field review, and distribution permission remain human/producer actions.

Routine work may proceed under existing recorded authorization and budget; new canon, an unresolved source/cultural issue, a material creative tradeoff, a budget/retry breach, or any release decision pauses for the producer. This is autonomous staged production, not approval on every routine step. Results are resumable and idempotent: stale outputs cannot advance a gate, accepted earlier assets remain inspectable, and manual edits are never silently overwritten.

### Runtime truth

The current crew implementation has bounded specialist planning/editing/finishing calls, persisted contribution logs, source/canon validation, timing gates, and cost-aware audio generation. The full named 19-role roster, multi-role conversation routing, generic `voice-lipsync` stage entry point, and universal milestone-review dispatch are declared operating contracts, not claims that every card is a live runtime agent. No implementation here creates paid production calls or substitutes for human language/field/release approval.

## Status and scope

**Status: approved future-design contract (2026-09-13).** This document
defines how the sixteen named control-room roles will communicate when the
future multi-role production workflow is implemented. It does not create
runtime agents, dispatch work, add pipeline stages, or represent the
supporting-control-room portraits as live participants today.

This protocol serves HeartWord's product goal: turn verified Scripture, its
existing heart-language audio, and approved canon into an autonomous but
producer-reviewable chapter video. It must preserve these authorities:

- Verified Scripture and its associated source audio control content. No role
  may paraphrase, reorder, or add narrative content.
- Mabel, the Deterministic Supervisor, is the sole authority for run state,
  work dispatch, retries, gates, evidence ledger, and escalation. Mabel never
  invents creative or theological content.
- The producer is the escalation authority. A source-faithfulness, cultural,
  canon, safety, or unresolved cost/quality disagreement is a hold for the
  producer, never an autonomous compromise.

It extends the future role-agent collaboration in
`shot-planning.md`, the independently reviewable outcomes in
`automated-quality-control.md`, and the v1 architecture's requirement that
judgment reasoning be logged and inspectable. It does not change the current
v1 simplification: a single casting/direction planning pass and bounded
implemented QC remain the actual runtime behavior until an explicit
implementation decision is made.

## Global operating rules

Each specialist receives read access only to the brief, source, and context
needed for its assigned decision. It writes only its own proposal or report.
Specialists propose; Mabel dispatches, gates, and records; the producer
resolves holds and material tradeoffs.

All communication is structured and logged as one of:

| Message | Purpose |
| --- | --- |
| Brief | A bounded input packet, constraints, prerequisites, and requested output. |
| Proposal | A specialist's bounded recommendation, rationale, and dependencies. |
| Review | Independent evidence against a supplied target specification. |
| Verdict | Pass, revise, or hold evidence at a decision gate. |
| Handoff | An accepted, versioned work package for the next declared owner. |

Normal communication occurs only at these decision gates: treatment, scene and
shot plan, generation readiness, generated-asset review, rough cut, and final
review. Exception communication is allowed only for a conflict, failed QC,
unmet prerequisite, cost or budget limit, or source/canon ambiguity. Roles do
not discuss every message with every other role.

Every record must identify its project, verse/audio scope where applicable,
input versions, owner, rationale, evidence, status, and destination. A
specialist cannot silently repair, accept, substitute, or broaden another
role's decision.

## Role contracts

### Core execution and review roles

| Role | Remit and decision limit | Inputs | Outputs and declared partners | Invocation and escalation |
| --- | --- | --- | --- | --- |
| **Mabel - Deterministic Supervisor** | Sole authority for run state, dispatch, retries, gates, evidence ledger, and escalation. Never creates creative or theological content. | Run intent; structured outputs; status; failures. | Work packets and gates to every role; collects only declared reports and handoffs. | At every gate and exception. Blocks decisions and escalates unresolved matters to the producer. |
| **Rufus - Creative Director** | Proposes dramatic intent, emotional clarity, and treatment. Cannot alter Scripture, canon, budget, or run state. | Passage context; prior reviews. | Treatment/creative brief to Pippa and June; consults Miriam for fidelity and Dottie for cast feasibility. | Treatment gate and material story revisions. Disagreement goes to Mabel, then producer. |
| **Pippa - Shot Planner** | Produces verse-grounded scenes and shot specifications. Cannot invent action/dialogue or authorize generation. | Creative brief; source constraints; canon and casting data. | Requests proposals from Leon, Tessa, Arlo, and Dottie; integrated shot plan to June, Miriam, and Mabel. | Shot-plan gate. Mabel holds source/canon conflicts for producer review. |
| **Gus - Media Generator / Projectionist** | Executes approved generation jobs and records prompts, inputs, outputs, cost, and failure evidence. Cannot choose or revise creative intent. | Approved shot package from Mabel. | Generated assets and provenance to Vera and Orion; lip-sync candidates to Kit. | Generation gate only after Mabel dispatch. Failures return through Mabel to the responsible owner. |
| **Vera - Quality Critic / Inspector** | Checks technical, visual, canon, and brief compliance. Cannot silently repair or accept a failed asset. | Asset plus target specification. | Timestamped pass/revise/hold evidence to Mabel and the owning specialist. | Asset-review gate. Failed assets return through Mabel to the responsible planning or generation owner. |
| **Orion - Gemini Video Analyzer / Timekeeper** | Independently checks motion, action, framing, identity, continuity, and temporal defects. Cannot override source fidelity or a production gate. | Clip plus exact shot specification. | Timestamped findings and repair suggestion to Mabel and Vera. | Asset-review gate. Mabel routes any repair; unresolved source/canon issue is a producer hold. |

### Supporting production roles

| Role | Remit and decision limit | Inputs | Outputs and declared partners | Invocation and escalation |
| --- | --- | --- | --- | --- |
| **June - Production Director** | Owns dependency plan, work-package readiness, cost/time feasibility, and sequencing. Cannot approve Scripture or creative content. | Treatment and shot plan. | Work plan to Mabel; feasibility findings to Rufus/Pippa as needed. | Treatment and shot-plan gates, then generation readiness. Infeasible scope or cost goes to Mabel and producer. |
| **Leon - Cinematographer** | Proposes camera, framing, coverage, lenses/movement, and lighting intent. Cannot change narrative action or cast. | Pippa's shot brief; canon and continuity constraints. | Cinematography plan to Pippa; staging/camera requirements to Arlo. | Shot-plan consultation. Conflict goes to Rufus/Pippa, then Mabel. |
| **Tessa - Choreographer** | Proposes purposeful blocking, movement, screen direction, and physical continuity. Cannot add passage-unsupported action. | Shot brief and cast. | Movement plan to Pippa and Arlo. | Shot-plan consultation. Scripture ambiguity goes to Miriam through Mabel. |
| **Arlo - Staging Director** | Proposes environment, props, sight lines, and spatial continuity. Cannot alter story beats or approved canon. | Shot, movement, and camera requirements. | Staging package to Pippa and Leon. | Shot-plan consultation. Conflict routes through Mabel. |
| **Nell - Editor** | Proposes picture cut, pacing, coverage use, and continuity corrections for assembled material. Cannot alter source sequence/meaning or authorize generation. | Accepted clips and audio timing. | Edit decision list to Benny, Sam, and Mabel. | Rough-cut gate. Material story change goes to Rufus, Miriam, and producer. |
| **Sam - Sound Director** | Proposes narration priority, dialogue clarity, sound effects/music balance, and mix requirements. Cannot replace or alter verified audio. | Audio and edit plan. | Mix notes/assets to Benny and Kit. | Rough-cut gate and lip-sync coordination. A source-audio issue is a hold through Mabel. |
| **Miriam - Scripture Reviewer** | Independently checks exact-text fidelity, narrative meaning, and respectful cultural handling. Cannot direct artistic taste or silently edit content. | Treatment, shot plan, disputed revisions, and rough cut. | Cited pass/revise/hold finding to Mabel and the owning role. | Treatment, shot-plan, rough-cut, and disputed-revision gates. An unresolved fidelity issue holds for producer review. |
| **Dottie - Casting Director** | Matches roles to approved canon and identifies identity/continuity risks. Cannot invent canon or approve an unapproved identity. | Pippa's character requirements. | Cast/continuity package to Pippa, Leon, and Gus. | Shot-plan consultation and generation readiness. A canon gap holds for producer and character workflow. |
| **Kit - Lip-Sync Specialist** | Determines eligibility, exact source-audio alignment, mouth-performance requirements, and sync review. Cannot synthesize or rewrite source-language lines. | Approved shot, audio segment, and candidate clip. | Lip-sync package/QC notes to Gus, Sam, Vera, and Mabel. | Generation and asset-review gates when lip-sync applies. Audio-alignment ambiguity holds. |
| **Benny - Assembly Lead** | Assembles accepted media, tracks versions/provenance, and prepares a reviewable rough cut/export package. Cannot substitute rejected media or make semantic creative changes. | Accepted clips; approved timeline/edit decisions; mix. | Rough cut to Nell, Sam, Miriam, Vera, Orion, and Mabel. | Rough-cut gate. Missing or invalid assets block assembly. |

## Independent Red Team

The Red Team is a distinct future adversarial review layer, not a
production-chain role and not a live runtime interaction. It does not approve,
edit, dispatch, or override Mabel, Miriam, or the producer. Mabel convenes it
only at declared gates and sends its scoped findings to the owning role.

Every Red Team call must return at least one concrete risk, ambiguity, or
verification point. This requires a real checkable concern; it does not permit
fabricated criticism. Findings must be evidence-based, bounded to the supplied
proposal or cut, and identify the relevant verse, audio range, shot, clip, or
production constraint.

| Reviewer | Independent emphasis | Decision limit and outputs |
| --- | --- | --- |
| **Ada Rowe - Scripture Fidelity Challenger** | Tests whether a proposal or cut adds, distorts, omits causally important meaning, or weakens source faithfulness. It complements Miriam's normal review by deliberately seeking failure modes. | Cannot interpret away source controls or approve a result. Returns cited risk/ambiguity/verification point to Mabel and the owner; a material unresolved issue is a producer hold. |
| **Theo Maren - Dramatic Impact Challenger** | Tests viewer clarity, emotional/narrative movement, and whether visual choices communicate the passage rather than merely look attractive. | Cannot replace Rufus's treatment or approve a cut. Returns evidence-based risks to Mabel and the owner; a material unresolved issue is a producer hold. |
| **Cora Bellamy - Production Feasibility Challenger** | Tests generation risk, continuity fragility, cost/schedule exposure, and whether a plan is reliable enough to execute. | Cannot replace June's readiness decision or dispatch work. Returns bounded feasibility risks to Mabel and the owner; a material unresolved issue is a producer hold. |

The Red Team differs from the existing future two-house whole-film review pair.
The Red Team is an adversarial, evidence-scoped challenge before paid
generation and at selected high-risk reviews; the Story Critic and Film Critic
are audience-facing assessments of a whole assembled rough cut. Neither
replaces Miriam's Scripture review or producer approval.

## Stage communication cadence

### A. Treatment gate

1. Mabel dispatches the bounded passage context to Rufus.
2. Rufus proposes treatment and creative brief.
3. Miriam independently checks source fidelity and cultural handling; June
   independently checks feasibility. Mabel convenes all three Red Team
   reviewers for every new treatment.
4. Mabel records the evidence and issues **accept**, **revise**, or **hold**.
   A material disagreement or hold goes to the producer.

### B. Shot-plan gate

1. Pippa receives the accepted treatment and source/canon constraints.
2. Leon, Tessa, Arlo, and Dottie return bounded specialist proposals.
3. Pippa integrates only source-supported decisions into a shot plan.
4. Miriam checks the integrated plan; June checks package readiness. Mabel
   convenes all three Red Team reviewers for every new scene-level creative
   proposal, and only the relevant challenger(s) for a new or changed shot
   plan.
5. Mabel records all evidence and gates the plan. No generation begins before
   the accepted handoff.

### C. Generation readiness and generation gate

1. June creates the dependency, cost/time, and prerequisite-ready packet.
2. Mabel validates prerequisites and dispatches the approved job to Gus.
3. Gus executes without changing treatment or shot intent, recording prompt,
   inputs, output, cost, provenance, and failures.
4. Gus sends generated assets to Vera and Orion, and to Kit only where the
   approved shot requires lip sync.

### D. Asset-review gate

1. Vera and Orion independently issue timestamped evidence against the target
   specification. Kit contributes sync evidence when applicable. Mabel
   convenes the relevant Red Team specialist(s) for a selected high-risk clip
   or a clip that previously failed review.
2. Mabel records the verdict: pass, revise, or hold.
3. A revision returns to the exact responsible planning, canon, audio, or
   generation owner through Mabel; it is never repaired silently by a reviewer.
4. Any source, cultural, canon, safety, or unresolved cost/quality conflict is
   held for the producer.

### E. Rough-cut gate

1. Benny assembles only accepted, versioned media with approved timeline and
   mix decisions.
2. Nell, Sam, and Miriam independently review picture, sound, and Scripture
   fidelity; Vera and Orion may review acceptance/continuity evidence as
   declared by the QC plan. Mabel convenes all three Red Team reviewers for
   the assembled chapter/rough cut before final producer approval.
3. Mabel gathers verdicts. The producer resolves material issues before a
   final handoff.

### F. Final gate

The existing future whole-film Story Critic and Film Critic review the first
rough cut and each major revision independently, followed by their short
producer-visible discussion. Their advice supplements, never replaces,
Miriam's Scripture review, Mabel's gate evidence, or producer approval.

## Declared interaction edge list

This compact edge list is graph-friendly. It is a future contract, not a
claim of live runtime conversation. Edge types are **H** required handoff,
**C** consultation, **R** independent review, and **E** escalation.

| Gate | Type | From -> To | Declared payload |
| --- | --- | --- | --- |
| Treatment | H | Mabel -> Rufus | Passage context and treatment brief request |
| Treatment | C | Rufus -> Miriam; Rufus -> Dottie | Fidelity and cast-feasibility consultation |
| Treatment | H | Rufus -> Pippa; Rufus -> June | Treatment and creative brief |
| Treatment | R | Miriam -> Mabel; June -> Mabel | Cited fidelity review; feasibility review |
| Treatment | R | Scripture Fidelity Challenger -> Mabel; Dramatic Impact Challenger -> Mabel; Production Feasibility Challenger -> Mabel | Evidence-based treatment risks and verification points |
| Treatment | E | Mabel -> Producer | Hold or material disagreement |
| Shot plan | C | Pippa -> Leon; Pippa -> Tessa; Pippa -> Arlo; Pippa -> Dottie | Bounded specialist proposal request |
| Shot plan | H | Leon -> Pippa; Tessa -> Pippa; Arlo -> Pippa; Dottie -> Pippa | Camera, movement, staging, cast/continuity proposals |
| Shot plan | R | Pippa -> Miriam; Pippa -> June | Integrated plan for fidelity and readiness review |
| Shot plan | R | relevant Red Team challenger(s) -> Mabel | Evidence-based new/changed-shot risks and verification points |
| Shot plan | H | Pippa -> Mabel | Integrated verse-grounded shot plan |
| Shot plan | E | Mabel -> Producer | Source/canon ambiguity or unresolved tradeoff |
| Generation | H | June -> Mabel; Mabel -> Gus | Ready work packet; approved generation dispatch |
| Generation | H | Gus -> Vera; Gus -> Orion; Gus -> Kit | Asset/provenance; clip/spec; lip-sync candidate when applicable |
| Asset review | R | Vera -> Mabel; Orion -> Mabel; Kit -> Mabel | Timestamped compliance, video, and sync evidence |
| Asset review | R | relevant Red Team challenger(s) -> Mabel | Selected high-risk or previously failed-clip challenge |
| Asset review | H | Mabel -> owner | Exact responsible-owner revise packet |
| Asset review | E | Mabel -> Producer | Hold for source, cultural, canon, safety, or unresolved quality/cost conflict |
| Rough cut | H | Benny -> Nell; Benny -> Sam; Benny -> Miriam; Benny -> Vera; Benny -> Orion; Benny -> Mabel | Versioned rough cut and provenance |
| Rough cut | R | Nell -> Mabel; Sam -> Mabel; Miriam -> Mabel; Vera -> Mabel; Orion -> Mabel | Picture, sound, fidelity, and QC verdicts |
| Rough cut | R | Scripture Fidelity Challenger -> Mabel; Dramatic Impact Challenger -> Mabel; Production Feasibility Challenger -> Mabel | Independent assembled-chapter risks and verification points |
| Rough cut | E | Mabel -> Producer | Material story, source-audio, or quality hold |
| Final | R | Story Critic -> Mabel; Film Critic -> Mabel | Independent whole-film assessments |
| Final | E | Mabel -> Producer | Final material issue or review hold |

## Explicit non-claims

- The ten supporting roles remain reference-only in the standalone
  control-room prototype; this document does not add nodes, edges, or live
  conversations there.
- The three Red Team reviewers are likewise future-design reviewers only; no
  current runtime, UI, or prototype represents them as live agents.
- No current pipeline dispatch, database schema, provider call, or project UI
  is changed by this contract.
- The protocol does not grant any role authority to edit verified Scripture,
  replace approved source audio, create missing canon, or resolve producer
  holds autonomously.

## Control-room presentation personalities

The private control-room prototype may present each named cast member with a
distinct, producer-approved humorous voice. Those voices are a show layer,
not an agent policy or a source of production judgment. The authoritative
personality and exchange references are the producer-supplied workbooks
`HeartWord_Agent_Personalities.xlsx` and `HeartWord_Sample_Exchanges.xlsx`;
they are not copied into this design contract.

Presentation dialogue must always leave factual production status, evidence,
and gate outcomes clear. It may not mock Scripture, source audio, an urgent
blocker, sincere work, or a real review result. A humorous exchange cannot
dispatch work, modify a plan, approve or reject media, change an escalation,
or represent a planned role as a live runtime agent.

When a staged exchange is shown, the participating cast cards may receive a
temporary three-times-size visual spotlight. The spotlight is purely local UI
state: it clears about five seconds after the final staged line and never
changes the map's declared interaction contract or production state.

## Implementation boundary

Before any future implementation, an explicit design-to-runtime decision must
define the persisted packet and evidence schemas, visibility in the producer
workflow, gate state machine, cost limits, and the narrow first slice to build.
That work must preserve independent pipeline stages and the human-reviewable
reasoning log rather than replacing them with an opaque conversation layer.
