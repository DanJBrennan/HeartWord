/** Prepare the seven already-approved, short Mark 4 Jesus performances.
 * This reuses the normal scoped cast-audio stage and writes a durable manifest;
 * it does not generate video or select any chapter timeline material. */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir();
const db = getDb();
const requested = [
  ["v09", "67a2d802-6a79-4461-bd99-aca44b3b7622", "Mark 4:9 closing call"],
  ["v13", "740eb1df-5b4b-4c69-958c-f6bb8032cc39", "Mark 4:13 question"],
  ["v21-second", "827cdcb5-0d38-406d-938e-c7ac77dce675", "Mark 4:21 second lamp phrase"],
  ["v21-third", "86a71cf3-a873-498a-8e13-ce031e6cb8e1", "Mark 4:21 third lamp phrase"],
  ["v26", "45aacff9-0266-4909-acb2-ce09f659b24a", "Mark 4:26 seed-parable opening"],
  ["v30-first", "4934ce6e-3894-4800-a8b9-c380d91ae570", "Mark 4:30 first question"],
  ["v30-second", "8534f367-c673-4b45-a7a4-d42401f157a7", "Mark 4:30 second question"],
] as const;

type Item = { key: string; shotId: string; label: string; sourceId: string; startMs: number; endMs: number; sourcePath: string; keyframePath: string };
const items: Item[] = requested.map(([key, shotId, label]) => {
  const shot = db.prepare("SELECT needs_lip_sync,dialogue_character_id FROM shots WHERE id=?").get(shotId) as { needs_lip_sync: number; dialogue_character_id: string | null } | undefined;
  const binding = db.prepare(`SELECT a.id,a.start_ms,a.end_ms,a.source_path,a.speaker_character_id,ub.source_hash
    FROM shot_utterance_bindings ub JOIN audio_segments a ON a.id=ub.source_audio_segment_id
    WHERE ub.shot_id=? AND a.project_id=? AND a.layer='original_reading'`).all(shotId, projectId) as Array<{ id: string; start_ms: number; end_ms: number; source_path: string; speaker_character_id: string | null; source_hash: string }>;
  const frame = db.prepare(`SELECT result_asset_path FROM generation_attempts
    WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path LIKE 'generated/keyframes/codex/%'
    ORDER BY created_at DESC LIMIT 1`).get(shotId) as { result_asset_path: string } | undefined;
  if (!shot || shot.needs_lip_sync !== 1 || !shot.dialogue_character_id || binding.length !== 1 || !binding[0]!.speaker_character_id || !frame) {
    throw Error(`${label} is not a single approved source-bound Jesus performance with its approved Codex keyframe.`);
  }
  if (binding[0]!.speaker_character_id !== shot.dialogue_character_id) throw Error(`${label} speaker binding does not match its speaking shot.`);
  return { key, shotId, label, sourceId: binding[0]!.id, startMs: binding[0]!.start_ms, endMs: binding[0]!.end_ms, sourcePath: binding[0]!.source_path, keyframePath: frame.result_asset_path };
});
const duplicateSource = items.find((item, index) => items.findIndex(other => other.sourceId === item.sourceId) !== index);
if (duplicateSource) throw Error(`The bounded batch expects one source interval per short shot; ${duplicateSource.label} duplicates an interval.`);
const voiced = await runVoicing(projectId, { sourceSegmentIds: items.map(item => item.sourceId) });
if (!voiced.ok) throw Error(voiced.reasoning);
const output = join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json");
mkdirSync(join(dataDir, "assets", "generated", "pilot-source"), { recursive: true });
writeFileSync(output, JSON.stringify({
  purpose: "Held Mark 4 short-Jesus performance batch only; no chapter-wide run or timeline assembly.",
  items,
}, null, 2));
console.log(JSON.stringify({ prepared: items.map(item => ({ key: item.key, label: item.label, durationMs: item.endMs - item.startMs })), voiced, manifest: output }, null, 2));
