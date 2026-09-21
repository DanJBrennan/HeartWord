/**
 * Creative Director agent -- built 2026-09-10 at Dan's request, after
 * fixing Mark 2's silent-narration gaps surfaced a real editorial
 * problem those fixes alone can't solve: closing a gap with more
 * generated coverage isn't just a duration-matching exercise, it's a
 * creative decision about what actually belongs on screen during that
 * stretch of story. Dan's own framing: some of these gaps are quiet
 * narration beats that just need another continuity angle on the
 * existing action, but others are wordless, emotionally charged stretches
 * (his example: the paralytic's healing) where the narrator deliberately
 * pauses, music builds, and the scene should carry a real human reaction
 * -- awe, gasps, dancing, someone processing what just happened -- without
 * ever losing the scriptural decorum the passage itself calls for.
 *
 * This agent's job: given one real narration-only gap (from
 * scripts/report-narration-coverage.ts), gather this project's own
 * context (the surrounding shots' own descriptions, the available
 * character canon, the gap's real duration) and reach out to an LLM
 * (Gemini text, the same generateJson call src/pipeline/casting and
 * src/pipeline/qc already use -- see src/server/providers/gemini.ts) for
 * concrete gap-filling shot ideas: mostly continuity extensions of
 * what's already being covered, but explicitly free to invent a human
 * touch when the moment calls for one. Every idea must self-report how
 * it stays within the passage's decorum -- Dan's explicit standing
 * instruction, not an optional nicety -- and the agent is instructed to
 * say so plainly rather than force an idea into a moment that doesn't
 * call for one.
 *
 * The agent isn't limited to proposing brand-new shots: per Dan's
 * explicit follow-up guidance, it can also propose sliding an existing
 * shot earlier/later relative to its neighbors (`reorder_existing`) or
 * simply holding longer on an existing shot's own action/reaction
 * (`extend_existing`) instead of always cutting to something new. See
 * GapFillIdea's `operation` field.
 *
 * This agent PROPOSES; it does not generate keyframes/video itself and
 * does not decide the gap is closed. A human (or a future automated
 * step) reviews `creative_direction_proposals` and turns an accepted
 * idea into a real change: a new_shot idea becomes a real keyframe/video
 * generation + splice, the same way every other supplementary shot this
 * project has added was made; a reorder_existing or extend_existing idea
 * becomes an edit to the chapter assembly timeline directly.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { generateJsonMetered, type GeminiJsonSchema, GEMINI_TEXT_MODEL } from "../../providers/gemini-text.js";
import { recordModelSpend } from "./model-spend.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { getDataDir } from "../../db/client.js";
import { loadCrewBrief } from "./crew-context.js";

export interface GapFillIdea {
  targetShotId?: string;
  /** Stable id assigned locally (not by the LLM) when an idea is first
   *  proposed, and preserved across every revision -- lets the
   *  Production Director negotiation loop (production-director.ts)
   *  track each idea/conflict's own round count independently. */
  id: string;
  /** 'new_shot' = propose a brand-new shot (continuity or invented, see
   *  `kind`). 'reorder_existing' = an existing shot already covering this
   *  gap should move earlier/later relative to its neighbors to make
   *  room for another idea or to improve pacing -- per Dan's explicit
   *  guidance that the Director isn't limited to only adding new
   *  material. 'extend_existing' = an existing shot's own duration
   *  should simply run longer (more time held on the same action/
   *  reaction) rather than cutting to something new at all. */
  operation: "new_shot" | "reorder_existing" | "extend_existing";
  /** For reorder_existing/extend_existing: which already-listed shot this
   *  applies to, by its exact verse_ref as given in context. Empty
   *  string for new_shot (the schema requires the field on every idea). */
  targetShotVerseRef: string;
  /** Short kebab-case slug, suitable as a shotId/filename stem. Still
   *  required for reorder/extend operations, as a short handle for the
   *  proposal even though no new asset is generated. */
  label: string;
  /** For new_shot: full shot action description, written the same way
   *  this project's own shots.action column is -- concrete enough to
   *  hand directly to a keyframe-generation prompt. For
   *  reorder_existing/extend_existing: a plain description of the
   *  change itself (e.g. "move this shot to follow X instead of Y" or
   *  "hold on this reaction for 3s longer before cutting"). */
  description: string;
  framing: string; // e.g. 'wide' | 'medium_wide' | 'medium' | 'close_up' | 'insert' -- new_shot only, "" otherwise
  cameraMovement: string; // e.g. 'static' | 'push_in' | 'pan_left' | ... -- new_shot only, "" otherwise
  /** new_shot only ("" otherwise): the physical setting, committed to
   *  explicitly rather than left for the keyframe generator to guess --
   *  a real defect this project has hit more than once is a shot
   *  defaulting to an exterior street when it should be inside the same
   *  crowded room as its surrounding shots. State interior vs exterior
   *  AND which established location, e.g. "interior, the same crowded
   *  room where the healing is taking place" or "exterior, the street
   *  outside the house." */
  setting: string;
  charactersInvolved: string[]; // names, matching this project's character canon where applicable
  /** For new_shot: the new shot's own length. For extend_existing: the
   *  ADDITIONAL seconds to add on top of its current length (not its new
   *  total). For reorder_existing: 0. */
  estimatedDurationSec: number;
  /** Why this idea belongs in THIS gap specifically -- the emotional or
   *  narrative beat it serves, not a generic description. */
  narrativeRationale: string;
  /** Explicit self-check: how this idea stays within the passage's
   *  scriptural decorum. Required on every idea, not just the
   *  emotionally charged ones. */
  decorumRationale: string;
  /** 'continuity' = another angle/extension of action already being
   *  shown elsewhere in this gap; 'invented' = a new human-interest beat
   *  not otherwise depicted. Meaningful for new_shot; for
   *  reorder_existing/extend_existing, describes the existing shot's own
   *  character (almost always 'continuity'). Per Dan's guidance, most
   *  ideas for a given gap should be 'continuity', with 'invented' used
   *  deliberately. */
  kind: "continuity" | "invented";
}

