/**
 * Regenerates Scene 1 Shot 5 (Mark 2:5, "Jesus forgives") with a scene
 * video long enough to cover the full real dialogue -- the original
 * single-clip-lipsync-batch1.ts hardcoded durationSec=4 (Kling's
 * generateSceneVideo floors that to its minimum "5"), but the real
 * composite_cast_master line for Mark 2:5 is 7523ms, so ~2.5s of real
 * spoken Hatam dialogue was silently missing from the final clip
 * (confirmed 2026-09-10 via scripts/check-dialogue-completeness.ts).
 *
 * Same face-targeted flow as the original batch script (generateSceneVideo
 * + identifyFaces + syncFace), just with a real target duration this time.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const faceProvider = new KlingFaceLipSyncProvider();
const SHOT_ID = "445d00de-7f66-494d-a104-d3e927d5dbdd";

function ffprobeDurationMs(absPath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath], {
    encoding: "utf-8"
  });
  return Math.round(parseFloat(out.trim()) * 1000);
}

async function run() {
  const shot = db.prepare(`SELECT * FROM shots WHERE id = ?`).get(SHOT_ID) as any;
  const kf = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(SHOT_ID) as any;
  console.log("Keyframe:", kf.result_asset_path);

  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:5' AND source_path LIKE '%composite_cast_master%'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };
  const requiredMs = audioRow.end_ms - audioRow.start_ms;
  console.log(`Required real dialogue duration: ${requiredMs}ms`);

  console.log("Generating scene video (target 10s -- Kling rejected 8 as an invalid duration value; only a fixed set works)...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: kf.result_asset_path },
    "Static medium-close shot. Jesus kneels beside the paralytic on his mat, speaking to him warmly, mouth moving naturally as if mid-speech throughout. Everyone else holds their pose with only subtle natural movement. No cuts.",
    10
  );
  console.log("Scene video:", videoUrl);

  console.log("Identifying faces...");
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", "shot5-redo");
  mkdirSync(thumbDir, { recursive: true });
  for (const face of faces) {
    const res = await fetch(face.thumbnailUrl);
    writeFileSync(join(thumbDir, `face-${face.faceId}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`Found ${faces.length} face(s), thumbnails at ${thumbDir}`);
  console.log(JSON.stringify({ videoUrl, faces: faces.map((f) => ({ faceId: f.faceId, startTime: f.startTime, endTime: f.endTime })) }, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
