/** Source-locked Kling Avatar candidate for a short approved speaking shot. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneNumber = Number(process.argv[2]), shotNumber = Number(process.argv[3]);
if (![3, 4, 5].includes(sceneNumber) || !Number.isInteger(shotNumber) || shotNumber < 1) throw new Error("Usage: scene number 3–5 and positive shot number.");
const sliceOffsetMs = Number(process.argv[4] ?? 0);
const requestedMs = process.argv[5] ? Number(process.argv[5]) : null;
if (!Number.isInteger(sliceOffsetMs) || sliceOffsetMs < 0 || (requestedMs !== null && (!Number.isInteger(requestedMs) || requestedMs < 500 || requestedMs > 10_000))) throw new Error("Optional offset/duration must be valid milliseconds.");
const marker = `mark3-scene${sceneNumber}-shot${shotNumber}-bound-avatar-${sliceOffsetMs}-${requestedMs ?? "all"}-v1`;
const db = getDb(), root = join(getDataDir(), "assets");
const row = db.prepare(`SELECT sh.id,sh.dialogue_character_id,ub.source_audio_segment_id,ub.source_start_ms,ub.source_end_ms,ub.source_hash,ub.character_version_id,
    o.source_path AS original_path,o.start_ms AS original_start,o.end_ms AS original_end,
    m.source_hash AS mapped_hash,m.voice_version_id,
    bound.voice_id AS bound_voice,bound.voice_provider AS bound_provider,
    current.voice_id AS current_voice,current.voice_provider AS current_provider,
    a.source_path AS composite_path,a.start_ms AS composite_start,a.end_ms AS composite_end,
    (SELECT result_asset_path FROM generation_attempts k WHERE k.shot_id=sh.id AND k.operation='generate' AND k.status='accepted' ORDER BY k.created_at DESC LIMIT 1) AS keyframe
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
  JOIN audio_segments o ON o.id=ub.source_audio_segment_id JOIN composite_audio_source_map m ON m.original_segment_id=o.id
  JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=sc.project_id AND a.layer='composite_cast_master'
  JOIN character_versions bound ON bound.id=ub.character_version_id AND bound.character_id=sh.dialogue_character_id
  JOIN character_versions current ON current.id=m.voice_version_id AND current.character_id=bound.character_id AND current.status='approved'
  WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=? AND sh.needs_lip_sync=1`)
  .get(projectId, sceneNumber, shotNumber) as {
    id: string; dialogue_character_id: string; source_audio_segment_id: string; source_start_ms: number; source_end_ms: number;
    source_hash: string; character_version_id: string; original_path: string; original_start: number; original_end: number;
    mapped_hash: string; voice_version_id: string; bound_voice: string; bound_provider: string;
    current_voice: string; current_provider: string; composite_path: string; composite_start: number; composite_end: number; keyframe: string | null;
  } | undefined;
if (!row || !row.keyframe) throw new Error("Approved speaking shot or keyframe missing.");
const sliceSourceStart = row.source_start_ms + sliceOffsetMs;
const sliceSourceEnd = requestedMs === null ? row.source_end_ms : sliceSourceStart + requestedMs;
if (sliceSourceStart < row.source_start_ms || sliceSourceEnd > row.source_end_ms || sliceSourceEnd - sliceSourceStart > 10_000) throw new Error("Requested speaking slice exceeds bound source or 10 seconds.");
const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
  .get(row.id, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
if (prior) { console.log(JSON.stringify({ reused: true, ...prior })); process.exit(0); }
if (row.source_hash !== row.mapped_hash || row.bound_voice !== row.current_voice || row.bound_provider !== row.current_provider) throw new Error("Approved source or cast voice changed.");
for (const path of [row.original_path, row.composite_path, row.keyframe]) if (!existsSync(join(root, path))) throw new Error(`Approved input missing: ${path}`);
if (createHash("sha256").update(readFileSync(join(root, row.original_path))).digest("hex") !== row.source_hash) throw new Error("Original source hash changed.");
const scale = (row.composite_end - row.composite_start) / (row.original_end - row.original_start);
const startMs = row.composite_start + Math.round((sliceSourceStart - row.original_start) * scale);
const endMs = row.composite_start + Math.round((sliceSourceEnd - row.original_start) * scale);
if (endMs <= startMs || endMs > row.composite_end) throw new Error("Composite audio slice is out of bounds.");
const result = await new KlingLipSyncProvider().sync(
  { characterId: row.dialogue_character_id, characterVersionId: row.voice_version_id },
  { path: row.composite_path, startMs, endMs },
  { path: row.keyframe }
);
if (!result.media?.path) throw new Error("Kling returned no retained video.");
const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", join(root, result.media.path)], { encoding: "utf8" });
const outputMs = Math.round(Number(probe.trim()) * 1000), requiredMs = sliceSourceEnd - sliceSourceStart;
const status = outputMs >= requiredMs - 50 ? "hold_for_review" : "retry_modified";
const now = Date.now(), id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, row.id, result.provenance.provider, result.provenance.model, "lip_sync", `${marker}: original ${sliceSourceStart}–${sliceSourceEnd} ms inside approved bound ${row.source_start_ms}–${row.source_end_ms} ms, mapped cast ${startMs}–${endMs} ms, bound visual version ${row.character_version_id}, current approved same-voice version ${row.voice_version_id}, approved keyframe ${row.keyframe}; output ${outputMs} ms.`, status, result.media.path, result.cost.usd, now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), projectId, id, result.cost.usd, now);
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(), projectId, row.id, `${marker}: ${status} candidate. Verify one correct speaking face, approved Papuan identity and wardrobe, mouth timing, and duration before selection.`, now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ sceneNumber, shotNumber, id, status, path: result.media.path, outputMs, requiredMs, costUsd: result.cost.usd }));
