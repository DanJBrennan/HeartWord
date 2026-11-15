/** Four chained, non-speaking five-second candidates; the last is trimmed to one second in assembly. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const root = join(getDataDir(), "assets"), db = getDb();
const frameDir = join(root, "generated/keyframes/mark3-r11-ending");
mkdirSync(frameDir, { recursive: true });
const finalShot = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? AND sc.sequence=(SELECT MAX(sequence) FROM scenes WHERE project_id=?)
  ORDER BY sh.sequence DESC LIMIT 1`).get(projectId, projectId) as { id: string } | undefined;
if (!finalShot) throw new Error("Final shot missing.");
let previousVideo = join(root, "generated/video/kling-932261199469740070.mp4");
for (let i = 1; i <= 4; i++) {
  const marker = `mark3-r11-aerial-continuation-${i}-v1`;
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(finalShot.id, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  const startFrame = join(frameDir, `aerial-continuation-${i}-start-v1.png`);
  if (!existsSync(startFrame)) {
    if (!existsSync(previousVideo)) throw new Error(`Previous clip missing: ${previousVideo}`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.08", "-i", previousVideo,
      "-frames:v", "1", startFrame], { stdio: "inherit" });
  }
  if (prior) {
    if (!prior.result_asset_path || !existsSync(join(root, prior.result_asset_path))) throw new Error(`Incomplete prior candidate ${marker}; inspect before retry.`);
    console.log(JSON.stringify({ marker, prior, action: "reusing retained candidate" }));
    previousVideo = join(root, prior.result_asset_path);
    continue;
  }
  const prompt = `${marker}. Photorealistic 16:9 first-century Capernaum, one continuous five-second non-lip-sync aerial continuation from the exact supplied last frame. ` +
    "The camera continues rising and retreating toward the Sea of Galilee in one physically smooth move. The small cream-and-blue-robed Jesus keeps walking toward the shore and becomes gradually smaller, while the same handful of people walk and notice him at individual moments. " +
    "Preserve all basalt houses, shoreline, boats already distant on the water, lighting, people, identity and screen direction exactly; do not reset camera height or zoom back in. No new large crowd, teaching, boat boarding, scene cut, subtitles, mouth movement, intelligible voices or music. Natural coastal ambience ON.";
  const id = randomUUID();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','generate_final_video','1080p',?,'hold_for_review',NULL,0,?)`).run(id, finalShot.id, prompt, Date.now());
  console.log(JSON.stringify({ marker, id, state: "submitted" }));
  const result = await new KlingVideoProvider().generateFinal({ shotId: `${finalShot.id}-${id}`, prompt, characters: [] },
    { resolution: "1080p", startFrame: { path: `generated/keyframes/mark3-r11-ending/aerial-continuation-${i}-start-v1.png` } });
  if (!result.media?.path) throw new Error(`No video for ${marker}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, finalShot.id, `${marker}: inspect continuous height/direction, source-frame seam, native ambience and no invented Mark 4 action.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  previousVideo = join(root, result.media.path);
  console.log(JSON.stringify({ marker, id, path: result.media.path, costUsdEstimate: result.cost.usd }));
}
