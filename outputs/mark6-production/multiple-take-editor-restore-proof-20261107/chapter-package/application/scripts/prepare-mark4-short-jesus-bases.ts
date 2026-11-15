/** Generate silent bases for the bounded seven-shot Mark 4 Jesus batch.
 * Each provider handle is persisted before polling; results remain held. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; label: string; sourceId: string; startMs: number; endMs: number; sourcePath: string; keyframePath: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir();
const db = getDb();
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
if (manifest.items.length !== 7) throw Error("The bounded short-Jesus manifest must contain exactly seven items.");
const prompts: Record<string, string> = {
  v09: "Mark 4:9 held short-Jesus performance. Preserve the approved boat-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. Listeners stay silent and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  v13: "Mark 4:13 held short-Jesus performance. Preserve the approved private teaching-circle keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. Listeners stay silent and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  "v21-second": "Mark 4:21 held short-Jesus performance. Preserve the approved lamp-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. The clay lamp and listeners remain still and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  "v21-third": "Mark 4:21 held short-Jesus performance. Preserve the approved opposite-angle lamp-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. The clay lamp and listeners remain still and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  v26: "Mark 4:26 held short-Jesus performance. Preserve the approved shoreline-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. Listeners stay silent and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  "v30-first": "Mark 4:30 held short-Jesus performance. Preserve the approved frontal boat-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. Listeners stay silent and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
  "v30-second": "Mark 4:30 held short-Jesus performance. Preserve the approved three-quarter boat-teaching keyframe exactly: Jesus is the only readable foreground speaking face, with quiet breath, eye and head motion, and a neutral mouth for later source-audio face-targeted lip sync. Listeners stay silent and natural. No invented speech, no sound, no camera move, no new people, no canon or wardrobe change.",
};
const pendingPath = join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-bases-pending.json");
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ key: string; taskId: string }> : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const duration = (path: string) => Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000);
const provider = new KlingFaceLipSyncProvider();
const output: Array<{ key: string; taskId?: string; path?: string; reused?: boolean; durationMs?: number }> = [];
for (const item of manifest.items) {
  const prior = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_short_jesus_base'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  if (prior && existsSync(join(dataDir, "assets", prior.result_asset_path))) { output.push({ key: item.key, reused: true, path: prior.result_asset_path }); continue; }
  if (pending.some(entry => entry.key === item.key)) throw Error(`${item.label} already has a durable base task awaiting recovery.`);
  const prompt = prompts[item.key];
  if (!prompt || !existsSync(join(dataDir, "assets", item.keyframePath))) throw Error(`Approved base input is unavailable for ${item.label}.`);
  const neededSeconds = Math.max(5, Math.ceil((item.endMs - item.startMs) / 1000));
  const { taskId, videoUrl } = await provider.generateSceneVideo({ path: item.keyframePath }, prompt, neededSeconds,
    async submitted => { pending.push({ key: item.key, taskId: submitted }); save(); });
  const response = await fetch(videoUrl);
  if (!response.ok) throw Error(`${item.label} base download failed.`);
  const rel = join("generated", "video", `mark4-short-jesus-base-${item.key}-${taskId}.mp4`);
  mkdirSync(join(dataDir, "assets", "generated", "video"), { recursive: true });
  writeFileSync(join(dataDir, "assets", rel), Buffer.from(await response.arrayBuffer()), { flag: "wx" });
  const actualDuration = duration(join(dataDir, "assets", rel));
  if (actualDuration < item.endMs - item.startMs) throw Error(`${item.label} base is too short for its exact source interval.`);
  const id = randomUUID(); const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,'kling','kling-v2-6-pro','generate_short_jesus_base','720p',?,'hold_for_review',?,?,?)`)
      .run(id, item.shotId, `Mark 4 short-Jesus batch ${item.key}: ${item.label}; ${prompt}`, rel, 0.6, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, 0.6, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  pending.splice(pending.findIndex(entry => entry.key === item.key && entry.taskId === taskId), 1); save();
  output.push({ key: item.key, taskId, path: rel, durationMs: actualDuration });
}
console.log(JSON.stringify(output, null, 2));
