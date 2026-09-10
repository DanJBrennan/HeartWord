/**
 * Production Director agent -- built 2026-09-10 at Dan's explicit
 * request, right after the Creative Director agent shipped: "The
 * creative director proposes changes to the Director. The Director
 * decides whether the idea is appropriate based on time/budget, and
 * overall intent of the film. The Director can push back on the
 * Creative Director and request modifications a total of 10 times for
 * each conflict, after that, the Director makes a final decision and
 * implements it. This includes the authority to generate keyframes and
 * video clips."
 *
 * NOT the same role as src/pipeline/qc/director.ts's Director, which
 * reviews an already-generated shot's keyframe against the Critic and
 * automated likeness/fidelity checks -- pure visual QC on finished
 * work. This is the film-production "director" role from
 * docs/design/shot-planning.md's multi-agent model: it weighs a
 * PROPOSED idea against real production cost/time and the project's
 * overall intent (docs/PRODUCT_VISION.md, docs/design/timeline.md)
 * before anything gets generated at all.
 *
 * Negotiation model, per Dan's instruction: each individual idea (a
 * `GapFillIdea`, tracked by its own stable id -- see
 * creative-direction/index.ts) is its own independent "conflict" with
 * its own round counter. On each round the Director either approves an
 * idea, rejects it outright, or requests changes (with concrete
 * feedback) and hands it back to the Creative Director for revision.
 * After 10 rounds of requested changes on the SAME idea without
 * approval, the Director stops negotiating and exercises final
 * authority: it keeps the idea's current, most-recently-revised form
 * rather than continuing to iterate. That final authority explicitly
 * includes actually generating the approved idea's keyframe/video --
 * see implementApprovedIdeas below -- not just approving it on paper.
 *
 * Every round is written to `director_negotiation_log`
 * (docs/design/shot-planning.md's "Interaction Log" requirement,
 * applied to this specific negotiation) so a producer can see the full
 * back-and-forth, not just the final approved list.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { generateJson, type GeminiJsonSchema } from "../../server/providers/gemini.js";
import type { GapFillIdea, CreativeDirectorProposal } from "./index.js";
import { reviseGapFillerIdeas } from "./index.js";

const MAX_ROUNDS_PER_CONFLICT = 10;

// Rough, real per-idea cost this project has actually observed this
// session: ~$0.24 for a Nano Banana Pro keyframe + ~$0.80 for a Veo/
// Kling video generation. reorder_existing costs nothing to generate
// (it's a timeline edit); extend_existing usually means re-generating
// that shot's video at a longer duration, so it carries a similar cost
// to a new_shot video generation without a second keyframe call.
const ESTIMATED_COST_USD: Record<GapFillIdea["operation"], number> = {
  new_shot: 1.04,
  extend_existing: 0.8,
  reorder_existing: 0
};

interface DirectorVerdict {
  ideaId: string;
  verdict: "approve" | "request_changes" | "reject";
  feedback: string;
}

export interface NegotiationOutcome {
  narrationSpanVerseRef: string;
  approvedIdeas: GapFillIdea[];
  rejectedIdeas: GapFillIdea[];
  roundsUsed: number;
  forcedFinalCount: number;
  estimatedCostUsd: number;
}

const VERDICT_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ideaId: { type: "string" },
          verdict: { type: "string", enum: ["approve", "request_changes", "reject"] },
          feedback: { type: "string", description: "Required even on approve -- brief reasoning grounded in budget/time/film intent." }
        },
        required: ["ideaId", "verdict", "feedback"]
      }
    }
  },
  required: ["verdicts"]
};

function logRound(
  db: DatabaseSync,
  projectId: string,
  narrationSpanVerseRef: string,
  ideaId: string,
  round: number,
  role: "creative_director" | "production_director",
  verdict: DirectorVerdict["verdict"] | "forced_final" | null,
  content: string
): void {
  db.prepare(
    `INSERT INTO director_negotiation_log (id, project_id, narration_span_verse_ref, idea_id, round, role, verdict, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), projectId, narrationSpanVerseRef, ideaId, round, role, verdict, content, Date.now());
}

async function runDirectorReview(
  activeIdeas: Array<{ idea: GapFillIdea; round: number }>,
  narrationSpanVerseRef: string,
  gapMs: number,
  alreadyApprovedCount: number
): Promise<DirectorVerdict[]> {
  const prompt =
    `You are the Production Director for a Scripture video production. The Creative Director has proposed ideas to ` +
    `fill a real gap: the source narration for ${narrationSpanVerseRef.replace(" (narration)", "")} runs about ` +
    `${(gapMs / 1000).toFixed(1)}s longer than the video currently covers. Your job is to decide which of the ` +
    `Creative Director's CURRENT ideas to approve, reject, or send back for revision -- weighing:\n\n` +
    `1. TIME/BUDGET: each new_shot idea costs roughly $${ESTIMATED_COST_USD.new_shot.toFixed(2)} (a keyframe + video ` +
    `generation); each extend_existing idea costs roughly $${ESTIMATED_COST_USD.extend_existing.toFixed(2)} (a longer ` +
    `video regeneration); reorder_existing is essentially free (a timeline edit only). ${alreadyApprovedCount} idea(s) ` +
    `for this same gap are already approved. Don't approve so many ideas that this one ${(gapMs / 1000).toFixed(1)}s ` +
    `gap becomes wildly over-covered or over-budget relative to its own real duration -- but don't reject a genuinely ` +
    `good idea purely to save a fraction of a dollar either.\n` +
    `2. OVERALL FILM INTENT: this production presents Scripture in its entirety with real reverence -- see this ` +
    `project's own standing principle that narration should never simply go silent, but also that padding a gap ` +
    `with filler for its own sake is not the goal. An idea should earn its place: it should clarify the passage, ` +
    `deepen a real human moment already implied by the text, or maintain believable continuity -- not exist merely ` +
    `to fill seconds. Judge whether each idea actually serves the passage, and whether its own stated decorum ` +
    `reasoning is genuinely sound or just asserted.\n\n` +
    `IDEAS UNDER REVIEW THIS ROUND:\n` +
    activeIdeas
      .map(
        ({ idea, round }) =>
          `- id=${idea.id} (round ${round}/${MAX_ROUNDS_PER_CONFLICT}, ~$${ESTIMATED_COST_USD[idea.operation].toFixed(2)}): ` +
          `[${idea.operation}${idea.targetShotVerseRef ? ` -> ${idea.targetShotVerseRef}` : ""}] "${idea.label}" -- ${idea.description}` +
          `${idea.setting ? ` [setting: ${idea.setting}]` : ""} ` +
          `(${idea.kind}, ~${idea.estimatedDurationSec}s). Decorum claim: ${idea.decorumRationale}`
      )
      .join("\n") +
    `\n\nReturn one verdict per idea (matching its id exactly): "approve" (it should be built as-is), "reject" (it ` +
    `should not be built at all -- explain why), or "request_changes" (specify EXACTLY what should change in ` +
    `feedback -- vague feedback wastes a round). An idea at round ${MAX_ROUNDS_PER_CONFLICT}/${MAX_ROUNDS_PER_CONFLICT} ` +
    `is on its last round: only approve or reject it, since no further revision will happen regardless of what you return.`;

  const result = await generateJson<{ verdicts: DirectorVerdict[] }>(prompt, VERDICT_SCHEMA);
  return result.verdicts;
}

/**
 * Runs the full negotiation for one gap's Creative Director proposal
 * and returns the Production Director's final approved/rejected lists.
 * Does not itself generate anything -- see implementApprovedIdeas.
 */
