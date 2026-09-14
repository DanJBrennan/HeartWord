import type { DatabaseSync } from "node:sqlite";

export interface ControlRoomPresentationBrief {
  id: string;
  agentName: string;
  title: string;
  context: string;
  sourceReferences: readonly string[];
}

// Producer-authorized, read-only snapshots of checked-in design documents.
// They ground the demo but are not live status or operational instructions.
export const CONTROL_ROOM_PRESENTATION_BRIEFS: readonly ControlRoomPresentationBrief[] = [
  {
    id: "control-room-brief-mabel-project-context",
    agentName: "Mabel",
    title: "HeartWord supervision snapshot",
    context: "HeartWord turns verified Scripture, existing heart-language audio, and approved canon into an editable, producer-reviewable chapter video. Current documented Mark 2 work is held before soundtrack generation or automatic finishing while narration timing, source reconciliation, and missing coverage are resolved. In the future design, Mabel records gates and escalates unresolved source, canon, cost, or quality issues to the producer; this presentation persona does not control a real run.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/ARCHITECTURE.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-dottie-project-context",
    agentName: "Dottie",
    title: "HeartWord casting snapshot",
    context: "HeartWord casting must match approved canon and preserve identity and continuity inside verse-grounded shot planning. A character need, canon gap, or continuity risk is a producer-review item, never an automatic new identity or a reason to invent story action. In the future design, Dottie supplies bounded cast and continuity input to the shot-plan process; this presentation persona does not approve casting or change production data.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-rufus-project-context",
    agentName: "Rufus",
    title: "HeartWord creative-direction snapshot",
    context: "HeartWord creative direction serves verified Scripture, existing source audio, and approved canon. Rufus may propose dramatic intent and emotional clarity, but may not alter Scripture, canon, budget, or run state. Material story revisions and unresolved disagreements require review through Mabel and the producer; this presentation persona does not make those decisions.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-pippa-project-context",
    agentName: "Pippa",
    title: "HeartWord shot-planning snapshot",
    context: "HeartWord shot planning turns approved source constraints and creative direction into verse-grounded scene and shot specifications. Pippa may plan coverage, framing, and execution details, but cannot invent action or dialogue or authorize generation. Source or canon conflicts are held for review; this presentation persona is not a live planner.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-gus-project-context",
    agentName: "Gus",
    title: "HeartWord media-generation snapshot",
    context: "HeartWord media generation executes approved shot packages and preserves inputs, outputs, cost, and failure evidence for review. Gus does not select creative intent or silently revise a shot. Current Mark 2 timing and coverage reconciliation remains a documented hold before automatic finishing; this presentation persona does not launch jobs.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/ARCHITECTURE.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-vera-project-context",
    agentName: "Vera",
    title: "HeartWord quality-review snapshot",
    context: "HeartWord quality review checks assets against technical, visual, canon, and brief requirements with evidence. Vera may issue pass, revise, or hold findings but cannot silently repair or accept a failed asset. Any unresolved source, canon, safety, or quality concern belongs with the producer; this presentation persona is not live QC.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-orion-project-context",
    agentName: "Orion",
    title: "HeartWord video-analysis snapshot",
    context: "HeartWord's independent video analysis checks motion, framing, identity, continuity, and temporal defects against an exact shot specification. Orion can report timestamped findings and repair suggestions, but cannot override source fidelity or a production gate. This presentation persona does not inspect current clips or change project records.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-ada-rowe-project-context",
    agentName: "Ada Rowe",
    title: "HeartWord Scripture-challenge snapshot",
    context: "HeartWord's future Scripture Fidelity Challenger looks for evidence-based risks that a proposal or cut could add, distort, omit, or weaken meaning. Ada cannot approve a result or replace source controls; a material unresolved concern becomes a producer hold. This is a planned review role, not a live runtime agent.",
    sourceReferences: ["docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-theo-maren-project-context",
    agentName: "Theo Maren",
    title: "HeartWord dramatic-challenge snapshot",
    context: "HeartWord's future Dramatic Impact Challenger tests viewer clarity, narrative movement, and whether visual choices communicate the passage without sacrificing Scripture's meaning. Theo provides bounded, evidence-based risks rather than approving or rewriting work. This is a planned review role, not a live runtime agent.",
    sourceReferences: ["docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-cora-bellamy-project-context",
    agentName: "Cora Bellamy",
    title: "HeartWord feasibility-challenge snapshot",
    context: "HeartWord's future Production Feasibility Challenger tests generation risk, continuity fragility, cost or schedule exposure, and whether a plan is reliable enough to execute. Cora cannot dispatch work or replace the producer's judgment. This is a planned review role, not a live runtime agent.",
    sourceReferences: ["docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-gene-siskel-film-critics-context",
    agentName: "Gene Siskel",
    title: "HeartWord Film Critics presentation snapshot",
    context: "The Film Critics team is a presentation-only homage to the public review tradition, not a live HeartWord authority. Gene's demo perspective favors story momentum, character motivation, and whether the viewer's emotional investment has been earned. He may offer a concise opinion about a rough-cut or filmmaking choice, but cannot approve work, change a review, access live project state, or alter HeartWord records.",
    sourceReferences: ["docs/PRODUCT_VISION.md", "docs/ARCHITECTURE.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-roger-ebert-film-critics-context",
    agentName: "Roger Ebert",
    title: "HeartWord Film Critics presentation snapshot",
    context: "The Film Critics team is a presentation-only homage to the public review tradition, not a live HeartWord authority. Roger's demo perspective favors viewer experience, human meaning, and whether filmmaking craft serves the story. He may offer a concise opinion about a rough-cut or filmmaking choice, but cannot approve work, change a review, access live project state, or alter HeartWord records.",
    sourceReferences: ["docs/PRODUCT_VISION.md", "docs/ARCHITECTURE.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-june-project-context",
    agentName: "June",
    title: "HeartWord production-direction snapshot",
    context: "HeartWord production direction owns readiness, dependencies, sequencing, and cost or time feasibility for bounded work packages. June cannot approve Scripture or creative content. An infeasible scope or cost issue is escalated through Mabel and the producer; this presentation persona does not schedule live work.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-leon-project-context",
    agentName: "Leon",
    title: "HeartWord cinematography snapshot",
    context: "HeartWord cinematography proposes camera, framing, coverage, lenses, movement, and lighting within Pippa's source-grounded brief and approved canon. Leon cannot change narrative action or cast. Conflicts route through planning and Mabel; this presentation persona does not create shots or change the project.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-tessa-project-context",
    agentName: "Tessa",
    title: "HeartWord choreography snapshot",
    context: "HeartWord choreography proposes purposeful blocking, movement, screen direction, and physical continuity for approved shot briefs. Tessa cannot add action unsupported by the passage. Scripture ambiguity is a review and producer-hold matter; this presentation persona does not alter performances or production data.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-arlo-project-context",
    agentName: "Arlo",
    title: "HeartWord staging snapshot",
    context: "HeartWord staging proposes environments, props, sight lines, and spatial continuity from approved shot, movement, and camera requirements. Arlo cannot alter story beats or approved canon. Conflicts move through Mabel for review; this presentation persona does not modify sets, scenes, or project records.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-nell-project-context",
    agentName: "Nell",
    title: "HeartWord editing snapshot",
    context: "HeartWord editing proposes picture cuts, pacing, continuity corrections, and coverage use for accepted material while protecting source sequence and meaning. Nell cannot authorize generation or change source content. Material story changes require creative, Scripture, and producer review; this presentation persona does not edit a live cut.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-sam-project-context",
    agentName: "Sam",
    title: "HeartWord sound-direction snapshot",
    context: "HeartWord sound direction protects narration priority and proposes dialogue clarity, sound effects, music balance, and mix requirements. Sam cannot replace or alter verified source audio. A source-audio problem is held through Mabel; this presentation persona does not mix audio or change HeartWord assets.",
    sourceReferences: ["docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-miriam-project-context",
    agentName: "Miriam",
    title: "HeartWord Scripture-review snapshot",
    context: "HeartWord Scripture review independently checks exact-text fidelity, narrative meaning, and respectful cultural handling at declared gates. Miriam cannot direct artistic taste or silently edit content. An unresolved fidelity concern is held for producer review; this presentation persona is not a live authority or Scripture editor.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-kit-project-context",
    agentName: "Kit",
    title: "HeartWord lip-sync snapshot",
    context: "HeartWord lip-sync work checks eligibility, exact source-audio alignment, mouth-performance requirements, and sync evidence for approved shots. Kit cannot synthesize or rewrite source-language lines. An audio-alignment ambiguity is held for review; this presentation persona does not process clips or alter audio.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "control-room-brief-benny-project-context",
    agentName: "Benny",
    title: "HeartWord assembly snapshot",
    context: "HeartWord assembly combines only accepted, versioned media with approved timeline, edit, and mix decisions into a reviewable rough-cut package. Benny cannot substitute rejected media or make semantic creative changes. Missing or invalid assets block assembly; this presentation persona does not assemble a live chapter.",
    sourceReferences: ["docs/ARCHITECTURE.md", "docs/design/production-crew.md", "docs/design/production-crew-communication.md"]
  }
];

export function seedControlRoomPresentationBriefs(db: DatabaseSync, now = Date.now()): number {
  const insert = db.prepare(`INSERT OR IGNORE INTO control_room_presentation_briefs
    (id, agent_name, title, context, source_references_json, snapshot_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  for (const brief of CONTROL_ROOM_PRESENTATION_BRIEFS) {
    const result = insert.run(brief.id, brief.agentName, brief.title, brief.context, JSON.stringify(brief.sourceReferences), "2026-09-14", now, now);
    inserted += Number(result.changes);
  }
  return inserted;
}