export interface CreativeDirectorProposal {
  context?: string;
  id: string;
  projectId: string;
  narrationSpanVerseRef: string;
  gapMs: number;
  ideas: GapFillIdea[];
  createdAt: number;
  /** What proposing these ideas cost in Gemini reasoning calls, already
   *  recorded to cost_ledger_entries. Separate from the negotiation's own
   *  cost (NegotiationOutcome.modelCostUsd) -- a caller reporting total
   *  spend for a gap must add both, or it under-reports by half. */
  modelCostUsd?: number;
}

interface ShotContextRow {
  id: string;
  verse_ref: string;
  action: string;
  scene_seq: number;
  shot_seq: number;
  needs_lip_sync: number;
}

interface CharacterRow {
  name: string;
}

const GAP_FILL_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["new_shot", "reorder_existing", "extend_existing"] },
          targetShotVerseRef: { type: "string", description: "Required for reorder_existing/extend_existing; omit (empty string) for new_shot." },
          targetShotId: { type: "string", description: "Exact existing shot ID for reorder/extend; empty for new_shot." },
          label: { type: "string" },
          description: { type: "string" },
          framing: { type: "string", description: "new_shot only; empty string otherwise." },
          cameraMovement: { type: "string", description: "new_shot only; empty string otherwise." },
          setting: {
            type: "string",
            description:
              "new_shot only (empty string otherwise): commit explicitly to interior vs exterior AND which established " +
              "location, e.g. 'interior, the same crowded room where the healing is taking place'. Do not leave this vague."
          },
          charactersInvolved: { type: "array", items: { type: "string" } },
          estimatedDurationSec: {
            type: "number",
            description: "new_shot: the new shot's length. extend_existing: ADDITIONAL seconds to add. reorder_existing: 0."
          },
          narrativeRationale: { type: "string" },
          decorumRationale: { type: "string" },
          kind: { type: "string", enum: ["continuity", "invented"] }
        },
        required: [
          "operation",
          "targetShotId",
          "targetShotVerseRef",
          "label",
          "description",
          "setting",
          "framing",
          "cameraMovement",
          "charactersInvolved",
          "estimatedDurationSec",
          "narrativeRationale",
          "decorumRationale",
          "kind"
        ]
      }
    }
  },
  required: ["ideas"]
};

