/** Identify (but do not select) the tracked face candidates for the four
 * retained Mark 4 storm bases. Face-targeted lip sync must never guess.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const bases = [
  ["Peter plea", "932970054562480150"],
  ["Jesus command", "932971043504521293"],
  ["Jesus question, first beat", "932971876605886552"],
  ["Jesus question, second beat", "932972668193341519"]
] as const;

async function main() {
  const key = process.env.KLING_API_KEY_1; if (!key) throw Error("Kling API key is unavailable.");
  const provider = new KlingFaceLipSyncProvider(), dataDir = getDataDir();
  const result = [];
  for (const [label, taskId] of bases) {
    const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
    const task = await response.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
    const videoUrl = task.data?.task_result?.videos?.[0]?.url;
    if (!response.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !videoUrl) throw Error(`${label} base is unavailable.`);
    const faces = await provider.identifyFaces(videoUrl);
    const dir = join(dataDir, "assets", "generated", "face-thumbs", "mark4-storm", taskId); mkdirSync(dir, { recursive: true });
    const saved = [];
    for (let index = 0; index < faces.length; index++) {
      const face = faces[index]!; const image = await fetch(face.thumbnailUrl);
      if (!image.ok) throw Error(`${label} face thumbnail ${index + 1} could not be downloaded.`);
      const relativePath = join("generated", "face-thumbs", "mark4-storm", taskId, `face-${index + 1}.jpg`);
      writeFileSync(join(dataDir, "assets", relativePath), Buffer.from(await image.arrayBuffer()));
      saved.push({ candidate: index + 1, faceId: face.faceId, path: relativePath, startMs: face.startTime, endMs: face.endTime });
    }
    result.push({ label, taskId, faces: saved });
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
