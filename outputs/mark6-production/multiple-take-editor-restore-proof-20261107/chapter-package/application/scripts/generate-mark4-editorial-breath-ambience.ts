/** Generate held, speech-free ambience beds for Mark 4's editorial breaths. */
import "dotenv/config";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { ElevenLabsEffectsProvider } from "../src/providers/soundtrack.js";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const relDir = "generated/editorial/mark4-breath-ambience";
const requests = [
  { key: "shore", durationMs: 5000, prompt: "Quiet first-century lakeshore ambience: gentle small lapping water, a light breeze through shoreline reeds, and a very distant bird. No boat creak, footsteps, crowd, voices, music, thunder, or sudden sounds." },
  { key: "olive-grove", durationMs: 5000, prompt: "Still olive-grove room tone in a quiet first-century outdoor teaching place: soft dry leaves shifting in a mild breeze, sparse distant insects, very faint far birds. No people, voices, music, footsteps, writing, or dramatic sound." },
  { key: "olive-grove-v2", durationMs: 5000, prompt: "Continuously audible but gentle olive-grove ambience for a one-second pause: dry olive leaves rustling in a light breeze and a soft, steady outdoor insect bed, with one very distant bird. Keep the sound present from the first instant; no digital silence, people, voices, music, footsteps, writing, or dramatic sound." },
  { key: "field", durationMs: 5000, prompt: "Gentle agricultural field ambience: light wind moving dry grain and grasses, sparse small birds far away, a few quiet insects. No people, voices, music, machinery, animal calls, or dramatic effects." },
  { key: "dusk-lake", durationMs: 5000, prompt: "Quiet dusk beside a lake before a crossing: soft water against a wooden fishing boat and faint evening breeze. No voices, music, thunder, rain, rowing, crowd, or sudden sounds." },
  { key: "storm-to-calm", durationMs: 6000, prompt: "A natural storm resolving over a small lake: wind and rain quickly diminish during the first two seconds, then settle into gentle lapping water and a quiet breeze. No thunder crack, voices, music, or abrupt silence." }
] as const;
const data = getDataDir(), assets = join(data, "assets"), db = getDb(), provider = new ElevenLabsEffectsProvider();
for (const request of requests) {
  const path = `${relDir}/${request.key}-v1.mp3`, absolute = join(assets, path), meta = absolute.replace(/\.mp3$/, ".json");
  if (!existsSync(absolute)) {
    const result = await provider.generate({ kind: "sfx", durationMs: request.durationMs, loop: true, prompt: request.prompt });
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, result.bytes, { flag: "wx" });
    writeFileSync(meta, JSON.stringify({ ...result, bytes: undefined, prompt: request.prompt, heldForReview: true }, null, 2), { flag: "wx" });
  }
  const durationMs = Math.round(Number((await import("node:child_process")).execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", absolute], { encoding: "utf8" }).trim()) * 1000);
  if (durationMs < request.durationMs * 0.8) throw new Error(`${request.key} ambience is unexpectedly short.`);
  const exists = db.prepare("SELECT id FROM production_audio_assets WHERE project_id=? AND path=?").get(projectId, path);
  if (!exists) db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), projectId, "sfx", `Held Mark 4 editorial-breath ambience: ${request.key}`, path, createHash("sha256").update(readFileSync(absolute)).digest("hex"), durationMs, Date.now());
  console.log(JSON.stringify({ key: request.key, path, durationMs, heldForReview: true }));
}
