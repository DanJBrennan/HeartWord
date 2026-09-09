import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "94a721a3-1fc6-44d1-a9e2-9021e26ec408";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/21-mark-2-24-elevenlabs.mp3";

const beat2VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/129d941d3d9c2047e3a8c6181c99a7f9-613442e7-8164-4f14-abcc-a1148e2b32f7.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAGxNlAGpmSibD-xV8qb7twyyy8OIFWC-s1h8ADTr8lRNtfmxtjqyPkYee5H6Tnj8Poff2p00pae9oA7r5KIckNvRBa0XBqfsRZls8gWWvmQoWjoK-eE2xV6wTUavHtzVwwNQV0-GClRDDyAxJBuGVWS2QljEUE8V-dBbysZuhJvPcu9isDXZ0YK0WvinPdtBqqjiAr9neKLhLPwMV43xA5t5aI0kYr7ZnPSD3A8CTxQcRoS49Uq9aOrf5yDPqUQkY5LD-iDIiDkYR3iFjV0GJraIiuy_92T3FLR5lyUL6WNaDZV27ODVigFMAE&x-kcdn-pid=112781&Expires=1791580588&Signature=OAE1logvuXSfbaQD4Xsfu5iPw4u2MuluEh3ydGvAJtJdwkEMHN~9K0c68VgI22n29DTcJYwR7p1l3GPqmf55lvfgxP4RVW5f40tZudU2B~GrIVdD6ak4BEGP~Xk4xuLZkk8vn7wxYpWl4cAIkwxIsHebv0wzo9lFa1ulcekpHhGsgkNRnG0B1TbYbY6Wz~4nKgM~~BeiUig0EZCvsZ3xUHDfRlQYB4ALbgY-QRQ7~OtQL-u2CsVVeKATqv6xWTzDvHpsTIFWxeCfDMX-zZK6QPq0feAh~7dMDdftl3pUTVPjxGzYsHbUi3z8IEb0y6PTR7Hh~vRrspsmpmxciclGZg__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat2VideoUrl, "0", { path: audioPath, startMs: 3500, endMs: 7402 }, 0);
  console.log(`beat 2 -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  const attemptId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
  ).run(attemptId, shotId, result.status, result.media?.path ?? null, result.cost.usd, now);
  db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(), projectId, attemptId, result.cost.usd, now
  );
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 3500, 7402, ?)`).run(
    randomUUID(), shotId, attemptId, now
  );
  console.log("beat 2 clip row inserted");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
