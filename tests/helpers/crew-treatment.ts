import type { CrewBrief, CrewContribution, CrewRole } from "../../src/pipeline/creative-direction/crew-types.js";
import { TREATMENT_REVIEW_ROLES, type EmotionalTreatment, type TreatmentReview } from "../../src/pipeline/creative-direction/emotional-treatment.js";

export const fixtureTreatmentReview = (): TreatmentReview => ({ status: "clear", evidence: "Synthetic treatment checked against the supplied fixture; not a real film review.", requestedChange: "None for this fixture.", confidence: 88, limitations: "Scripted fixture only; no Hatam or mobile listening approval." });
export function fixtureTreatment(brief: CrewBrief): EmotionalTreatment {
  return { version: 1, progression: "Synthetic chapter: orient to the stated event, observe the response, allow reflection. Real progression requires source review.",
    beats: brief.source.reference.map(v => ({id:`beat-${v.verse}`,shotIds:brief.shots.filter(s => {
      const m=s.verseRef.match(/:(\d+)(?:[-–](\d+))?/);return m && Number(m[1])<=v.verse && Number(m[2]??m[1])>=v.verse;
    }).map(s=>s.id),sourceTrigger:{verseRef:`${brief.project.book} ${brief.project.chapter}:${v.verse}`,textKind:"reference",quote:v.text},
      audienceExperience:"Follow the stated event clearly",characterResponse:"Restrained listening to the supplied event",intensity:"Restrained",filmableMeans:"Use the planned angle; do not add an event",progression:"Retain source order and the next turn",limitations:"Synthetic fixture, not linguistic or dramatic proof"})),
    pauses:[], cues:[] };
}
export function withFixtureTreatment(prompt: string, output: CrewContribution): CrewContribution {
  const role = prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ","_") as CrewRole;
  const phase = prompt.match(/\. Phase: (\w+);/)![1];
  const brief = JSON.parse(prompt.split("CHAPTER BRIEF:\n")[1]!.split("\nTEAM CONTRIBUTIONS")[0]!) as CrewBrief;
  if (["sound_designer","composer"].includes(role)) Object.assign(output,{audioCues:output.audioCues??[],generationRequests:output.generationRequests??[]});
  if (phase === "planning" && role === "creative_director") output.emotionalTreatment=fixtureTreatment(brief);
  if ((phase === "planning" && TREATMENT_REVIEW_ROLES.includes(role)) || (phase === "finishing" && brief.acceptedEmotionalTreatment && ["sound_designer","composer"].includes(role))) output.treatmentReview=fixtureTreatmentReview();
  if (phase === "finishing" && role === "picture_editor" && brief.acceptedEmotionalTreatment) output.emotionalBeatChecks=brief.acceptedEmotionalTreatment.treatment.beats.map(b=>({...fixtureTreatmentReview(),beatId:b.id,startMs:0,endMs:brief.render!.durationMs}));
  return output;
}
