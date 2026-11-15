/**
 * Redo Shot 8's beats 1 (master) and 3 (cutaway) using the real Kling
 * video-based Lip-Sync API (KlingFaceLipSyncProvider) instead of Veo's
 * prompt-invented "talking" performance -- see kling/index.ts's
 * KlingFaceLipSyncProvider header comment for the full endpoint story.
 *
 * Root cause this fixes (both flagged by Dan on the first assembled
 * Shot 8): Veo has no access to the real Hatam audio, so beat 1's mouth
 * shapes/gesture timing never actually matched the real speech ("obvious
 * he is not speaking Hatam"), and beat 3's prompt-described "mouth
 * closed" for Jesus (present but out of focus) looked wrong once real,
 * clearly audible continuous dialogue was played under it ("his lips are
 * not moving even though he is speaking"). Real audio-driven face_id
 * lip-sync fixes both without needing to hide or blur Jesus.
 *
 * This does NOT touch beats 2/4 (lip_sync_insert) -- those already use
 * real audio-driven lip-sync via the Avatar endpoint + crop, and are
 * already correct.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/05-mark-2-10-11-elevenlabs.mp3";

const provider = new KlingFaceLipSyncProvider();

const BEATS = [
  {
    sequence: 1,
    beatId: "26091a7f-9ad5-4d3c-a233-7390a78247d4",
    keyframePath: null as string | null, // filled from DB below
    prompt:
      "Static wide 16:9 master shot of a packed room in a Capernaum home. Jesus stands with his hand extended toward the paralytic, engaged and present, mouth resting naturally closed between words. Everyone else holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd, all listening attentively to Jesus. The paralytic lies still on his mat, eyes open, alert and hopeful, looking up at Jesus.",
    audioStartMs: 0,
    audioEndMs: 3500
  },
  {
    sequence: 3,
    beatId: "53aea6da-0c67-4a8c-b4bc-43f5c127c4b7",
    keyframePath: null as string | null, // filled from DB below
    prompt:
      "Static 16:9 reaction shot centered on the paralytic's face, looking up at Jesus with wide, alert, hopeful eyes, mouth closed. Jesus stands nearby, present and engaged, mouth resting naturally closed between words. No camera movement.",
    audioStartMs: 9654,
    audioEndMs: 12654
  }
];

async function run() {
  for (const beat of BEATS) {
    console.log(`\n=== Beat ${beat.sequence} ===`);

    let keyframePath = beat.keyframePath;
    if (!keyframePath) {
      const row = db.prepare(`SELECT keyframe_asset_path FROM coverage_beats WHERE id = ?`).get(beat.beatId) as { keyframe_asset_path: string };
      keyframePath = row.keyframe_asset_path;
    }
    console.log(`keyframe: ${keyframePath}`);

    const durationSec = Math.max(1, Math.round((beat.audioEndMs - beat.audioStartMs) / 1000));
    console.log("submitting Kling scene video...");
    const { videoUrl } = await provider.generateSceneVideo({ path: keyframePath }, beat.prompt, durationSec);
    console.log(`scene video ready: ${videoUrl.slice(0, 80)}...`);

    console.log("identifying faces...");
    const faces = await provider.identifyFaces(videoUrl);
    console.log(`found ${faces.length} face(s):`, faces.map((f) => f.faceId));

    // Download each thumbnail for manual visual confirmation -- face_id is
    // NOT stable/guessable (see KlingFaceLipSyncProvider's header comment).
    const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", beat.beatId);
    mkdirSync(thumbDir, { recursive: true });
    for (const face of faces) {
      const res = await fetch(face.thumbnailUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      const outPath = join(thumbDir, `face-${face.faceId}.jpg`);
      writeFileSync(outPath, buf);
      console.log(`  face_id ${face.faceId} thumbnail -> ${outPath}`);
    }
    console.log(">>> STOP: inspect the thumbnails above before continuing to lip-sync. <<<");
    console.log(JSON.stringify({ beatSequence: beat.sequence, videoUrl, faces }, null, 2));
  }
}

run().catch((err) => {
  console.error("REDO FAILED:", err);
  process.exit(1);
});
