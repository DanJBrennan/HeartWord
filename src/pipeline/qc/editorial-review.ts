import type { CrewBrief } from "../creative-direction/crew-types.js";

/** The producer's Mark 3 corrections, expressed as reusable whole-cut questions. */
export const EDITORIAL_CHECKS = [
  "repeated_coverage", "speaking_framing", "speaker_mouth", "static_action",
  "scene_continuity_canon", "pause_and_ambience"
] as const;
export type EditorialCheckName = typeof EDITORIAL_CHECKS[number];
export interface EditorialCheck {
  name: EditorialCheckName;
  status: "clear" | "concern" | "unverified" | "not_applicable";
  startMs: number;
  endMs: number;
  evidence: string;
  requestedChange: string;
}

/** Metadata narrows the reviewer's search; it never substitutes for watching the cut. */
export function editorialReviewTargets(brief: CrewBrief): string[] {
  const render = brief.render;
  if (!render) return [];
  const targets: string[] = [];
  const timeline = render.timeline;
  for (let i = 0; i < timeline.length;) {
    let j = i + 1;
    while (j < timeline.length && timeline[j]!.shotId === timeline[i]!.shotId) j++;
    const duration = timeline[j - 1]!.endMs - timeline[i]!.startMs;
    if (j - i >= 2 && duration >= 12000) targets.push(`Repeated shot ${timeline[i]!.shotId}: ${timeline[i]!.startMs}-${timeline[j - 1]!.endMs} ms (${j - i} consecutive placements); inspect actual angles and purpose.`);
    i = j;
  }
  const counts = new Map<string, number>();
  for (const item of timeline) counts.set(item.shotId, (counts.get(item.shotId) ?? 0) + 1);
  for (const [shotId, count] of counts) if (count >= 3) targets.push(`Shot ${shotId} appears ${count} times; inspect for obvious recycled footage.`);
  for (const item of timeline) {
    const shot = brief.shots.find(s => s.id === item.shotId);
    if (shot?.needsLipSync && /\b(wide|long|establishing)\b/i.test(shot.framing ?? ""))
      targets.push(`Speaking shot ${shot.id} at ${item.startMs}-${item.endMs} ms is planned ${shot.framing}; verify the actual speaker is face-readable and any wide view is intentional.`);
  }
  return [...new Set(targets)];
}

export function editorialChecksNeedRevision(checks: EditorialCheck[] | undefined): boolean {
  return !checks || EDITORIAL_CHECKS.some(name => !checks.some(check => check.name === name &&
    (check.status === "clear" || check.status === "not_applicable")));
}
