/** Generate one source-timed Scene 2 picture-continuation candidate at a time. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const shotId = "cec159dc-4d9d-4daf-a7bc-63aac1ed401b";
const slot = process.argv[2] ?? "a";
if (!["a", "b", "c"].includes(slot)) throw new Error("Expected continuation slot a, b, or c.");
const parentMarker = slot === "b" ? "mark3-scene2-verse7-8-continuation-a-v1" : "mark3-scene2-verse7-8-continuation-b-v3";
const marker = `mark3-scene2-verse7-8-continuation-${slot}-${slot === "b" ? "v3" : "v1"}`;
const frameRel = `generated/keyframes/review/${marker}-start.png`;

async function run(): Promise<void> {
  const db = getDb();
  const scene = db.prepare("SELECT scene_id FROM shots WHERE id=?").get(shotId) as { scene_id: string } | undefined;
  if (scene?.scene_id !== "dcfeacde-0b67-4a40-be25-2762ae1d5d92") throw new Error("Scene 2 shot identity changed.");
  const existing = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(shotId, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (existing) { console.log(JSON.stringify({ reused: true, ...existing })); return; }
  const parent = slot === "a"
    ? db.prepare("SELECT id,result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'")
      .get("ccbe55f1-afa7-4550-a1c9-05ef60071660", shotId) as { id: string; result_asset_path: string | null; status: string } | undefined
    : db.prepare("SELECT id,result_asset_path,status FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
      .get(shotId, `${parentMarker}%`) as { id: string; result_asset_path: string | null; status: string } | undefined;
  if (!parent || !["accepted", "hold_for_review"].includes(parent.status) || !parent.result_asset_path) throw new Error("Reviewed parent take missing.");
  const root = join(getDataDir(), "assets");
  const parentPath = join(root, parent.result_asset_path);
  if (!existsSync(parentPath)) throw new Error("Approved parent file missing.");
  const framePath = join(root, frameRel);
  mkdirSync(dirname(framePath), { recursive: true });
  if (!existsSync(framePath)) execFileSync("ffmpeg", ["-v", "error", "-n", "-ss", "7.9", "-i", parentPath, "-frames:v", "1", framePath], { stdio: "pipe" });
  const motion = slot === "a"
    ? "Subtle handheld follow from the same camera axis"
    : slot === "b"
      ? "A gentle lateral camera drift toward the following crowd while Jesus and his disciples remain visible, then settle"
      : "A gradual wider pullback opens the shoreline and shows the breadth of the following crowd while keeping Jesus and his disciples identifiable";
  const prompt = slot === "b"
    ? `${marker}. Animate the supplied photorealistic 16:9 landscape keyframe as a restrained eight-second walking shot. The same central cream-robed man and the same rust-robed and white-bearded companions continue forward along the ancient dark-stone waterfront lane. Preserve their exact faces, dark skin tones, hair, robe colors, body proportions, and place in frame. Background followers stay several steps back, softly focused, walking at individually varied paces with hands low. A gentle lateral tracking move gives natural parallax. No one raises an arm, waves, speaks, reaches forward, changes identity, enters the foreground, or makes a repeated group gesture. No cut, text, modern object, or new action. Source narration will be added separately; discard generated audio.`
    : slot === "c"
      ? `${marker}. Photorealistic 16:9 landscape continuation from this exact reviewed last frame. The same three foreground men keep walking forward through the ancient dark-stone waterfront lane, with unchanged Papuan faces, dark skin tones, hair, cream-and-blue, rust, and cream garments. A gentle widening camera move reveals more lake beyond the buildings while the followers continue several steps behind at different paces. Background hands stay low; there is no wave, reaching, cheering, group rhythm, spoken mouth movement, added person, costume change, boat-preparation action, healing, text, modern object, or cut. The continuous original-language narration is added separately and generated audio is discarded.`
      : `${marker}. Continue the exact reviewed Mark 3:7–8 waterfront take from its last frame, in photorealistic 16:9 landscape. Keep the same Papuan/Hatam Jesus, disciples, and dense but individually moving crowd, with identical faces, garments, proportions, dark pupils, first-century basalt waterfront and daylight. Jesus and the disciples continue withdrawing along the shore as more people follow from behind and the sides. ${motion}; never reverse their direction or teleport anyone. The crowd reacts at independent times in small clusters, never as a synchronized wave. Nobody raises arms above the shoulders, waves, cheers, or copies a neighboring person's motion. No boat direction yet, no healing action yet, no new named character, visible speaking, intelligible speech, narration, text, modern objects, costume change, identity drift, or camera cut. The real continuous Hatam narration will be laid under the edit; provider audio will be discarded.`;
  const startFramePath = slot === "b"
    ? "generated/keyframes/codex/cec159dc-4d9d-4daf-a7bc-63aac1ed401b/scene-2-shot-1-tight-follow-coverage-r1.png"
    : frameRel;
  if (!existsSync(join(root, startFramePath))) throw new Error("Continuation keyframe missing.");
  const result = await new GeminiVideoProvider().generateFinal(
    { shotId: `${shotId}-${marker}-${randomUUID()}`, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: startFramePath }, durationSeconds: 8, tier: "economy" }
  );
  if (!result.media?.path) throw new Error("Provider returned no video.");
  const now = Date.now(), attemptId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)")
      .run(attemptId, shotId, result.provenance.provider, result.provenance.model, "generate_final_video", prompt, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, shotId, `${marker}: source-timed continuation candidate anchored to reviewed attempt ${parent.id}, start frame ${startFramePath}. Inspect canon, crowd movement, continuity, and source fidelity before selection.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, path: result.media.path, costUsd: result.cost.usd, frameRel }));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