/**
 * Gathers this project's own context around one narration gap: the
 * shots immediately before and after it (their real action text, not a
 * paraphrase), plus every named or group character already cast for the
 * project, so the LLM call is grounded in what this specific chapter
 * actually contains rather than inventing generically.
 */
function gatherGapContext(
  db: DatabaseSync,
  projectId: string,
  verseStart: number,
  verseEnd: number
): { before: ShotContextRow[]; after: ShotContextRow[]; withinGap: ShotContextRow[]; castNames: string[] } {
  const allShots = db
    .prepare(
      `SELECT s.id, s.verse_ref, s.action, sc.sequence AS scene_seq, s.sequence AS shot_seq, s.needs_lip_sync
       FROM shots s JOIN scenes sc ON sc.id = s.scene_id
       WHERE sc.project_id = ? ORDER BY sc.sequence, s.sequence`
    )
    .all(projectId) as unknown as ShotContextRow[];

  const withinGap: ShotContextRow[] = [];
  let firstWithinIdx = -1;
  let lastWithinIdx = -1;
  allShots.forEach((s, i) => {
    const { start, end } = parseVerseRange(s.verse_ref);
    if (start <= verseEnd && end >= verseStart) {
      withinGap.push(s);
      if (firstWithinIdx === -1) firstWithinIdx = i;
      lastWithinIdx = i;
    }
  });

  const insertion = allShots.findIndex(s => parseVerseRange(s.verse_ref).start > verseEnd);
  const position = insertion < 0 ? allShots.length : insertion;
  const beforeIndex = firstWithinIdx >= 0 ? firstWithinIdx : position;
  const afterIndex = lastWithinIdx >= 0 ? lastWithinIdx + 1 : position;
  const before = allShots.slice(Math.max(0, beforeIndex - 2), beforeIndex);
  const after = allShots.slice(afterIndex, afterIndex + 2);

  const castNames = loadCrewBrief(db, getDataDir(), projectId, "planning").canon.map(c => c.name);

  return { before, after, withinGap, castNames };
}

/**
 * Proposes gap-filling shot ideas for one real narration-only span that
 * currently has less visual coverage than its real duration (see
 * scripts/report-narration-coverage.ts for how gaps are identified).
 * Writes the proposal to `creative_direction_proposals` (history-
 * preserving -- re-running against the same gap adds a new row) and
 * returns it.
 */
