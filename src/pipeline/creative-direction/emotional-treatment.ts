import type { CrewBrief, CrewContribution, CrewPhase, CrewRole } from "./crew-types.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";

/** Intent in existing crew records, never a second audio timeline or approval. */
export interface EmotionalTreatment {
  version: 1;
  progression: string;
  beats: Array<{
    id: string; shotIds: string[];
    sourceTrigger: { verseRef: string; textKind: "source" | "reference"; quote: string };
    audienceExperience: string; characterResponse: string; intensity: string;
    filmableMeans: string; progression: string; limitations: string;
  }>;
  pauses: Array<{
    beatId: string; afterSegmentId: string | null; durationMs: number;
    purpose: string; timingBasis: string; coverageShotIds: string[];
    coverageNeed: string; costImplication: string;
  }>;
  cues: Array<{
    beatId: string; kind: "music" | "ambience"; purpose: string;
    timingBasis: string; entrance: string; release: string;
    coverageNeed: string; costImplication: string;
    speechPriority: string;
  }>;
}
export interface TreatmentReview {
  status: "clear" | "concern" | "unverified"; evidence: string; requestedChange: string;
  confidence: number; limitations: string;
}
export interface EmotionalBeatCheck extends TreatmentReview { beatId: string; startMs: number; endMs: number }
export interface AcceptedEmotionalTreatment {
  runId: string; briefHash: string; treatment: EmotionalTreatment; producerOverrideShotIds: string[];
}

export const TREATMENT_REVIEW_ROLES: readonly CrewRole[] = ["picture_editor", "sound_designer", "composer",
  "scripture_cultural_reviewer", "fidelity_challenger", "clarity_challenger", "feasibility_challenger"];
export const EMOTIONAL_TREATMENT_POLICY = `ADVANCE EMOTIONAL TREATMENT: In planning, Rufus must return emotionalTreatment version 1. Identify each major passage beat, with stable id, exact sourceTrigger (verseRef, textKind source/reference, verbatim quote), actual shotIds, audienceExperience, characterResponse, qualitative intensity, filmableMeans, progression and limitations. Cover every planned shot and every supplied verse; reviewers judge whether the major turns are genuinely represented rather than merely checked off. Explain the chapter's emotional progression and why each turn follows the preceding one, not a uniform mood. Consider motivated close-ups, anticipation, reactions, establishing/context views, openings, endings, ambience, musical entrances/releases and wordless space. Explain useful choices and omitted options in filmableMeans/progression. A 24-second introduction and a pull-away ending are possibilities to justify, never quotas. Respect existing separate opening/ending plans and producer decisions.
For each beat, sourceTrigger.verseRef is the full supplied verse RANGE covered by that beat's shotIds, not merely one climactic verse. Every assigned shot's verse scope must overlap it, and the ordered beat ranges together must cover every supplied verse. Copy sourceTrigger.quote as one contiguous, exact substring of the supplied source or reference text in that range; preserve spelling, punctuation and apostrophes. Do not retype from memory, paraphrase, add ellipses or join separated fragments. Use textKind reference when copying the supplied English reference; never reconstruct Hatam. Include newly added supplementary shot IDs in the appropriate source beat, even when their saved sequence numbers are at the end of a scene. Historical shot lists are not the current complete roster.
Every proposed pause needs beatId, afterSegmentId (null before source), durationMs, purpose, timingBasis, coverageShotIds, coverageNeed and costImplication. Use existing whole-segment boundaries; an internal speechRun boundary additionally requires safePauseAfter evidence. Do not infer exact Hatam phrase timing from English. If a necessary boundary is unresolved, raise a blocking finding rather than fabricating it. Pause coverage must be wordless, never a speaking face extended beyond supplied speech. Stretch means more presentation time through explicit safe pauses/additional picture, never slower speech, syllable separation, omitted or reordered words.
Every proposed cue needs beatId, kind (music/ambience), purpose, timingBasis, entrance, release, coverageNeed, costImplication and speechPriority. Timing may reference source/beat boundaries honestly; finishing resolves milliseconds from the actual spaced cut. Continuous or sectional music is allowed when justified by the scene/action. Fuller music can occupy suitable speech-free space. Keep transitions, levels, arrangement, releases and mobile listening clarity reviewable; music never overwhelms narration/dialogue. Ambience contains no invented dialogue, including unintelligible voices. Do not claim unreported cost is zero: the cumulative direct film ceiling is $200 including planning, critic reviews, rejected work and retries; account for outstanding charges before spending. Keyframes use the assistant-operated built-in image handoff, never a paid-image fallback.
Nell, Sam, Composer, Miriam, Ada, Theo and Cora must return treatmentReview {status: clear/concern/unverified, evidence, requestedChange, confidence: 0-100 uncalibrated, limitations} during planning, explicitly assessing the current Rufus treatment within their lens; concern or uncertainty holds acceptance through the existing objection lifecycle. Sam and Composer plan here without claiming to have heard a cut: audioCues and generationRequests remain empty until finishing. The Director accepts only after the treatment and applicable reviews pass; no additional producer chapter-plan signature is needed. In editing and finishing, acceptedEmotionalTreatment is the accepted plan, pinned to its planning run/hash. Preserve producer overrides over conflicting old craft direction. Apply it through existing edits, pauses and sound controls, retaining any justified departures in directions/findings. In finishing Nell must return emotionalBeatChecks for every accepted beat, with actual-cut timestamps, status clear/concern/unverified, concrete effect evidence, requestedChange, confidence and limitations. Sam and Composer must return treatmentReview assessing scene fit, entrances/releases, speech priority, transitions, levels and phone-speaker clarity on the actual proxy; insufficient listening evidence is unverified, never claimed human/mobile approval.`;

