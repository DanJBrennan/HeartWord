/**
 * Re-voice the two Mark 4:12 Jesus spans that never received their own cast
 * render (found by Claude, 2026-10-01).
 *
 * The scoped cast-audio run for v37 named its outputs by position within the
 * scope ("01-segment-0", "03-segment-2"), so it "reused" unrelated files that
 * already had those names: the disciples' storm line (4:38) for the
 * 144.878-149.815 s span and the Mark 4:16 line for the 155.298-169.227 s span
 * (stretched about 1.9x into a 13.9 s window). Those wrong lines are what Dan
 * heard as Jesus's voice slowing down around 2:52.
 *
 * This script only writes two NEW, uniquely named cast masters next to the
 * others. It does not touch the database or any existing file. Claude then
 * splices them into the held film.
 *
 * Run on Dan's machine:  npx tsx scripts/revoice-mark4-verse12-missing-spans.ts
 */
import "dotenv/config";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { reVoiceAudio } from "../src/providers/elevenlabs.js";
import { extractClip } from "../src/pipeline/voicing/extract-clip.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const jesusId = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const spans = [
  { segmentId: "dd36ea89-990e-4dbc-b68e-f374ffcab3df", startMs: 144878, endMs: 149815, name: "held-mark-4-12-a-jesus-elevenlabs-r1.mp3" },
  { segmentId: "de0ae67f-64a6-463f-8af0-445a8b0ae7ba", startMs: 155298, endMs: 169227, name: "held-mark-4-12-b-jesus-elevenlabs-r1.mp3" }
];
const db = getDb();
const voice = db.prepare(`SELECT cv.voice_id AS voiceId FROM character_versions cv
  WHERE cv.character_id=? AND cv.status='approved' AND cv.voice_provider='elevenlabs' AND cv.voice_id IS NOT NULL`).get(jesusId) as { voiceId: string } | undefined;
if (!voice) throw new Error("No approved ElevenLabs voice for Jesus.");
const data = getDataDir();
const outDir = join(data, "assets", "generated", "hatam", "mark-4", "composite_cast_master");
mkdirSync(outDir, { recursive: true });
async function main() {
if (!voice) throw new Error("No approved ElevenLabs voice for Jesus.");
const voiceId = voice.voiceId;
for (const span of spans) {
  const row = db.prepare(`SELECT source_path AS sourcePath, start_ms AS startMs, end_ms AS endMs FROM audio_segments
    WHERE id=? AND project_id=? AND layer='original_reading'`).get(span.segmentId, projectId) as { sourcePath: string; startMs: number; endMs: number } | undefined;
  if (!row || row.startMs !== span.startMs || row.endMs !== span.endMs) throw new Error(`Source segment ${span.segmentId} is not the expected ${span.startMs}-${span.endMs} ms span.`);
  const out = join(outDir, span.name);
  if (existsSync(out)) { console.log(`exists, skipping: ${span.name}`); continue; }
  const tmp = join(outDir, span.name.replace(".mp3", "-source-clip.tmp.mp3"));
  extractClip(join(data, "assets", row.sourcePath), row.startMs, row.endMs, tmp);
  const { audioBuffer } = await reVoiceAudio(voiceId, tmp);
  writeFileSync(out, audioBuffer);
  rmSync(tmp, { force: true });
  console.log(`wrote ${span.name} (${span.endMs - span.startMs} ms source span)`);
}
}
main().catch(error => { console.error(error); process.exit(1); });