export async function proposeGapFillers(
  db: DatabaseSync,
  projectId: string,
  narrationSpanVerseRef: string,
  gapMs: number
): Promise<CreativeDirectorProposal> {
  if (!Number.isFinite(gapMs) || gapMs <= 0) throw new Error("A measured positive coverage gap is required.");
  const brief = loadCrewBrief(db, getDataDir(), projectId, "planning");
  const context = JSON.stringify(brief);
  const bareVerseRef = narrationSpanVerseRef.replace(" (narration)", "");
  const reference = bareVerseRef.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!reference || reference[1]!.toLowerCase() !== brief.project.book.toLowerCase() || Number(reference[2]) !== brief.project.chapter) throw new Error("Coverage requests must refer to this project's book and chapter.");
  const { start: verseStart, end: verseEnd } = parseVerseRange(bareVerseRef);
  const { before, after, withinGap, castNames } = gatherGapContext(db, projectId, verseStart, verseEnd);

  const describe = (rows: ShotContextRow[]) =>
    rows.length === 0
      ? "(none)"
      : rows.map((r) => `  - id=${r.id} [${r.verse_ref}]${r.needs_lip_sync ? " (LIP-SYNCED)" : ""} ${r.action}`).join("\n");

  const prompt =
    `You are the Creative Director for a Scripture video production (${brief.project.language}-language ${brief.project.book} ${brief.project.chapter}, dramatized with a real ` +
    `cast, photorealistic style). Your job is to propose specific shot ideas to fill a real gap: the source ` +
    `narration for ${bareVerseRef} runs longer than the video currently covers it, by about ${(gapMs / 1000).toFixed(1)} seconds.\n\n` +
    `PRODUCER'S STANDING GUIDANCE (apply this directly, don't just acknowledge it):\n` +
    `"The general rule is that a clip is muted when the narrator speaks. But spacing or breathing room may be ` +
    `added for effect -- background sound of awe and gasps of excitement can be appropriate. There may be long ` +
    `stretches where the narrator is paused and music builds, dancing occurs, or a character simply reacts. This ` +
    `can be an emotional time when the actual passage supports it. Determine THIS passage's mood from the source. Fill gaps with ideas that add a human side, ` +
    `while always maintaining the decorum of the intent of the scripture passage. Most ideas should be continuity ` +
    `keyframes/clips (another angle or extension of action already happening), but invented human-interest beats ` +
    `are welcome when the moment genuinely calls for one."\n\n` +
    `THIS CHAPTER'S SHOTS ALREADY COVERING THIS SPAN (their exact verse_ref is how you must refer to one of them):\n${describe(withinGap)}\n\n` +
    `Use the exact targetShotId for EVERY idea: the existing target for an edit, or the nearby shot anchoring a new insert. New shots must each be at most eight seconds; split longer coverage into distinct ideas. A verse reference alone is ambiguous.\n` +
    `EXACT SOURCE, APPROVED CANON, MEASURED TIMING AND CHAPTER CONTEXT:\n${context}\n\n` +
    `SHOTS IMMEDIATELY BEFORE THIS SPAN:\n${describe(before)}\n\n` +
    `SHOTS IMMEDIATELY AFTER THIS SPAN:\n${describe(after)}\n\n` +
    `CHARACTER CANON ALREADY CAST FOR THIS PROJECT (use these names, don't invent new named characters):\n` +
    `${castNames.map((n) => `  - ${n}`).join("\n")}\n\n` +
    `You are not limited to proposing brand-new shots. Three kinds of ideas are available, and a good gap-filling ` +
    `plan often mixes them:\n` +
    `  - "new_shot": a new shot to insert, either a "continuity" extension of action already listed above, or a ` +
    `genuinely "invented" human-interest beat. Commit explicitly to its physical setting in "setting" (interior vs ` +
    `exterior, and which established location) by reading the surrounding shots' own action text above -- a real ` +
    `mistake this project has made before is a new shot defaulting to an exterior street when the surrounding shots ` +
    `make clear the action is happening inside a room. Don't leave the keyframe generator to guess.\n` +
    `  - "reorder_existing": one of the shots already listed above should move earlier or later relative to its ` +
    `neighbors -- to make room for a new idea, or simply because a different order paces the gap better. Say which ` +
    `existing shot (by its exact verse_ref) and describe the new position in "description".\n` +
    `  - "extend_existing": one of the shots already listed above should simply run longer -- more time held on the ` +
    `same action or reaction -- rather than cutting away to something new at all. Say which existing shot (by its ` +
    `exact verse_ref) and how many additional seconds in "estimatedDurationSec". NEVER target a shot marked ` +
    `(LIP-SYNCED) with extend_existing -- its length is already locked to its real dialogue audio, so lengthening ` +
    `its video would break lip-sync. If the moment you want to linger on IS a lip-synced line, propose a new_shot ` +
    `cutaway/reaction instead (e.g. a listener's continued reaction after the line ends), not an extension of the ` +
    `lip-synced shot itself.\n\n` +
    `Propose enough ideas, of whichever kinds actually fit, to plausibly close roughly ${(gapMs / 1000).toFixed(1)} seconds ` +
    `of gap (durations are estimates, they don't need to sum exactly, and reorder_existing contributes 0 seconds on ` +
    `its own). For each idea, decide honestly whether it's a "continuity" extension of the action already listed ` +
    `above, or a genuinely "invented" human-interest beat -- and justify the invented ones specifically: what does ` +
    `this moment need that isn't already covered? For EVERY idea, explicitly state how it stays within the ` +
    `reverence/decorum appropriate to this Scripture passage -- if an idea would risk trivializing, sensationalizing, ` +
    `or distracting from the passage's meaning, do not propose it.`;

  const { result, costUsd } = await generateJsonMetered<{ ideas: Array<Omit<GapFillIdea, "id">> }>(prompt, GAP_FILL_SCHEMA);
  recordModelSpend(db, projectId, costUsd);
  const ideasWithIds: GapFillIdea[] = result.ideas.map((idea) => ({ ...idea, id: randomUUID() }));

  const proposal: CreativeDirectorProposal = {
    context,
    id: randomUUID(),
    projectId,
    narrationSpanVerseRef,
    gapMs,
    ideas: ideasWithIds,
    createdAt: Date.now(),
    modelCostUsd: costUsd
  };

  db.prepare(
    `INSERT INTO creative_direction_proposals (id, project_id, narration_span_verse_ref, gap_ms, ideas_json, model, created_at, context_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(proposal.id, projectId, narrationSpanVerseRef, gapMs, JSON.stringify(ideasWithIds), GEMINI_TEXT_MODEL, proposal.createdAt, context);

  return proposal;
}

/**
 * Revises specific ideas in response to the Production Director's
 * feedback (see production-director.ts's negotiation loop) -- called
 * once per negotiation round, only for the ideas still under dispute.
 * Each revised idea KEEPS its original `id` (feedback targets and
 * round-counts an idea by that id across revisions) but may otherwise
 * change completely, including switching `operation` or `kind` if the
 * feedback calls for a different approach entirely rather than a tweak.
 */
export async function reviseGapFillerIdeas(
  ideasToRevise: GapFillIdea[],
  feedbackByIdeaId: Map<string, string>,
  productionContext = ""
): Promise<{ ideas: GapFillIdea[]; costUsd: number }> {
  const prompt =
    `You are the Creative Director for a Scripture video production, revising specific shot ideas in response to ` +
    `the Production Director's feedback. For each idea below, either adjust it to address the feedback, or -- if ` +
    `the feedback makes clear the idea doesn't belong -- replace it with a genuinely different idea that does. Keep ` +
    `every other field (framing, decorum reasoning, etc.) fully filled in on your revision, not just the parts that ` +
    `changed. Keep exact targetShotId values for existing-shot operations.\nPRODUCTION CONTEXT AND HARD CONSTRAINTS:\n${productionContext}\n\n` +
    ideasToRevise
      .map(
        (idea, i) =>
          `IDEA ${i + 1} (id: ${idea.id}):\n${JSON.stringify(idea, null, 2)}\n\n` +
          `PRODUCTION DIRECTOR'S FEEDBACK ON THIS IDEA:\n${feedbackByIdeaId.get(idea.id) ?? "(no specific feedback recorded)"}\n`
      )
      .join("\n---\n\n") +
    `\nReturn one revised idea per input idea, in the same order, each with its original "id" value unchanged.`;

  const schemaWithId: GeminiJsonSchema = {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            operation: { type: "string", enum: ["new_shot", "reorder_existing", "extend_existing"] },
            targetShotVerseRef: { type: "string" },
            targetShotId: { type: "string" },
            label: { type: "string" },
            description: { type: "string" },
            framing: { type: "string" },
            cameraMovement: { type: "string" },
            setting: { type: "string" },
            charactersInvolved: { type: "array", items: { type: "string" } },
            estimatedDurationSec: { type: "number" },
            narrativeRationale: { type: "string" },
            decorumRationale: { type: "string" },
            kind: { type: "string", enum: ["continuity", "invented"] }
          },
          required: [
            "id",
            "operation",
            "targetShotVerseRef",
            "targetShotId",
            "label",
            "description",
            "framing",
            "cameraMovement",
            "setting",
            "charactersInvolved",
            "estimatedDurationSec",
            "narrativeRationale",
            "decorumRationale",
            "kind"
          ]
        }
      }
    },
    required: ["ideas"]
  };

  const { result, costUsd } = await generateJsonMetered<{ ideas: GapFillIdea[] }>(prompt, schemaWithId);
  const expected = new Set(ideasToRevise.map(i => i.id));
  if (!Array.isArray(result.ideas) || result.ideas.length !== expected.size ||
      new Set(result.ideas.map(i => i.id)).size !== expected.size || result.ideas.some(i => !expected.has(i.id))) {
    throw new Error("Creative revision changed, duplicated or omitted an idea ID.");
  }
  return { ideas: result.ideas, costUsd };
}