const text = { type: "string" };
const array = (items: unknown) => ({ type: "array", items });
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties) });
export const treatmentReviewSchema = object({ status: { type: "string", enum: ["clear", "concern", "unverified"] }, evidence: text, requestedChange: text, confidence: { type: "number" }, limitations: text });
export const emotionalBeatCheckSchema = object({ ...treatmentReviewSchema.properties, beatId: text, startMs: { type: "number" }, endMs: { type: "number" } });
export const emotionalTreatmentSchema = object({
  // Gemini's responseSchema enum values are strings; the live API rejects
  // numeric enum entries before generation. Runtime validation below still
  // requires the numeric version to be exactly 1.
  version: { type: "integer", description: "Treatment format version; return the number 1." }, progression: text,
  beats: array(object({ id: text, shotIds: array(text), sourceTrigger: object({ verseRef: text, textKind: { type: "string", enum: ["source", "reference"] }, quote: text }),
    audienceExperience: text, characterResponse: text, intensity: text, filmableMeans: text, progression: text, limitations: text })),
  pauses: array(object({ beatId: text, afterSegmentId: { type: "string", nullable: true }, durationMs: { type: "number" }, purpose: text,
    timingBasis: text, coverageShotIds: array(text), coverageNeed: text, costImplication: text })),
  cues: array(object({ beatId: text, kind: { type: "string", enum: ["music", "ambience"] }, purpose: text, timingBasis: text,
    entrance: text, release: text, coverageNeed: text, costImplication: text, speechPriority: text }))
});

