import type { DatabaseSync } from "node:sqlite";

export type RedTeamReviewer = "Ada" | "Theo" | "Cora";
export type RedTeamQuestion = "what_went_wrong" | "how_to_improve";
export type RedTeamResponseMode = "local_audit" | "improvement_research";

export interface RedTeamFinding {
  id: string;
  reviewer: RedTeamReviewer;
  reviewArea: string;
  finding: string;
  evidence: string;
  severity: "high" | "medium" | "low";
  recommendation: string;
  sourceReferences: readonly string[];
}

const AUDIT_SCOPE = "HeartWord project audit 2026-09-14";

// Curated from the real Mark 2 database, the current goal, architecture,
// design contracts, and a fresh typecheck. They deliberately distinguish a
// documented future/deferred decision from an implemented failure.
export const CONTROL_ROOM_RED_TEAM_FINDINGS: readonly RedTeamFinding[] = [
  {
    id: "ada-unreviewed-source-boundaries", reviewer: "Ada", reviewArea: "Scripture fidelity and source safeguards", severity: "high",
    finding: "Twenty quote-aware Mark 2 source segments remain flagged for language-specialist confirmation, so later planning still depends on unconfirmed timing or speaker attribution.",
    evidence: "CURRENT_GOAL records 20 flagged stage-1 rows; ARCHITECTURE says resolving review_notes still requires direct database work.",
    recommendation: "Give a qualified reviewer a bounded queue to confirm or correct each flagged boundary before treating its attribution as verified.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/ARCHITECTURE.md"]
  },
  {
    id: "ada-incomplete-source-performance", reviewer: "Ada", reviewArea: "Scripture fidelity and source safeguards", severity: "high",
    finding: "The current Mark 2 film cannot receive a completeness manifest: five narration intervals totaling 120.891 seconds have no matches, with additional healing, forgiveness, and crowd-audio reconciliation concerns.",
    evidence: "CURRENT_GOAL's active timing audit records the missing intervals and explicitly blocks approval and automatic finishing.",
    recommendation: "Reconcile the source-version and narration coverage in a corrected cut, then record a verified source-to-production timing map before approval.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/design/timeline.md"]
  },
  {
    id: "ada-unvoiced-mark-2-18", reviewer: "Ada", reviewArea: "Scripture fidelity and source safeguards", severity: "medium",
    finding: "A live project QC note says Mark 2:18 has a speaker but no approved voice, so the composite cast master carried that segment unvoiced.",
    evidence: "Read-only audit of review_notes: project-level QC finding, 'Composite cast master: Segment 14 (Mark 2:18) has a speaker but no approved voice yet.'",
    recommendation: "Confirm the speaker and approved voice or explicitly preserve the verified original reading, with the rationale attached to the segment.",
    sourceReferences: ["HeartWordData/db/heartword.sqlite review_notes", "docs/PRODUCT_VISION.md"]
  },
  {
    id: "theo-missing-coverage-chain", reviewer: "Theo", reviewArea: "Dramatic impact and viewer clarity", severity: "high",
    finding: "The hand-edited Mark 2 film has only 26 planned shots with accepted assembled clips, while supplementary footage remains outside the shot database.",
    evidence: "CURRENT_GOAL says review can inspect the edit, but automatic finishing and a complete evidence chain remain held until coverage and timing are represented.",
    recommendation: "Represent supplementary footage against exact shots and plan the missing coverage before judging chapter pacing or emotional movement as a complete cut.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/design/production-crew.md"]
  },
  {
    id: "theo-held-qc-needs-triage", reviewer: "Theo", reviewArea: "Dramatic impact and viewer clarity", severity: "medium",
    finding: "The real project has 146 unresolved QC notes, including several research-grounded hold_for_review decisions, but historical and current findings are not yet presented as a prioritized viewing queue.",
    evidence: "Read-only database audit counted 146 unresolved QC review_notes; current goal says review findings are durable records rather than automatic workflow triggers.",
    recommendation: "Present latest unresolved findings by shot and severity beside the actual cut, so the producer can distinguish active viewer-impact risks from superseded history.",
    sourceReferences: ["HeartWordData/db/heartword.sqlite review_notes", "docs/plans/CURRENT_GOAL.md"]
  },
  {
    id: "theo-red-team-is-presentation-only", reviewer: "Theo", reviewArea: "Dramatic impact and viewer clarity", severity: "low",
    finding: "The current Red Team is a presentation prototype, not a live review stage that inspects an assembled cut. That is an intentional scope boundary, not evidence that a future review failed.",
    evidence: "proposed-control-room-responsibilities and the production-crew communication contract both label Red Team runtime review as future design.",
    recommendation: "Keep presentation answers clearly labelled as saved project-audit context until a producer-approved runtime review stage is implemented.",
    sourceReferences: ["docs/design/proposed-control-room-responsibilities.md", "docs/design/production-crew-communication.md"]
  },
  {
    id: "cora-typecheck-health", reviewer: "Cora", reviewArea: "Production feasibility and reliability", severity: "medium",
    finding: "A fresh full typecheck still fails across scripts and core pipeline/QC files, including assembly, casting, and review code paths.",
    evidence: "npm run typecheck on 2026-09-14 reported strict TypeScript errors in scripts plus src/pipeline/assembly, casting, and qc files.",
    recommendation: "Triage the failing files by production criticality, starting with assembly and QC, and restore a clean typecheck before expanding workflow automation.",
    sourceReferences: ["npm run typecheck (2026-09-14)", "package.json"]
  },
  {
    id: "cora-finishing-prerequisites", reviewer: "Cora", reviewArea: "Production feasibility and reliability", severity: "high",
    finding: "Observed incomplete timing intentionally blocks soundtrack generation and automatic finishing; the current film cannot safely be treated as an execution-ready render.",
    evidence: "CURRENT_GOAL and production-crew design both require a verified timing map and represented coverage before automatic finishing.",
    recommendation: "Use the corrected cut to restore source coverage, reconcile supplementary media, and submit a verified timing manifest before scheduling finishing work.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/design/production-crew.md"]
  },
  {
    id: "cora-qc-policy-decision", reviewer: "Cora", reviewArea: "Production feasibility and reliability", severity: "medium",
    finding: "Critic plus Director review is deliberately available on demand rather than automatically wired into every generation, because each grounded review adds paid search latency and cost. This is an open policy decision, not a defect.",
    evidence: "CURRENT_GOAL documents the bounded per-shot implementation and asks the producer to choose per-shot, whole-project audit, or default review policy.",
    recommendation: "Set a producer-approved review budget and explicit trigger policy for high-risk shots, so cost and assurance are predictable before paid generation.",
    sourceReferences: ["docs/plans/CURRENT_GOAL.md", "docs/design/automated-quality-control.md"]
  }
];

