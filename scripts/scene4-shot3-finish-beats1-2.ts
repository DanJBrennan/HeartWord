import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "cef5e711-3d67-4b5c-aff1-4315587c6e23";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/22-mark-2-25-26-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/a4d4e0b0875ac51430cc92b5f9c451c2-c7fb00ee-b5f2-411b-a0ab-569082b7fcb5.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAHNqvliJ-th7GKc5cL_yWeVAXqnpKpBLjOvuy8W7ghsglG9AP9Hsl-tvIVUdT5agRfibJXuUnx66KZ6QUXlg4yWjoyGFsE83VFsf6paV0ORaUniRmfekIy36_Y6GhqZ536D3x2bd3sqMGVi3MByg0gnOKZagQcwtadIeSuO9ynMXfdOAiDVpmkOUJEDZTQ3aaMVRWTvooP4yQYJPMOWZJksYZ_N2cglYuTrir2X9vfj0hoSYF8ADrg3uvuiuzhTSVrQUvw0IiAjLqRmFd4nmjwVCu5uSlK42k9uyrsK1IgC7OBFBzeZXigFMAE&x-kcdn-pid=112781&Expires=1791581641&Signature=mqyqV~J90aQYJpviUgkt9A0ymLJl02VEyHTfnGWc2JBaC-chbLiSrCbHTXeBtgT66Xvy4atyyn9RIr9GcyEMCL96r~Wrpgd7evvEwJh-bCaAvMGZib03EpRJ29wtNzTJml4Rhq-MWT3vvJOIu~lkzz7MDtHRG0lQ3wE5OzubkV1Pq4o1w6G2u16pq95biYJC5K0KvQBCQBTwpb-PQKR31c3i0o9Q4jk09RbVnxL5gR9D6V5mpnM2FAvMHNAfjw7ECsoqivRLAU1Y9W8HLoBd2JXRs33nxa4L~38Fy6jqibk7oMBQ0PuhZ7NfAA5eYjzzZZz93l0zFeVB0tD7sH39Ew__&Key-Pair-Id=K1FG4T7LWJK0FU";

const beat2VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/63962ed44f4d2343c18c051984ecdb21-ef39e07f-6eb2-41c9-ba85-c4833c2418a1.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAG8oBZPzewgGIY6O8B4cWTyzh1R8Y19G3AK62wWcowjIAFNe2EHqL4RRkM9q1nNrIjQo291z-gC9o4UtUOMPE8MqWU2Fr-3b4fNI3gxDHPtGZ-c1CdNS-m43fpn4uPq5OGCPsW3ptSv7vyCDVG92HQ0FvxzbIvsm7NAaYemIU1vI6Ln6aGbOdFscHi-3vt8vwP4jzC0dNHTUJuzmeWqidwKU3oAF1PjMOqNW1xeWh2qGRoSNzwANz7xQHQ1n3QnpfpV26ryIiDRaBmFVgSP9jPh-FFxEX2Ha8rDQy3shLVKW2tIx12-eigFMAE&x-kcdn-pid=112781&Expires=1791581894&Signature=IuPUnX2zypbb290EgwMIWpc-C6Jk1h51DnRyhr0wt~aigkNr43YYyr9-TBWVTMG75QdcwBUNnP6iu-7zlBWHBDwW8kd50pjBO0yxhy75v6zIj6MPS2xAh3djD~b~W523wlqG-Y2CbSzZeiOgCOWyUwt30eoV8VJfa93GCj2mA3u8n~eNc7dvKoRBNIQ0Kwpqw~LrNqMWNetJN4E~zzuhOPwkF4Cm3HuiZFTRQjsKW5PXBPpanzI~tuIXas5CsBGwpfE57OaTHS-hE6F70s5qWUs36T~RrP2UDxwyYN2QD0H7tKN5ddrnr5U8tw4tSapqVqM2GLUNBWwpXB5TEfyylw__&Key-Pair-Id=K1FG4T7LWJK0FU";

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

  const r1 = await provider.syncFace(beat1VideoUrl, "0", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
  console.log(`beat 1 -> ${r1.status}, ${r1.media?.path}, $${r1.cost.usd}`);
  record(db, "kling", "lip-sync-audio2video", r1, 0, 3500);

  const r2 = await provider.syncFace(beat2VideoUrl, "1", { path: audioPath, startMs: 3500, endMs: 10148 }, 0);
  console.log(`beat 2 -> ${r2.status}, ${r2.media?.path}, $${r2.cost.usd}`);
  record(db, "kling", "lip-sync-audio2video", r2, 3500, 10148);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