function obj(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error("Invalid emotional treatment fields.");
  return value as Record<string, any>;
}
function prose(...values: unknown[]) {
  if (values.some(v => typeof v !== "string" || !v.trim() || v.length > 12000)) throw new Error("Emotional treatment needs bounded purpose, evidence and limitations.");
}
function items(value: unknown): any[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid emotional treatment list.");
  return value;
}
function positive(value: unknown, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) throw new Error("Invalid emotional treatment timing.");
}
export function validateEmotionalTreatment(raw: unknown, brief: CrewBrief): EmotionalTreatment {
  const t = obj(raw, ["version", "progression", "beats", "pauses", "cues"]);
  if (t.version !== 1) throw new Error("Emotional treatment version 1 is required.");
  prose(t.progression);
  const beatIds = new Set<string>(), coveredShots = new Set<string>(), coveredVerses = new Set<number>();
  let previousVerse = 0;
  for (const rawBeat of items(t.beats)) {
    const b = obj(rawBeat, ["id", "shotIds", "sourceTrigger", "audienceExperience", "characterResponse", "intensity", "filmableMeans", "progression", "limitations"]);
    prose(b.id, b.audienceExperience, b.characterResponse, b.intensity, b.filmableMeans, b.progression, b.limitations);
    if (beatIds.has(b.id)) throw new Error("Duplicate emotional beat ID.");
    beatIds.add(b.id);
    const trigger = obj(b.sourceTrigger, ["verseRef", "textKind", "quote"]);
    prose(trigger.verseRef, trigger.quote);
    const match = trigger.verseRef.match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/);
    if (!match || match[1].toLowerCase() !== brief.project.book.toLowerCase() || Number(match[2]) !== brief.project.chapter || !["source", "reference"].includes(trigger.textKind)) throw new Error("Emotional trigger belongs to a different source/chapter.");
    const range = parseVerseRange(trigger.verseRef);
    if (range.end < range.start || range.start < previousVerse) throw new Error("Emotional beats must follow source order.");
    previousVerse = range.start;
    const verses = (trigger.textKind === "source" ? brief.source.text : brief.source.reference).filter(v => v.verse >= range.start && v.verse <= range.end);
    if (verses.length !== range.end - range.start + 1 || !verses.map(v => v.text).join(" ").includes(trigger.quote)) throw new Error("Emotional trigger must quote the supplied Scripture range exactly.");
    for (const v of verses) coveredVerses.add(v.verse);
    const shotIds = items(b.shotIds);
    if (!shotIds.length || new Set(shotIds).size !== shotIds.length) throw new Error("Emotional beat needs distinct planned shots.");
    for (const id of shotIds) {
      const shot = brief.shots.find(s => s.id === id);
      if (!shot) throw new Error("Emotional beat names an unknown or foreign shot.");
      const scope = parseVerseRange(shot.verseRef);
      if (scope.end < range.start || scope.start > range.end) throw new Error("Emotional beat and shot Scripture scopes do not overlap.");
      coveredShots.add(id);
    }
  }
  if (brief.shots.some(s => !coveredShots.has(s.id)) || brief.source.text.some(v => !coveredVerses.has(v.verse)) || !beatIds.size) throw new Error("Emotional treatment must cover the chapter's shots and source verses.");
  const boundaries = new Set<string | null>();
  for (const rawPause of items(t.pauses)) {
    const p = obj(rawPause, ["beatId", "afterSegmentId", "durationMs", "purpose", "timingBasis", "coverageShotIds", "coverageNeed", "costImplication"]);
    if (!beatIds.has(p.beatId)) throw new Error("Pause has no emotional beat.");
    prose(p.purpose, p.timingBasis, p.coverageNeed, p.costImplication); positive(p.durationMs, 120000);
    const boundary = brief.audio.find(a => a.id === p.afterSegmentId);
    if (p.afterSegmentId !== null && !boundary) throw new Error("Emotional pause must follow a complete known source segment.");
    if (boundary?.provenance === "unassigned_source_interval" || (boundary?.speechRun && boundary.endMs < boundary.speechRun.endMs && !boundary.safePauseAfter)) throw new Error("Emotional pause needs independently reviewed safe-boundary evidence.");
    if (boundary && brief.shots.some(s => s.needsLipSync && s.utterance && s.utterance.startMs < boundary.endMs && s.utterance.endMs > boundary.endMs)) throw new Error("Emotional pause cannot split an existing supplied speaking performance; use wordless coverage at a safe boundary outside it.");
    if (boundaries.has(p.afterSegmentId)) throw new Error("Duplicate emotional pause boundary.");
    boundaries.add(p.afterSegmentId);
    if (!items(p.coverageShotIds).length || p.coverageShotIds.some((id: string) => !brief.shots.some(s => s.id === id && !s.needsLipSync))) throw new Error("Emotional pause requires wordless coverage, never an extended speaking face.");
  }
  for (const rawCue of items(t.cues)) {
    const c = obj(rawCue, ["beatId", "kind", "purpose", "timingBasis", "entrance", "release", "coverageNeed", "costImplication", "speechPriority"]);
    if (!beatIds.has(c.beatId) || !["music", "ambience"].includes(c.kind)) throw new Error("Cue has no valid emotional beat or kind.");
    prose(c.purpose, c.timingBasis, c.entrance, c.release, c.coverageNeed, c.costImplication, c.speechPriority);
  }
  return raw as EmotionalTreatment;
}
function validateReview(value: unknown) {
  const review = obj(value, ["status", "evidence", "requestedChange", "confidence", "limitations", "beatId", "startMs", "endMs"]);
  if (!["clear", "concern", "unverified"].includes(review.status)) throw new Error("Emotional treatment needs an explicit review verdict.");
  prose(review.evidence, review.limitations);
  if (typeof review.requestedChange !== "string" || review.requestedChange.length > 12000 ||
      (review.status !== "clear" && !review.requestedChange.trim())) {
    throw new Error("Treatment concerns and uncertainty require a requested change.");
  }
  if (!Number.isFinite(review.confidence) || review.confidence < 0 || review.confidence > 100) throw new Error("Treatment verdict requires bounded agent confidence and limitations.");
}
/** Phase-dependent requirements leave historical saved replies readable. */
export function validateTreatmentHandoff(output: CrewContribution, role: CrewRole, phase: CrewPhase, brief: CrewBrief, treatment?: EmotionalTreatment) {
  if (phase === "planning" && role === "creative_director") validateEmotionalTreatment(output.emotionalTreatment, brief);
  if ((phase === "planning" && TREATMENT_REVIEW_ROLES.includes(role)) || (phase === "finishing" && brief.acceptedEmotionalTreatment && ["sound_designer", "composer"].includes(role))) validateReview(output.treatmentReview);
  if (phase === "planning" && ["sound_designer", "composer", "picture_editor"].includes(role) && (output.audioCues?.length || output.generationRequests?.length || output.pauses?.length || output.edits?.length)) throw new Error("Advance treatment uses planning intent; execution waits for the existing editing/finishing controls.");
  if (phase === "finishing" && role === "picture_editor" && treatment) {
    const checks = items(output.emotionalBeatChecks), seen = new Set<string>();
    for (const check of checks) {
      validateReview(check);
      if (seen.has(check.beatId) || !treatment.beats.some(b => b.id === check.beatId)) throw new Error("Unknown or duplicate emotional beat review.");
      seen.add(check.beatId);
      if (!Number.isFinite(check.startMs) || !Number.isFinite(check.endMs) || check.startMs < 0 || check.endMs <= check.startMs || check.endMs > brief.render!.durationMs) throw new Error("Emotional effect review needs actual-cut timestamps.");
    }
    if (seen.size !== treatment.beats.length) throw new Error("Review the effect of every accepted emotional beat on the actual cut.");
  }
}
export function treatmentNeedsRevision(contributions: Partial<Record<CrewRole, CrewContribution>>): boolean {
  return Object.values(contributions).some(c => (c.treatmentReview && c.treatmentReview.status !== "clear") || c.emotionalBeatChecks?.some(b => b.status !== "clear"));
}
export function emotionalDirection(treatment: EmotionalTreatment | undefined, shotId: string): string {
  if (!treatment) return "";
  const beats = treatment.beats.filter(b => b.shotIds.includes(shotId));
  return `\nACCEPTED EMOTIONAL TREATMENT (intent, not permission to retime speech):\n${JSON.stringify({ progression: treatment.progression, beats,
    pauses: treatment.pauses.filter(p => beats.some(b => b.id === p.beatId)), cues: treatment.cues.filter(c => beats.some(b => b.id === c.beatId)) })}\n`;
}
