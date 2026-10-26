import type { CrewBrief, CrewPhase, CrewRole } from "./crew-types.js";

/** Ordinal craft judgments, never acceptance checks or audience probabilities. */
export const CRAFT_RUBRIC = "heartword-craft-v1";
export const CRAFT_DIMENSIONS = ["clarity", "emotional_development", "pacing", "continuity", "feasibility"] as const;
export const CRAFT_OWNERS = ["creative_director", "cinematographer", "choreographer", "staging_designer", "costume_designer", "lighting_designer", "script_supervisor", "picture_editor", "sound_designer", "composer", "colorist"] as const;
export interface CraftAssessment {
  rubric: typeof CRAFT_RUBRIC;
  recommendation: "satisfactory" | "revise" | "unverified";
  dimensions: Array<{ name: typeof CRAFT_DIMENSIONS[number]; score: number | null; evidence: string;
    shotIds: string[]; startMs: number | null; endMs: number | null; confidence: number; limitations: string }>;
  concerns: Array<{ owner: typeof CRAFT_OWNERS[number]; shotId: string | null; evidence: string; requestedChange: string }>;
}
export interface CraftResponse { findingId: string; change: string; evidence: string }
export type RoutedCraftConcern = CraftAssessment["concerns"][number] & { id: string };
export interface CreativeFeedback {
  version: 1; rubric: typeof CRAFT_RUBRIC; policy: "continue_best_acceptable";
  scope: string; milestone: CrewPhase; maxPasses: 2; maxCalls: number;
  callUpperBoundUsd: number | null; reviewUpperBoundUsd: number | null;
  selectedRound: number | null; stopReason: string;
  passes: Array<{ round: number; assessment: CraftAssessment; score: number | null; hardChecks: "passed" | "failed";
    concerns: RoutedCraftConcern[]; responses: Array<CraftResponse & { owner: CrewRole }>; reason: string }>;
}
const text = { type: "string" };
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties) });
const array = (items: unknown) => ({ type: "array", items });
export const craftAssessmentSchema = object({
  rubric: { type: "string", enum: [CRAFT_RUBRIC] },
  recommendation: { type: "string", enum: ["satisfactory", "revise", "unverified"] },
  dimensions: array(object({ name: { type: "string", enum: [...CRAFT_DIMENSIONS] }, score: { type: "integer", nullable: true, description: "Ordinal craft score: whole number 0, 1, 2, 3, or 4; use null when unobservable. Never use half points." },
    evidence: text, shotIds: array(text), startMs: { type: "number", nullable: true }, endMs: { type: "number", nullable: true }, confidence: { type: "number" }, limitations: text })),
  concerns: array(object({ owner: { type: "string", enum: [...CRAFT_OWNERS] }, shotId: { type: "string", nullable: true }, evidence: text, requestedChange: text }))
});
export const craftResponsesSchema = array(object({ findingId: text, change: text, evidence: text }));
const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 12000;
export function validateCraftAssessment(value: unknown, brief?: CrewBrief, phase?: CrewPhase): asserts value is CraftAssessment {
  const a = value as CraftAssessment | undefined;
  if (!a || a.rubric !== CRAFT_RUBRIC || !["satisfactory", "revise", "unverified"].includes(a.recommendation)
    || !Array.isArray(a.dimensions) || a.dimensions.length !== CRAFT_DIMENSIONS.length || !Array.isArray(a.concerns) || a.concerns.length > 3) throw new Error("Incomplete or incompatible craft rubric.");
  const names = new Set<string>(), shots = brief && new Set(brief.shots.map(s => s.id));
  for (const d of a.dimensions) {
    if (!d || !CRAFT_DIMENSIONS.includes(d.name) || names.has(d.name) || (d.score !== null && (!Number.isInteger(d.score) || d.score < 0 || d.score > 4))
      || !nonempty(d.evidence) || !nonempty(d.limitations) || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 100
      || !Array.isArray(d.shotIds) || d.shotIds.some(id => typeof id !== "string" || (shots && !shots.has(id)))) throw new Error("Invalid craft dimension or evidence.");
    names.add(d.name);
    if (d.startMs !== null || d.endMs !== null) {
      if (!Number.isFinite(d.startMs) || !Number.isFinite(d.endMs) || d.startMs! < 0 || d.endMs! < d.startMs!
        || (brief && ((phase !== undefined && phase !== "finishing") || !brief.render || d.endMs! > brief.render.durationMs))) throw new Error("Craft timestamps require the actual cut's bounds.");
    }
  }
  for (const c of a.concerns) if (!c || !CRAFT_OWNERS.includes(c.owner) || !nonempty(c.evidence) || !nonempty(c.requestedChange)
    || (c.shotId !== null && (typeof c.shotId !== "string" || (shots && !shots.has(c.shotId))))) throw new Error("Craft finding needs evidence and an accountable production owner.");
  if (a.recommendation === "revise" && !a.concerns.length) throw new Error("A creative revision needs retained findings, not a score alone.");
}
export function validateCraftResponses(value: unknown): asserts value is CraftResponse[] {
  if (!Array.isArray(value) || value.length > 3 || value.some(r => !r || !nonempty(r.findingId) || !nonempty(r.change) || !nonempty(r.evidence))
    || new Set(value.map(r => r.findingId)).size !== value.length) throw new Error("Creative revision responses need unique finding IDs, changes and evidence.");
}
/** Equal 20% weights avoid asserting learned priorities. Missing evidence is
 * unscored, never a zero or a renormalized total comparable to a full review. */
