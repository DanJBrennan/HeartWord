import React from "react";

export interface ChapterEndingPlan {
  nextChapterRef: string | null;
  shots: Array<{ role: string; description: string; reason: string; currentEvidence: string; nextEvidence: string; durationMs: number; audio: string }>;
  sourceClockEndMs: number;
  postSourceDurationMs: number;
  reasoning: string;
  status: "proposed" | "needs_review";
  reviewNotes: string[];
}
function currentPlan(value: unknown): value is ChapterEndingPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as ChapterEndingPlan;
  return typeof plan.status === "string" && typeof plan.reasoning === "string"
    && Number.isFinite(plan.sourceClockEndMs) && Number.isFinite(plan.postSourceDurationMs)
    && Array.isArray(plan.shots) && plan.shots.every(shot => shot && Number.isFinite(shot.durationMs))
    && Array.isArray(plan.reviewNotes);
}
/** Historical beats-based records remain inspectable without inventing a
 * modern plan, inferred approval, duration, or migration of producer history. */
export function ChapterEndingPlanView({ plan }: { plan: unknown }) {
  if (!plan) return null;
  if (!currentPlan(plan)) return <details className="scene-block"><summary>Saved chapter ending record</summary><p>This record uses an earlier format. Its saved contents are retained below.</p><pre>{JSON.stringify(plan, null, 2)}</pre></details>;
  return <div className="scene-block">
    <h3>Chapter ending — {plan.status.replaceAll("_", " ")}</h3>
    <p>After the complete source recording ({(plan.sourceClockEndMs / 1000).toFixed(1)}s), {plan.shots.length} wordless transition shot{plan.shots.length === 1 ? "" : "s"} may hint at {plan.nextChapterRef ?? "the next chapter"} for {(plan.postSourceDurationMs / 1000).toFixed(1)}s. Natural ambience; optional score.</p>
    <p className="hint">{plan.reasoning} Inferred movement is visual staging, not narrated Scripture.</p>
    {plan.reviewNotes.map((note, index) => <p className="error" key={index}>{note}</p>)}
    <ol>{plan.shots.map((shot, index) => <li key={index}><strong>{shot.role}</strong> ({(shot.durationMs / 1000).toFixed(1)}s) — {shot.description} Purpose: {shot.reason} Current: “{shot.currentEvidence}”; next: “{shot.nextEvidence}”. Media is not assigned; reuse requires target-shot review.</li>)}</ol>
  </div>;
}
