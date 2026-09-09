import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "96199814-0884-4a4a-bd95-b84950fce4fd";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/23-mark-2-27-28-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/887a22c47a9305ce170accc4e433e45e-af1afba0-9f01-4d49-a85c-95cd69f99f5d.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAHMWODV1LHOtGZj42znGmI4H2YrhXg0FXxip-bvCSslTl_9FI64CI532zi4rF-XzKD_Tu8U6mtby0_5CuFBLRW0eqywLrzDsigQ5YFQCwHkGfXdar0Ahn3-2CkhRTD_RvG-SjrZE2RbibX-deg4Egz82fUrIAv6WZK5BBYbtgkBAgVB39EGlh3ss6jag5jQzwII4CspleHrZ1MzZ0d5QirKlna3smRIyLQU-5w0UQKTIhoSxr5HFveMLWFoQV2A7PEyKM8BIiDLFZm5vsWq1oKr2N9Ah57f42zyeNXoDQqe_q7IDma0bSgFMAE&x-kcdn-pid=112781&Expires=1791583031&Signature=ehtTiNzYLZx6rteAEkOn5ElL00mRAw5o2b3aKLmR5ezyy5XfWZap0cTYZKSfqa4MAOoAVpqO1ucbBAsxtT0YFY0wPEdf84~LESqYoAogKdXxsn7NISkS0qWteWYMXujt9uYYmFXKTcWpjQmjcUPP9-4shml4lJ-16IUAFSe5HCfGYpp7lRSEUjKkjn4a4Qvktm9pJmaO6jUOodvyxqFMZq~bKXUzUJCc8KA49GkoLmNruXc6V93FJiQSSHy6J5Mligkv2AEbhg5us3cYnb-qVsRZfB-h55poxxTacTMrT3HqZ7kn~WuSznNLnISSdp-K65EmT-4rxoLhp4ANqzaTRw__&Key-Pair-Id=K1FG4T7LWJK0FU";

const beat2VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/b05a4e056ce731c5b4d20527fa23170c-7a1bcc5b-5f49-4463-a9e4-560421c08211.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAEJ9jM9aLzAiyS9RVwWpxLhRvzviDsct-e-cFkniVvPoKU0LuJoFptAIrCj8Fke3hKMdIuqJaEDK2R8tpFpHuYS8fnuqTSTmOu1Hnn0EiGgkbe3ooUr3NScJgDO25VCqKvBQYJw8kUomEedYLoBSYMX9usCtIztz8Jq97OkAKNtuAJ-MMXeSMkKUMaEsQ6nS3kFSWQtDGqC-6Dfe2DKHnrzy75KKv5yppC2ldOElyZqnBoSNzwANz7xQHQ1n3QnpfpV26ryIiBtjl1WPhKlKJXKLztglofm12V1yY0pgE7kj2gi6x_02SgFMAE&x-kcdn-pid=112781&Expires=1791583243&Signature=D9Hid0vHELVkGa6eKhU3Qqv78nb6EINuds9TRwnHxnns6kiCExy9aeAP42lsWJWA3b6C5~JsyzwPdGdrPL5LIczC8R8pxiMnFAv5ASHP1UtwUkfg~6ySVnuJXoQ07LH9hjiNsD35jSzf60YCWp31TVgiFAX2E~TDnfGU4C1mI5eEZXrysRjNs4Mn4pKN7hXefipuklNi~dcA3cjfTzZ2aSlS237qGzIGiHTA0kuu2ErnxrSq7aGpCHquEs0uJ49YBdcgrSocXfdV5DjoYkepFHfqmMQaGCPOwLXqD2vaU3Ekb274X3uS478bHu3zmvzQ14f6UwKc2RG-RmPl~Zx5qA__&Key-Pair-Id=K1FG4T7LWJK0FU";

function record(db2: any, provider: string, model: string, result: any, startMs: number, endMs: number) {
  const attemptId = randomUUID();
  const now = Date.now();
  db2.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, ?, ?, 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
  ).run(attemptId, shotId, provider, model, result.status, result.media?.path ?? null, result.cost.usd, now);
  db2.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(), projectId, attemptId, result.cost.usd, now
  );
  db2.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), shotId, attemptId, startMs, endMs, now
  );
}

async function run() {
  const provider = new KlingFaceLipSyncProvider();

  const r1 = await provider.syncFace(beat1VideoUrl, "1", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
  console.log(`beat 1 -> ${r1.status}, ${r1.media?.path}, $${r1.cost.usd}`);
  record(db, "kling", "lip-sync-audio2video", r1, 0, 3500);

  const r2 = await provider.syncFace(beat2VideoUrl, "0", { path: audioPath, startMs: 3500, endMs: 7315 }, 0);
  console.log(`beat 2 -> ${r2.status}, ${r2.media?.path}, $${r2.cost.usd}`);
  record(db, "kling", "lip-sync-audio2video", r2, 3500, 7315);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