export function craftScore(a: CraftAssessment): number | null {
  return a.dimensions.some(d => d.score === null) ? null : a.dimensions.reduce((n, d) => n + d.score!, 0) * 5;
}
export function craftImproved(before: CraftAssessment, after: CraftAssessment): boolean {
  if (before.rubric !== after.rubric || craftScore(before) === null || craftScore(after) === null) return false;
  return before.dimensions.every(d => after.dimensions.find(next => next.name === d.name)!.score! >= d.score!)
    && before.dimensions.some(d => after.dimensions.find(next => next.name === d.name)!.score! > d.score!);
}
export const CREATIVE_FEEDBACK_POLICY = `CREATIVE FEEDBACK: Nell (Picture Editor) owns film-craft assessment; Theo remains an independent clarity challenger. Vera is declared, and presentation critics have no production authority.
Use ${CRAFT_RUBRIC}: clarity, emotional_development, pacing, continuity, feasibility, equal 20% weights. Ordinal anchors: 0 seriously ineffective, 1 weak, 2 mixed, 3 adequate for the stated intent, 4 strong. Use null with limitations for unobservable dimensions. Evidence and confidence are separate from quality. This rubric has no calibrated numeric acceptance threshold and predicts no audience approval.
Assess the supplied treatment/storyboard in planning, selected coverage/assembly proposal in editing, and actual attached audiovisual cut in finishing. Plan evidence does not prove pixels, motion or audience response. Give shot/beat locators, and actual-cut timestamps where observable. Nell returns craftAssessment; at most three creative concerns, each routed to its accountable production owner. Reviewers never dispatch a paid repair.
The Production Director additionally returns acceptanceChecks with status clear, hold, or unverified and concrete evidence. These non-negotiable checks concern source wording/order/speed, safe pauses and coverage, approved canon, retained producer decisions, and applicable source/cost/approval prerequisites. Existing deterministic and specialist checks cannot be waived by that claim or a high craft score. A hold stays a hold. Distinguish a request for creative revision from a hard-check failure.
There is an initial review plus at most ONE revision pass within the existing phase call cap. Revision owners return creativeResponses with exact retained findingId, change and evidence. Other affected roles may cite that same finding for a dependent adjustment; any substantive creative change needs such a response or an existing explicit owner/objection response. Preserve valid earlier work. Comparable improvement needs at least one higher ordinal dimension and no lower dimension; a tie, regression or unscored comparison is a plateau. At a plateau/limit with hard checks clear, Dan's policy is continue the best acceptable version and visibly carry the creative shortfall. Hard or unverified checks hold. A revision/repair never authorizes itself to spend.`;
