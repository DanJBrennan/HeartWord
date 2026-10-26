/** Review only the exact 3.25-second silent placement from shot 29. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(checkout, "output", "mark4-donor-20261024");
const rel = relative(checkout, root);
if (rel === ".." || rel.startsWith(`..${sep}`) || root.toLowerCase().includes("heartworddata")) throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR = root;
const projectId = "a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId = "632e9a87-93d3-49cc-a3a0-394e0f8ee121";
const mode = process.argv[2] ?? "draft";
if (mode !== "draft" && mode !== "final") throw Error("Expected draft or final placement review");
const attemptId = mode === "draft" ? "0a71d833-7655-4ad9-9b6c-44bfac6c73ae" : "91f77d41-179d-4a93-a0b0-00ffa6360cc6";
const operation = mode === "draft" ? "generate_draft" : "generate_final_video";
const [{ getDb }, { reviewGeneratedVideo, videoReviewPassed }, { checkFilmSpend }] = await Promise.all([
  import("../src/db/client.js"), import("../src/pipeline/qc/video-review.js"),
  import("../src/pipeline/voice-lipsync/performance-direction.js")
]);
const db = getDb();
const attempt = db.prepare("SELECT status,result_asset_path,prompt FROM generation_attempts WHERE id=? AND shot_id=? AND operation=?")
  .get(attemptId, shotId, operation) as { status:string;result_asset_path:string;prompt:string } | undefined;
const keyframe = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as { result_asset_path:string } | undefined;
if (attempt?.status !== "hold_for_review" || !attempt.result_asset_path || !keyframe) throw Error("Reviewed source assets missing");
const noteMarker = `${mode === "draft" ? "Draft" : "Final"} ${attemptId} exact 3.25s placement review:`;
if (db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND note LIKE ?")
  .get(projectId, shotId, `${noteMarker}%`)) throw Error("Placement already reviewed");

const source = join(root, "assets", attempt.result_asset_path);
const videoPath = mode === "draft"
  ? join(root, "assets", "review", "meyah-mark4-shot029-ltx-draft-20261026", "placement-first-78-frames.mp4")
  : join(root, "assets", "review", "meyah-mark4-shot029-final-review-20261026", "final-placement-first-78-frames.mp4");
const provenancePath = `${videoPath}.json`;
const hash = (path:string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceSha256 = hash(source);
if (existsSync(videoPath) || existsSync(provenancePath)) {
  if (!existsSync(videoPath) || !existsSync(provenancePath)) throw Error("Partial placement artifact");
  const proof = JSON.parse(readFileSync(provenancePath, "utf8")) as { sourceSha256:string; placementSha256:string };
  if (proof.sourceSha256 !== sourceSha256 || proof.placementSha256 !== hash(videoPath)) throw Error("Placement provenance changed");
} else {
  execFileSync("ffmpeg", ["-v","error","-n","-i",source,"-map","0:v:0","-frames:v","78","-an","-c:v","libx264","-crf","18","-movflags","+faststart",videoPath], { windowsHide:true });
  const frames = Number(execFileSync("ffprobe", ["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","csv=p=0",videoPath], { encoding:"utf8",windowsHide:true }).trim());
  if (frames !== 78) throw Error(`Expected 78 frames, got ${frames}`);
  writeFileSync(provenancePath, JSON.stringify({ source, sourceSha256, videoPath, placementSha256:hash(videoPath), frameCount:78, fps:24, durationSeconds:3.25, transformation:"First 78 decoded video frames of original draft; H264 CRF18; audio removed; review only" }, null, 2)+"\n", { flag:"wx" });
}
checkFilmSpend(db, projectId, 2);
const review = await reviewGeneratedVideo({ videoPath, keyframePath:join(root,"assets",keyframe.result_asset_path), instruction:attempt.prompt+" Evaluate only the exact first 3.25 seconds selected for the film. The remainder of this LTX take is not used." });
const passed = videoReviewPassed(review.verdict);
const now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES(?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,review.costUsd,now);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,`${noteMarker} ${passed?"passed":"FAILED"} (confidence ${review.verdict.confidence}): ${review.verdict.reason}`,now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
const receipt = { kind:`isolated_meyah_mark4_shot029_${mode}_exact_placement_qc`, projectId, shotId, attemptId,
  sourceSha256, placementSha256:hash(videoPath), frameCount:78, durationSeconds:3.25,
  passed, verdict:review.verdict, costUsd:review.costUsd, producerDecision:"pending", liveDatabaseOpened:false };
writeFileSync(join(root,"review",mode === "draft" ? "meyah-mark4-shot029-exact-placement-qc-20261026.json" : "meyah-mark4-shot029-final-exact-placement-qc-20261026.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt,null,2));