const REVIEWER_ALIASES: Record<string, RedTeamReviewer> = {
  ada: "Ada", "ada rowe": "Ada", theo: "Theo", "theo maren": "Theo", cora: "Cora", "cora bellamy": "Cora"
};

const REVIEWER_RESEARCH_SCOPES: Record<RedTeamReviewer, string> = {
  Ada: "Scripture fidelity, source-language and translated-text alignment, and review safeguards. Seek authoritative guidance on traceable source review, translation/alignment verification, and human sign-off for ambiguous source material.",
  Theo: "Dramatic impact, narrative clarity, and viewer/emotional effectiveness. Seek authoritative filmmaking or audience-research guidance on testing comprehension, coverage, pacing, and emotional continuity in an edited narrative.",
  Cora: "Production feasibility, workflow reliability, scope, cost, and practical execution. Seek authoritative engineering or production guidance on release readiness, reproducible quality gates, risk triage, and cost-aware automation."
};

export function redTeamReviewerForAgent(agent: string): RedTeamReviewer | undefined {
  return REVIEWER_ALIASES[agent.trim().toLowerCase()];
}

export function redTeamQuestionFor(text: string): RedTeamQuestion | undefined {
  const question = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\bwhat\b.*\b(wrong|problems?|issues?|risks?|failed|weakness(?:es)?)\b|\bwhat went wrong\b/.test(question)) return "what_went_wrong";
  if (/\b(how|what|where|ways?)\b.*\b(improv\w*|better|strengthen\w*|fix\w*)\b/.test(question)) return "how_to_improve";
  return undefined;
}

