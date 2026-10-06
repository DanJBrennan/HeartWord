/** Generate and independently listen-check the two music assets for Dan's approved overnight Mark 4 cut. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiMusicProvider } from "../src/providers/soundtrack.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";
import { digest } from "../src/pipeline/creative-direction/crew-context.js";
import { mediaDurationMs } from "../src/pipeline/assembly/finishing.js";
import type { SoundtrackReview } from "../src/pipeline/assembly/soundtrack.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), db = getDb(), provider = new GeminiMusicProvider();
const requests = [
  { key: "mark4-overnight-bed-v1", durationMs: 170000, loop: true, description: "Quiet looping chapter underscoring", prompt: "Instrumental cinematic underscoring for a reverent first-century Galilee Scripture film. Sparse warm strings, subtle wooden flute, soft hand percussion, gently hopeful and unobtrusive. It must remain suitable well below spoken Hatam narration and dialogue. No vocals, chant, lyrics, speech, religious musical clichés, abrupt changes, or dominant melody. Seamless loop." },
  { key: "mark4-overnight-outro-v1", durationMs: 24000, loop: false, description: "Mark 4 post-source dawn-horizon ending", prompt: "Twenty-four-second instrumental cinematic ending for a reverent first-century Galilee film: storm has passed, calm water at dawn, a boat reaches shore, then a wide pull-away toward a new horizon. Begin restrained, slowly grow warmer and broader, then arrive at a satisfying, gentle final resolution. Strings, soft wooden flute, restrained hand percussion. No vocals, chant, lyrics, speech, sudden hit, or melodramatic trailer sound." },
];
const review = async (prompt: string, mimeType: string, bytes: Buffer) => generateJsonWithImages<SoundtrackReview>(prompt, [{ mimeType, data: bytes.toString("base64") }], {
  type: "object", properties: { matchesBrief: { type: "boolean" }, intelligibleSpeech: { type: "boolean" }, technicalPass: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } },
  required: ["matchesBrief", "intelligibleSpeech", "technicalPass", "confidence", "reason"],
});
for (const request of requests) {
  const existing = db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description=?").get(projectId, request.description) as { path: string } | undefined;
  if (existing) { console.log(JSON.stringify({ key: request.key, reused: existing.path })); continue; }
  // The provider returned a clean 168.6-second loop for the 170-second
  // approximate request. Re-review and retain that exact measured loop rather
  // than spending again or stretching it; the final mix repeats whole loops.
  const prior = readdirSync(join(dataDir, "assets", "generated", "soundtrack", projectId), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith(`${request.key}-`)).map(entry => join(dataDir, "assets", "generated", "soundtrack", projectId, entry.name)).at(-1);
  if (prior) {
    const bytes = readFileSync(prior), measuredMs = mediaDurationMs(prior);
    const verdict = await review(`Listen independently to this generated instrumental music. It is intended for: ${request.description}. Requirements: no intelligible speech or lyrics, technically usable clean audio, and an appropriate restrained cinematic arc. Return matchesBrief=false if it is excessively dramatic, has vocals, artifacts, or fails the stated use.`, "audio/mpeg", bytes);
    // Audio-only model confidence is deliberately conservative; for this
    // producer-authorized, low-level loop, a favorable content verdict plus
    // a 95% measured-duration floor is the bounded autonomous acceptance bar.
    const confidence = verdict.confidence <= 1 ? verdict.confidence * 100 : verdict.confidence;
    const pass = verdict.matchesBrief && !verdict.intelligibleSpeech && verdict.technicalPass && confidence >= 70 && measuredMs >= request.durationMs * 0.95;
    if (!pass) throw Error(`Music quality gate held ${request.key}: ${JSON.stringify({ measuredMs, verdict })}`);
    const id = randomUUID(), path = prior.slice(join(dataDir, "assets").length + 1).replace(/\\/g, "/");
    db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, projectId, "music", request.description, path, digest(bytes), measuredMs, Date.now());
    console.log(JSON.stringify({ key: request.key, path, measuredMs, verdict, retained: true }, null, 2)); continue;
  }
  const generated = await provider.generate({ kind: "music", prompt: request.prompt, durationMs: request.durationMs, loop: request.loop });
  const id = randomUUID(), path = `generated/soundtrack/${projectId}/${request.key}-${id}.mp3`, absolute = join(dataDir, "assets", path);
  mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, generated.bytes, { flag: "wx" });
  const measuredMs = mediaDurationMs(absolute);
  const verdict = await review(`Listen independently to this generated instrumental music. It is intended for: ${request.description}. Requirements: no intelligible speech or lyrics, technically usable clean audio, and an appropriate restrained cinematic arc. Return matchesBrief=false if it is excessively dramatic, has vocals, artifacts, or fails the stated use.`, generated.mimeType, generated.bytes);
  const confidence = verdict.confidence <= 1 ? verdict.confidence * 100 : verdict.confidence;
  const pass = verdict.matchesBrief && !verdict.intelligibleSpeech && verdict.technicalPass && confidence >= 70;
  if (!pass || measuredMs < request.durationMs * 0.95) throw Error(`Music quality gate held ${request.key}: ${JSON.stringify({ measuredMs, verdict })}`);
  db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, projectId, "music", request.description, path, digest(readFileSync(absolute)), measuredMs, Date.now());
  console.log(JSON.stringify({ key: request.key, path, measuredMs, verdict }, null, 2));
}
