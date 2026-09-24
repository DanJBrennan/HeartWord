/** One-at-a-time continuations for the measured non-speaking Scene 2 gaps. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId = "dcfeacde-0b67-4a40-be25-2762ae1d5d92";
const configs = {
  s2: {
    shotId: "041090e1-8c2d-44b3-b2ab-acb9d995b5aa", parent: "55543614-caa7-411c-8f98-be73e45e5edb", frameSec: 7.9, duration: 8,
    keyframePath: "generated/keyframes/codex/041090e1-8c2d-44b3-b2ab-acb9d995b5aa/scene-2-shot-2-boat-coverage-r1.png",
    action: "Animate this tighter first-century Galilean boat-preparation keyframe with gentle, practical activity. The same three boat-side disciples quietly steady the boat and oars while the robed central figure watches from the left edge. Keep the boat afloat and in place. People at the distant left edge remain calm and uncoordinated; no foreground crowd surge, arm wave, embarkation, healing, fall, or speaking line."
  },
  s3: {
    shotId: "752177c1-a318-4d6f-b898-c692763fd6e0", parent: "418d04e8-5b7b-4eaf-9cde-81cc0e24b9e3", frameSec: 7.9, duration: 8,
    keyframePath: "generated/keyframes/codex/752177c1-a318-4d6f-b898-c692763fd6e0/scene-2-shot-3-mat-coverage-r1.png",
    action: "Animate this closer lakeshore cutaway of the ailing person with the plain wooden staff and the same weakened person resting on the woven mat. The same carriers keep a firm hold and shift their weight subtly on the stones; the person on the mat breathes and makes only a small natural hand movement. The robed figure in the soft background stays back. No new healing, fall, departure, speech, added person, or collective arm motion."
  },
  s4: {
    shotId: "ffb0efa5-17ed-455a-a444-2f206a8643fd", parent: "47204e0e-8778-4087-ba59-522297500b6d", frameSec: 3.9, duration: 8,
    action: "Continue the approved Mark 3:11 two-person bridge after the man has fallen before Jesus. The same Papuan man remains kneeling, breathing and looking up toward Jesus while the crowd reacts in small unsynchronized ways. Jesus remains attentive and still. This is narration-only lead-in; the actual Hatam cry belongs exclusively to the following approved close-up lip-sync insert. No visible speech, mouth performance, new fall, healing, or identity change."
  },
  s6: {
    shotId: "cd6c7ea1-725a-43be-825e-42f4b39cf183", parent: "b8c2711a-7f6b-4b47-b1d9-6c149a1ea449", frameSec: 3.9, duration: 4,
    action: "Continue the approved Mark 3:12 narration-led stern order from its last frame. Jesus's hand settles after the restrained command gesture; the same kneeling man remains before him and the crowd stays quiet and individually moving. Jesus's mouth stays closed because the exact Hatam verse is narrated off camera. No renewed outcry, new speech, invented action, identity drift, or synchronized crowd gesture."
  }
} as const;

type Slot = keyof typeof configs;
const slot = process.argv[2] as Slot;
if (!(slot in configs)) throw new Error("Expected one of: s2, s3, s4, s6.");
const config = configs[slot];
const marker = `mark3-scene2-${slot}-coverage-${slot === "s2" || slot === "s3" ? "v2" : "v1"}`;
const frameRel = `generated/keyframes/review/${marker}-start.png`;

async function run(): Promise<void> {
  const db = getDb();
  const shot = db.prepare("SELECT scene_id FROM shots WHERE id=?").get(config.shotId) as { scene_id: string } | undefined;
  if (shot?.scene_id !== sceneId) throw new Error("Scene 2 shot identity changed.");
  const existing = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(config.shotId, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (existing) { console.log(JSON.stringify({ reused: true, ...existing })); return; }
  const parent = db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=?")
    .get(config.parent, config.shotId) as { result_asset_path: string | null; status: string } | undefined;
  if (parent?.status !== "accepted" || !parent.result_asset_path) throw new Error("Approved parent take missing.");
  const root = join(getDataDir(), "assets");
  const parentPath = join(root, parent.result_asset_path);
  if (!existsSync(parentPath)) throw new Error("Approved parent video missing.");
  const framePath = join(root, frameRel);
  mkdirSync(dirname(framePath), { recursive: true });
  if (!existsSync(framePath)) execFileSync("ffmpeg", ["-v", "error", "-n", "-ss", String(config.frameSec), "-i", parentPath, "-frames:v", "1", framePath], { stdio: "pipe" });
  const startFramePath = "keyframePath" in config ? config.keyframePath : frameRel;
  if (!existsSync(join(root, startFramePath))) throw new Error("Coverage keyframe missing.");
  const prompt = `${marker}. Photorealistic 16:9 landscape continuation anchored to the exact approved last frame. ${config.action} Keep every visible Papuan/Hatam face, build, skin tone, hair, garment, first-century prop and daylight setting consistent. Dark natural pupils and restrained varied catchlights only. No intelligible dialogue, narration, lip-sync performance, visible speaking, text, subtitles, modern object, Caucasian/Levantine/European identity drift, or camera cut. The source Hatam reading is applied separately and provider sound is discarded.`;
  const result = await new GeminiVideoProvider().generateFinal(
    { shotId: `${config.shotId}-${marker}-${randomUUID()}`, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: startFramePath }, durationSeconds: config.duration, tier: "economy" }
  );
  if (!result.media?.path) throw new Error("Provider returned no video.");
  const now = Date.now(), attemptId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)")
      .run(attemptId, config.shotId, result.provenance.provider, result.provenance.model, "generate_final_video", prompt, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, config.shotId, `${marker}: candidate anchored to ${startFramePath}, derived from accepted attempt ${config.parent}; review canon, causal action, mouths, and natural crowd motion before selection. Continuous approved source audio will replace provider sound.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, path: result.media.path, costUsd: result.cost.usd, frameRel }));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
