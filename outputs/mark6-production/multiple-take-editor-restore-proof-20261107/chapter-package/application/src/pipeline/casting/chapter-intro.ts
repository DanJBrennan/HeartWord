/** Pre-source-clock opening plan, kept separate from verse-timed scene shots. */
export type IntroRole = "establishing" | "bridge" | "arrival";
export interface IntroShotProposal {
  role: IntroRole;
  description: string;
  reason: string;
  evidence: string;
  durationSec: number;
}
export interface IntroProposal {
  reasoning: string;
  shots: IntroShotProposal[];
}
export interface ChapterIntroPlan {
  titleCard: { title: string; language: string; durationMs: 2500; background: "opening_establishing_frame" | "first_story_frame"; audio: "location_ambience" };
  shots: Array<IntroShotProposal & {
    durationMs: number;
    audio: "location_ambience";
    mediaStatus: "unassigned";
    endpointRule: "none" | "match_adjacent_frames";
  }>;
  sourceClockStartMs: number;
  reasoning: string;
  status: "proposed" | "needs_review";
  reviewNotes: string[];
  reusePolicy: "candidate_only_target_review_required";
}

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Constrain model creativity to a reviewable location plan. No verse-timed
 * action, media approval, or source-audio edit can be inferred from it.
 */
export function buildChapterIntroPlan(input: {
  title: string | null;
  language: string;
  grounding: string;
  proposal?: IntroProposal | null;
}): ChapterIntroPlan {
  if (!input.title) throw new Error("A verified source-language chapter title is required for the opening card.");
  const notes: string[] = [];
  const proposal = input.proposal;
  let shots: IntroShotProposal[] = [];
  if (!proposal || !Array.isArray(proposal.shots)) {
    notes.push("No location opening was proposed; review the first scene before assigning pre-story footage.");
  } else if (proposal.shots.length > 3) {
    notes.push("Opening proposal exceeded three location shots; review instead of silently truncating it.");
  } else {
    const grounded = norm(input.grounding);
    for (const shot of proposal.shots) {
      const validRole = ["establishing", "bridge", "arrival"].includes(shot.role);
      const validDuration = Number.isFinite(shot.durationSec) && shot.durationSec >= 3 && shot.durationSec <= 8;
      const validEvidence = typeof shot.evidence === "string" && shot.evidence.trim().length >= 4 && grounded.includes(norm(shot.evidence));
      const validText = Boolean(shot.description?.trim() && shot.reason?.trim());
      if (!validRole || !validDuration || !validEvidence || !validText) {
        notes.push(`Invalid or ungrounded ${String(shot.role)} shot; review the proposed opening instead of using it.`);
        shots = [];
        break;
      }
      shots.push({ ...shot, description: shot.description.trim(), reason: shot.reason.trim(), evidence: shot.evidence.trim() });
    }
    if (shots.length && shots[0]!.role !== "establishing") {
      notes.push("An opening location sequence must begin with an establishing view.");
      shots = [];
    }
    const bridgeAt = shots.findIndex(shot => shot.role === "bridge");
    if (bridgeAt >= 0 && (shots.length !== 3 || bridgeAt !== 1 || shots[2]!.role !== "arrival")) {
      notes.push("A bridge needs both an establishing source view and a destination view; use a direct cut otherwise.");
      shots = [];
    }
    if (shots.filter(shot => shot.role === "establishing").length > 1 || shots.filter(shot => shot.role === "arrival").length > 1) {
      notes.push("The opening repeats a shot role; review its pacing before generating footage.");
      shots = [];
    }
  }
  const planned = shots.map(shot => ({
    ...shot,
    durationMs: Math.round(shot.durationSec * 1000),
    audio: "location_ambience" as const,
    mediaStatus: "unassigned" as const,
    endpointRule: shot.role === "bridge" ? "match_adjacent_frames" as const : "none" as const,
  }));
  return {
    titleCard: { title: input.title, language: input.language.toUpperCase(), durationMs: 2500,
      background: planned.length ? "opening_establishing_frame" : "first_story_frame", audio: "location_ambience" },
    shots: planned,
    sourceClockStartMs: 2500 + planned.reduce((sum, shot) => sum + shot.durationMs, 0),
    reasoning: proposal?.reasoning?.trim() || "Series title card; location opening awaits grounded first-scene planning.",
    status: notes.length ? "needs_review" : "proposed",
    reviewNotes: notes,
    reusePolicy: "candidate_only_target_review_required",
  };
}
