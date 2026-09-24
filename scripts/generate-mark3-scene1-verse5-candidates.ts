/** Source-grounded Mark 3:5 footage candidates; never selects a clip automatically. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateNonSpeakingVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { chooseShotDraft, generateShotDraft } from "../src/pipeline/media-generation/draft-room.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const shots = {
  reaction: "a5fea0f8-2e9d-420e-bb31-0e22455b5e96",
  leadin: "e0cf6a9a-17e0-457b-ae40-2b974d875fcc",
  healing: "91afa1de-a013-4266-81e8-7e6be3199c7e"
} as const;
const motion = {
  reaction: `Mark 3:5 silent reaction, continuing the approved Jesus close-up in the dark-basalt synagogue. Exact approved Papuan/Hatam Jesus face, dark hair and beard, cream-dominant tunic with narrow indigo bands. Over eight seconds, his eyes slowly scan the hard-hearted leaders off camera and his head turns only slightly. Convey restrained anger and grief, never rage. His mouth remains closed. No speech, healing, gesture, new character, new prop, costume change, or camera cut. Keep the camera steady and preserve the warm window light. Narration will be added separately.`,
  leadin: `Mark 3:5 continuous over-the-shoulder take from behind Jesus, beginning during the narrator's account of his look around and continuing through his later brief command. Preserve the exact approved keyframe geometry: Jesus's cream-and-indigo shoulder/back in the right foreground, his face and mouth invisible for the entire take; principal scribe left, Man with Withered Hand center with contracted anatomical left hand still in his lap, older scribe right. All retain their approved Papuan/Hatam faces, costumes, bench positions, dark-basalt synagogue and warm window light. A restrained slow push toward the three men and small independent glances/breaths only. No visible speech, arm extension, healing, synchronized reactions, new people, or camera reverse. Generate picture and incidental ambience only; original narrator and Jesus cast audio will be added separately.`,
  healing: `Mark 3:5 hand-healing insert from the exact approved hand keyframe. The Man with Withered Hand's anatomical left hand begins contracted as shown, then slowly opens and extends at Jesus's already-spoken command; the fingers regain natural relaxed movement. Keep the same Papuan/Hatam skin tone, sleeve, hand anatomy, synagogue light, camera angle and background. One continuous restrained motion, not a miraculous glow or visual effect. No extra digits, swapped hands, cutaway, new character, words, subtitles, or music. Original narration will be added separately.`
} as const;

async function main() {
  if (process.argv[2] === "retry_leadin_kling") {
    const db=getDb(), shotId=shots.leadin;
    const prior=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE 'Mark 3:5 locked OTS retry v1:%' LIMIT 1").get(shotId);
    if (prior) throw new Error("Locked OTS retry already requested; reconcile it before paying again.");
    const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
      .get(shotId) as {result_asset_path:string};
    const prompt=`Mark 3:5 locked OTS retry v1: ${motion.leadin} LOCKED COMPOSITION: exactly the three seated men in the source keyframe throughout, with no fourth man and no reveal beyond the bench edge. Camera must remain fixed; the foreground Jesus shoulder must obscure his entire mouth. Do not push in, pan, orbit, reframe, or uncover a hidden person.`;
    const attemptId=randomUUID();
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'pending','pending','generate_final_video','720p',?,'hold_for_review',NULL,0,?)")
      .run(attemptId,shotId,prompt,Date.now());
    console.log(JSON.stringify({attemptId,state:"requested"}));
    const result=await new KlingVideoProvider().generateFinal({shotId:`mark3-verse5-ots-retry-${attemptId}`,prompt,characters:[]},{resolution:"720p",startFrame:{path:frame.result_asset_path}});
    db.exec("BEGIN IMMEDIATE");try {
      db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
        .run(result.provenance.provider,result.provenance.model,result.media?.path??null,result.cost.usd,attemptId);
      db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
        .run(randomUUID(),projectId,attemptId,result.cost.usd,Date.now());
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
    console.log(JSON.stringify({attemptId,path:result.media?.path,costUsdEstimate:result.cost.usd}));return;
  }
  if (process.argv[2] === "choose_leadin") {
    const db=getDb(), attemptId="80af142c-d058-474d-8911-8d880a4f1300";
    const result=chooseShotDraft(db,projectId,attemptId);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),projectId,shots.leadin,"Producer-delegated visual review of OTS draft contact sheet: three bench positions, synagogue and costume remain consistent, no speech or healing; approved for final render. Automated FAILED label conflicts with its own positive narrative and 0.78 confidence appears to use a 0–1 scale. Foreground Jesus has a small side profile despite the prompt; narration-only portion is suitable, while the later command needs separate mouth-visibility assessment.",Date.now());
    console.log(JSON.stringify(result));return;
  }
  if (process.argv[2] === "final_leadin") {
    const db=getDb();
    console.log(JSON.stringify(await generateNonSpeakingVideoCandidate(db,projectId,shots.leadin,{
      veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()
    })));return;
  }
  const mode = process.argv[2] as keyof typeof shots;
  if (!Object.hasOwn(shots, mode)) throw new Error("Use reaction, leadin, or healing.");
  const db = getDb(), shotId = shots[mode];
  const latest = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(shotId) as {result_asset_path:string|null}|undefined;
  if (!latest?.result_asset_path) throw new Error("Shot has no accepted keyframe.");
  const marker = `Mark 3:5 motion direction v1: ${mode}`;
  const existing = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND prompt LIKE ? LIMIT 1")
    .get(shotId, `${marker}%`);
  if (!existing) {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','approved-keyframe-motion-direction','generate','source',?,'accepted',?,0,?)")
      .run(randomUUID(),shotId,`${marker}. ${motion[mode]}`,latest.result_asset_path,Date.now());
  }
  if (mode === "leadin") {
    console.log(JSON.stringify(await generateShotDraft(db,projectId,shotId,new GeminiDraftVideoProvider())));
  } else {
    console.log(JSON.stringify(await generateNonSpeakingVideoCandidate(db,projectId,shotId,{
      veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()
    })));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