export async function negotiateGapProposal(
  db: DatabaseSync,
  projectId: string,
  initialProposal: CreativeDirectorProposal
): Promise<NegotiationOutcome> {
  const { narrationSpanVerseRef, gapMs } = initialProposal;

  const roundCounts = new Map<string, number>();
  let activeIdeas: GapFillIdea[] = initialProposal.ideas;
  for (const idea of activeIdeas) {
    roundCounts.set(idea.id, 0);
    logRound(db, projectId, narrationSpanVerseRef, idea.id, 0, "creative_director", null, JSON.stringify(idea));
  }

  const approved: GapFillIdea[] = [];
  const rejected: GapFillIdea[] = [];
  let forcedFinalCount = 0;
  let maxRoundReached = 0;

  while (activeIdeas.length > 0) {
    const reviewBatch = activeIdeas.map((idea) => ({ idea, round: roundCounts.get(idea.id)! }));
    const verdicts = await runDirectorReview(reviewBatch, narrationSpanVerseRef, gapMs, approved.length);

    const toRevise: GapFillIdea[] = [];
    const feedbackByIdeaId = new Map<string, string>();

    for (const idea of activeIdeas) {
      const round = roundCounts.get(idea.id)!;
      maxRoundReached = Math.max(maxRoundReached, round);
      const verdict = verdicts.find((v) => v.ideaId === idea.id);
      if (!verdict) {
        // Model dropped an idea from its response -- fail safe to
        // request_changes rather than silently losing track of it.
        toRevise.push(idea);
        feedbackByIdeaId.set(idea.id, "No verdict returned for this idea -- please reconsider it explicitly.");
        continue;
      }

      const isFinalRound = round >= MAX_ROUNDS_PER_CONFLICT;
      const effectiveVerdict = isFinalRound && verdict.verdict === "request_changes" ? "approve" : verdict.verdict;
      const loggedVerdict = isFinalRound && verdict.verdict === "request_changes" ? "forced_final" : verdict.verdict;

      logRound(db, projectId, narrationSpanVerseRef, idea.id, round, "production_director", loggedVerdict, verdict.feedback);

      if (effectiveVerdict === "approve") {
        approved.push(idea);
        if (loggedVerdict === "forced_final") forcedFinalCount++;
      } else if (effectiveVerdict === "reject") {
        rejected.push(idea);
      } else {
        toRevise.push(idea);
        feedbackByIdeaId.set(idea.id, verdict.feedback);
      }
    }

    if (toRevise.length === 0) break;

    const revised = await reviseGapFillerIdeas(toRevise, feedbackByIdeaId);
    activeIdeas = revised.map((idea) => {
      const newRound = roundCounts.get(idea.id)! + 1;
      roundCounts.set(idea.id, newRound);
      logRound(db, projectId, narrationSpanVerseRef, idea.id, newRound, "creative_director", null, JSON.stringify(idea));
      return idea;
    });
  }

  const estimatedCostUsd = approved.reduce((sum, idea) => sum + ESTIMATED_COST_USD[idea.operation], 0);

  db.prepare(
    `INSERT INTO director_resolutions (id, project_id, narration_span_verse_ref, approved_ideas_json, rounds_used, forced_final_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), projectId, narrationSpanVerseRef, JSON.stringify(approved), maxRoundReached, forcedFinalCount, Date.now());

  return {
    narrationSpanVerseRef,
    approvedIdeas: approved,
    rejectedIdeas: rejected,
    roundsUsed: maxRoundReached,
    forcedFinalCount,
    estimatedCostUsd
  };
}
