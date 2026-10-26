/** Read-only timing proof for the proposed full Meyah Mark 4 picture cut.
 * Uses the existing Picture Editor validator with synthetic clip availability.
 * It does not claim that unmade coverage or Avatar clips exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { planEditorialCut } from "../src/pipeline/assembly/editorial-plan.js";

const root = join(process.cwd(), "output", "mark4-donor-20261024");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const main = read("assets/review/meyah-mark4-main-shot-review-20261025/proposal.json");
const storm = read("assets/review/meyah-mark4-storm-shot-review-20261025/assembly-ready-proposal.json");
const approval = read("review/meyah-mark4-speaker-map-producer-approval.json");
if (main.sourceReviewId !== approval.reviewId || storm.sourceReviewId !== approval.reviewId ||
    main.alignmentHash !== approval.alignmentHash || storm.alignmentHash !== approval.alignmentHash ||
    main.sceneStartMs !== 0 || main.sceneEndMs !== storm.sceneStartMs || storm.sceneEndMs !== 805685) {
  throw new Error("The two picture proposals no longer join the approved source map");
}
const db = new DatabaseSync(join(root, "db", "heartword.sqlite"), { readOnly: true });
try {
  const segments = db.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,verse_ref AS verseRef,
      speaker_character_id AS speakerId FROM audio_segments
      WHERE project_id=? AND layer='original_reading' ORDER BY start_ms`).all(approval.projectId) as Array<{
    id:string; startMs:number; endMs:number; verseRef:string; speakerId:string|null;
  }>;
  if (segments.length !== 54 || segments[0]?.startMs !== 0 || segments.at(-1)?.endMs !== 805685 ||
      segments.some((segment,index) => index > 0 && segments[index-1]!.endMs !== segment.startMs)) {
    throw new Error("The isolated original-reading rows changed or have a gap");
  }
  const commands = db.prepare(`SELECT payload FROM edit_commands WHERE project_id=? AND command_type='confirm_continuous_speech'
      AND undone=0`).all(approval.projectId) as Array<{payload:string}>;
  const runBySegment = new Map<string,{id:string;startMs:number;endMs:number}>();
  for (const command of commands) {
    const run = JSON.parse(command.payload).run;
    for (const member of run.members) runBySegment.set(member.id,{id:run.id,startMs:run.startMs,endMs:run.endMs});
  }
  const audio = segments.map(segment => ({...segment,speechRun:runBySegment.get(segment.id)}));
  const all = [...main.rows,...storm.rows].filter((row:any) => row.durationMs > 0);
  if (all[0]?.targetStartMs !== 0 || all.at(-1)?.targetEndMs !== 805685 ||
      all.some((row:any,index:number) => index > 0 && all[index-1].targetEndMs !== row.targetStartMs)) {
    throw new Error("The proposed picture edit leaves an audio interval uncovered");
  }
  const shots:any[] = [];
  const edits:any[] = [];
  for (const [index,row] of all.entries()) {
    const id = `dry-run-picture-${index}`;
    const speech = row.targetSpeech;
    const matching = speech ? segments.find(segment => segment.startMs <= speech.startMs && segment.endMs > speech.startMs) : null;
    const run = matching ? runBySegment.get(matching.id) : null;
    if (speech && (!matching || !run || run.startMs > speech.startMs || run.endMs < speech.endMs)) {
      throw new Error(`Picture ${index} has no retained continuous-speech evidence`);
    }
    if (speech && row.durationMs !== speech.endMs-speech.startMs) {
      throw new Error(`Picture ${index} visibly speaks beyond the reviewed utterance`);
    }
    shots.push({id,clip:{durationMs:row.durationMs},needsLipSync:!!speech,
      dialogueCharacterId:matching?.speakerId??null,sourceSegmentId:matching?.id??null,
      verseRef:row.verseRef,
      ...(speech ? {utterance:{startMs:speech.startMs,endMs:speech.endMs,speechRunId:run!.id}} : {})});
    edits.push({shotId:id,sourceStartMs:0,durationMs:row.durationMs});
  }
  const opening = [{id:"approved-title",startMs:0,endMs:4000,durationMs:4000,path:"approved-title-reference",sha256:"reviewed-title-sha",label:"Markus 4 / Meyah"}];
  const cut = planEditorialCut({audio,shots,editorialOpening:opening} as any,{edits,pauses:[]} as any);
  if (cut.durationMs !== 809685 || cut.timeline.length !== all.length+1 || cut.audioMap[0]?.startMs !== 4000 ||
      cut.audioMap.at(-1)?.endMs !== 809685) {
    throw new Error("The synthetic Picture Editor cut did not preserve the complete source after the title");
  }
  console.log(JSON.stringify({pictureRows:all.length,originalReadingRows:segments.length,
    sourceDurationMs:805685,titleMs:4000,programmeDurationMs:cut.durationMs,
    pictureEditorValidation:"passed_with_synthetic_clip_availability",
    targetShotsCreated:0,providerRequests:0},null,2));
} finally { db.close(); }
