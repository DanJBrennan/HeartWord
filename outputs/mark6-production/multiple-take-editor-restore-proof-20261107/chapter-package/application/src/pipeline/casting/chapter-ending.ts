/** A post-source visual handoff to the next chapter, separate from verse-timed shots. */
export type EndingRole = "departure" | "journey" | "destination_hint";
export interface EndingShotProposal {
  role: EndingRole;
  description: string;
  reason: string;
  currentEvidence: string;
  nextEvidence: string;
  durationSec: number;
}
export interface ChapterEndingProposal { reasoning: string; shots: EndingShotProposal[] }
export interface ChapterEndingPlan {
  nextChapterRef: string | null;
  nextChapterFirstVerse: string | null;
  sourceClockEndMs: number;
  shots: Array<EndingShotProposal & { durationMs: number; audio: "ambience_with_optional_score"; mediaStatus: "unassigned" }>;
  postSourceDurationMs: number;
  reasoning: string;
  status: "proposed" | "needs_review";
  reviewNotes: string[];
  boundary: "after_complete_source_performance";
  reusePolicy: "candidate_only_target_review_required";
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Validate citations and timing; movement itself remains an explicit inference for producer review. */
export function buildChapterEndingPlan(input: {
  currentFinalText: string;
  nextChapterRef: string | null;
  nextChapterFirstVerse: string | null;
  sourceClockEndMs: number;
  proposal?: ChapterEndingProposal | null;
}): ChapterEndingPlan {
  if (!Number.isFinite(input.sourceClockEndMs) || input.sourceClockEndMs <= 0) throw new Error("A measured source endpoint is required.");
  const notes: string[] = [];
  const next = input.nextChapterFirstVerse?.trim() || null;
  const proposal = input.proposal;
  let shots: EndingShotProposal[] = [];
  if (!next || !input.nextChapterRef) notes.push("Next chapter's first verified reference verse is unavailable; no transition is assigned.");
  else if (!proposal || !Array.isArray(proposal.shots)) notes.push("No post-source chapter handoff was proposed; review the ending before assigning media.");
  else if (proposal.shots.length > 3) notes.push("Ending proposal exceeded three shots; review rather than truncating it.");
  else {
    for (const shot of proposal.shots) {
      const valid = ["departure", "journey", "destination_hint"].includes(shot.role)
        && Number.isFinite(shot.durationSec) && shot.durationSec >= 3 && shot.durationSec <= 8
        && Boolean(shot.description?.trim() && shot.reason?.trim())
        && typeof shot.currentEvidence === "string" && shot.currentEvidence.trim().length >= 4
        && norm(input.currentFinalText).includes(norm(shot.currentEvidence))
        && typeof shot.nextEvidence === "string" && shot.nextEvidence.trim().length >= 4
        && norm(next).includes(norm(shot.nextEvidence));
      if (!valid) { notes.push(`Invalid or ungrounded ${String(shot.role)} ending shot; no transition media is assigned.`); shots = []; break; }
      shots.push({ ...shot, description: shot.description.trim(), reason: shot.reason.trim(),
        currentEvidence: shot.currentEvidence.trim(), nextEvidence: shot.nextEvidence.trim() });
    }
    if (shots.length && shots.at(-1)!.role !== "destination_hint") { notes.push("The final ending shot must hint at the next verified location/action without depicting that chapter's scene."); shots = []; }
    if (shots.some((shot, i) => i > 0 && ["departure", "journey", "destination_hint"].indexOf(shot.role) < ["departure", "journey", "destination_hint"].indexOf(shots[i - 1]!.role))) {
      notes.push("Ending shot roles run out of order; review continuity before generating media."); shots = [];
    }
  }
  const planned = shots.map(shot => ({ ...shot, durationMs: Math.round(shot.durationSec * 1000),
    audio: "ambience_with_optional_score" as const, mediaStatus: "unassigned" as const }));
  return { nextChapterRef: input.nextChapterRef, nextChapterFirstVerse: next, sourceClockEndMs: Math.round(input.sourceClockEndMs),
    shots: planned, postSourceDurationMs: planned.reduce((sum, shot) => sum + shot.durationMs, 0),
    reasoning: proposal?.reasoning?.trim() || "No grounded post-source handoff is ready.", status: notes.length ? "needs_review" : "proposed",
    reviewNotes: notes, boundary: "after_complete_source_performance", reusePolicy: "candidate_only_target_review_required" };
}
