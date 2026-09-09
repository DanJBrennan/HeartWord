import "dotenv/config";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { getDataDir, getDb } from "../src/db/client.js";
import { detectSilences, getAudioDurationMs } from "../src/pipeline/ingestion/detect-silences.js";
import { extractClip } from "../src/pipeline/voicing/extract-clip.js";

const db = getDb();
const seg = db.prepare(`SELECT * FROM audio_segments WHERE id = ?`).get("58a49fa4-683c-4d9e-9a84-104026d47aae") as any;
const absSourcePath = join(getDataDir(), "assets", seg.source_path);
const tmpDir = mkdtempSync(join(tmpdir(), "heartword-diag-"));
const tmpClip = join(tmpDir, "seg.mp3");
extractClip(absSourcePath, seg.start_ms, seg.end_ms, tmpClip);
const dur = getAudioDurationMs(tmpClip);
console.log("Clip duration (ms):", dur);
const gaps = detectSilences(tmpClip);
console.log("All detected gaps, sorted chronologically:");
for (const g of gaps) {
  console.log(`  ${(g.startMs/1000).toFixed(2)}s - ${(g.endMs/1000).toFixed(2)}s  (duration ${(g.durationMs/1000).toFixed(2)}s)`);
}
console.log("\nSorted by duration desc (top 6):");
[...gaps].sort((a,b)=>b.durationMs-a.durationMs).slice(0,6).forEach(g => {
  console.log(`  ${(g.durationMs/1000).toFixed(2)}s long, at ${(g.startMs/1000).toFixed(2)}s-${(g.endMs/1000).toFixed(2)}s`);
});
rmSync(tmpDir, { recursive: true, force: true });