export function redTeamResponseModeFor(agent: string, question: string): { reviewer: RedTeamReviewer; mode: RedTeamResponseMode } | undefined {
  const reviewer = redTeamReviewerForAgent(agent);
  const redTeamQuestion = redTeamQuestionFor(question);
  if (!reviewer || !redTeamQuestion) return undefined;
  return { reviewer, mode: redTeamQuestion === "what_went_wrong" ? "local_audit" : "improvement_research" };
}

export function redTeamFindingsFor(db: DatabaseSync, reviewer: RedTeamReviewer): RedTeamFinding[] {
  const rows = db.prepare(`SELECT id, reviewer, review_area AS reviewArea, finding, evidence, severity, recommendation, source_references_json AS sourceReferences
    FROM control_room_red_team_findings WHERE reviewer=? AND presentation_only=1
    ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id`).all(reviewer) as Array<Omit<RedTeamFinding, "sourceReferences"> & { sourceReferences: string }>;
  return rows.map(row => ({ ...row, sourceReferences: JSON.parse(row.sourceReferences) as string[] }));
}

export function redTeamReviewResponse(db: DatabaseSync, reviewer: RedTeamReviewer, question: RedTeamQuestion): string {
  const findings = redTeamFindingsFor(db, reviewer);
  const area = findings[0]?.reviewArea ?? "project review";
  const opening = question === "what_went_wrong"
    ? `${reviewer} - ${area}. Evidence-backed audit findings, not a production decision:`
    : `${reviewer} - ${area}. Evidence-backed improvement priorities, not a production decision:`;
  const items = findings.map((finding, index) => question === "what_went_wrong"
    ? `${index + 1}. [${finding.severity}] ${finding.finding} Evidence: ${finding.evidence} References: ${finding.sourceReferences.join(", ")}. Improve: ${finding.recommendation}`
    : `${index + 1}. [${finding.severity}] Improve: ${finding.recommendation} Why: ${finding.finding} Evidence: ${finding.evidence} References: ${finding.sourceReferences.join(", ")}.`);
  return `${opening}\n${items.join("\n")}\nScope: This is saved, presentation-only project-audit context. The producer retains every decision.`;
}

// This is the only project context sent with a Red Team web-research request.
// It is derived from the saved presentation audit, excludes raw records and
// personal data, and is explicitly not external evidence.
export function redTeamImprovementResearchBrief(db: DatabaseSync, reviewer: RedTeamReviewer): string {
  const findings = redTeamFindingsFor(db, reviewer);
  const observations = findings.map(finding =>
    `- [${finding.severity}] ${finding.finding} Local next step: ${finding.recommendation}`
  );
  return `Reviewer scope: ${REVIEWER_RESEARCH_SCOPES[reviewer]}\nSaved project-derived observations (not external evidence; presentation-only):\n${observations.join("\n")}`;
}

export function redTeamImprovementFallback(db: DatabaseSync, reviewer: RedTeamReviewer): string {
  return `${redTeamReviewResponse(db, reviewer, "how_to_improve")}\nExternal research was unavailable, so these are saved project-derived improvements only.`;
}

export function seedControlRoomRedTeamFindings(db: DatabaseSync, now = Date.now()): number {
  const insert = db.prepare(`INSERT OR IGNORE INTO control_room_red_team_findings
    (id, reviewer, review_area, finding, evidence, severity, recommendation, source_references_json, audit_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let inserted = 0;
  for (const finding of CONTROL_ROOM_RED_TEAM_FINDINGS) {
    const result = insert.run(finding.id, finding.reviewer, finding.reviewArea, finding.finding, finding.evidence, finding.severity, finding.recommendation, JSON.stringify(finding.sourceReferences), AUDIT_SCOPE, now, now);
    inserted += Number(result.changes);
  }
  return inserted;
}
