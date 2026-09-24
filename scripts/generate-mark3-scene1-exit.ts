/** Source-grounded Mark 3:6 departure candidate; selection happens after QC. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { generateNonSpeakingVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const shotId=process.argv[2]==="aftermath"?"14211d4d-9f42-47b5-b20b-8703b1e594ff":"7e4a0dfc-e7e3-466d-a844-0b59883b4e48";
const marker="Mark 3:6 departure motion v1";
const prompt=`${marker}. Photorealistic 16:9 landscape video from the exact approved producer-corrected synagogue doorway keyframe. Preserve the dark-basalt interior, warm high-window light, historically correct pivot-peg two-leaf timber doors and visible tzitzit. The same four dark-robed Papuan/Hatam leaders seen from behind in the still continue briskly through the open doorway toward the bright first-century street; do not duplicate, add, remove, or swap their identities. The distinct seated witnesses along both walls remain seated and react only with small independent head turns. A restrained wide camera pull-back keeps the doorway and departing group in view. No new council meeting, Herodian individual, speech, violence, weapon, written text, modern door hardware, changed costume, or camera cut. The original Mark 3:6 narration is a separate soundtrack; provider speech will be discarded.`;
const db=getDb();
const keyframe=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as {result_asset_path:string|null}|undefined;
if(!keyframe?.result_asset_path)throw new Error("Approved departure keyframe missing.");
if(process.argv[2]!=="aftermath"&&!db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND prompt LIKE ? LIMIT 1").get(shotId,`${marker}%`)){
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','approved-keyframe-motion-direction','generate','source',?,'accepted',?,0,?)")
    .run(randomUUID(),shotId,prompt,keyframe.result_asset_path,Date.now());
}
console.log(JSON.stringify(await generateNonSpeakingVideoCandidate(db,projectId,shotId,{
  veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()
})));
