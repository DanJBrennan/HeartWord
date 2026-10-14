import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { readConfirmedSpeechRuns } from "../ingestion/continuous-speech.js";
import { getAudioDurationMs } from "../ingestion/detect-silences.js";

export function speechRunBinding(db: DatabaseSync, shotId: string) {
  const row = db.prepare(`SELECT ec.payload FROM edit_commands ec JOIN shot_utterance_bindings ub
    ON json_extract(ec.payload,'$.binding.id')=ub.id WHERE ub.shot_id=?
    AND ec.command_type='bind_speech_run_utterance' AND ec.undone=0`).get(shotId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as { speechRunId: string; timingEvidence: string } : null;
}

/** Only the exact, evidenced performance window is extracted. Verse labels
 * never choose a cast line. Shared cast files allow windows to cross old
 * alignment rows without a seam; retained separate assets can be joined
 * locally for provider input without rebuilding/revoicing the soundtrack. */
export function resolveSpeechRunCastAudio(db: DatabaseSync, shotId: string, voiceVersionId?: string) {
  const proof = speechRunBinding(db, shotId);
  if (!proof) return null;
  const binding = db.prepare(`SELECT ub.*, sc.project_id FROM shot_utterance_bindings ub JOIN shots sh ON sh.id=ub.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE ub.shot_id=?`).get(shotId) as { project_id: string; source_start_ms: number; source_end_ms: number; source_hash: string; character_version_id: string };
  const run = readConfirmedSpeechRuns(db, binding.project_id).find(r => r.id === proof.speechRunId);
  if (!run || !proof.timingEvidence?.trim() || binding.source_hash !== run.audioHash || binding.source_start_ms < run.startMs || binding.source_end_ms > run.endMs) throw new Error("The speech-run performance window needs current independent timing evidence.");
  const members = run.members.filter(m => m.end_ms > binding.source_start_ms && m.start_ms < binding.source_end_ms);
  const slices = members.map(member => {
    const matches = db.prepare(`SELECT a.source_path AS path,a.start_ms AS startMs,a.end_ms AS endMs,m.source_hash AS sourceHash,m.voice_version_id AS voiceVersionId FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id
      WHERE m.original_segment_id=? AND a.project_id=? AND a.speaker_character_id=? AND a.layer='composite_cast_master'`).all(member.id, binding.project_id, run.characterId) as Array<{ path: string; startMs: number; endMs: number; sourceHash: string; voiceVersionId: string | null }>;
    if (matches.length !== 1 || matches[0]!.sourceHash !== run.audioHash || matches[0]!.voiceVersionId !== (voiceVersionId ?? binding.character_version_id)) throw new Error("Confirmed speech needs its current source/voice-matched cast master before lip-sync.");
    const cast = matches[0]!;
    if (Math.abs(cast.endMs - cast.startMs - (member.end_ms - member.start_ms)) > 100) throw new Error("Cast audio must preserve the source speech duration and speed.");
    return { path: cast.path, startMs: cast.startMs + Math.max(0, binding.source_start_ms - member.start_ms),
      endMs: cast.endMs - Math.max(0, member.end_ms - binding.source_end_ms) };
  });
  if (!slices.length) throw new Error("No cast audio for the exact speech-run window.");
  if (slices.every((s, i) => s.path === slices[0]!.path && (i === 0 || s.startMs === slices[i - 1]!.endMs))) return { path: slices[0]!.path, startMs: slices[0]!.startMs, endMs: slices.at(-1)!.endMs };
  const root = getDataDir();
  const hashes = slices.map(s => createHash("sha256").update(readFileSync(join(root, "assets", s.path))).digest("hex"));
  const key = createHash("sha256").update(JSON.stringify({ slices, hashes })).digest("hex");
  const rel = join("generated", binding.project_id, "bound-cast-audio", `${key}.wav`), out = join(root, "assets", rel);
  mkdirSync(join(root, "assets", "generated", binding.project_id, "bound-cast-audio"), { recursive: true });
  if (!existsSync(out)) {
    const tmp = mkdtempSync(join(root, "assets", "generated", binding.project_id, "bound-cast-audio", "join-"));
    try {
      const parts = slices.map((slice, i) => {
        const path = join(tmp, `${i}.wav`);
        execFileSync("ffmpeg", ["-n", "-i", join(root, "assets", slice.path), "-ss", String(slice.startMs / 1000), "-t", String((slice.endMs - slice.startMs) / 1000), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", path], { stdio: ["ignore", "ignore", "pipe"] });
        return path;
      });
      const list = join(tmp, "parts.txt");
      writeFileSync(list, parts.map(p => `file '${p.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n"));
      execFileSync("ffmpeg", ["-n", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "copy", out], { stdio: ["ignore", "ignore", "pipe"] });
      writeFileSync(`${out}.json`, JSON.stringify({ binding, proof, slices, hashes, outputHash: createHash("sha256").update(readFileSync(out)).digest("hex"), operation: "local_cast_window_join", directCostUsd: 0, id: randomUUID() }), { flag: "wx" });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  if (!existsSync(`${out}.json`) || (JSON.parse(readFileSync(`${out}.json`, "utf8")) as { outputHash?: string }).outputHash !== createHash("sha256").update(readFileSync(out)).digest("hex")) throw new Error("Retained local cast window changed or lacks provenance; restore/reconcile it before lip-sync.");
  if (Math.abs(getAudioDurationMs(out) - (binding.source_end_ms - binding.source_start_ms)) > 100) throw new Error("Joined cast window does not preserve its exact source duration; review retained inputs without time stretching.");
  return { path: rel, startMs: 0, endMs: binding.source_end_ms - binding.source_start_ms };
}
