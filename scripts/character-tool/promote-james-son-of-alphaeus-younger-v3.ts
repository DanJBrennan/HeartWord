/**
 * Promotes Dan's approved James son of Alphaeus v3 package (2026-09-19):
 * a subtly younger identity with a full black beard across the headshot and
 * four motion references. The previous canon is superseded, not deleted.
 *
 * Run: npx tsx scripts/character-tool/promote-james-son-of-alphaeus-younger-v3.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "james-son-of-alphaeus");
const assets = [
  { category: "headshot", candidate: "james-son-of-alphaeus-headshot-younger-black-beard-v3.png", canonical: "characters/james-son-of-alphaeus/lip_sync_closeup/close-up-neutral-v3.png" },
  { category: "body_pose", candidate: "james-son-of-alphaeus-motion-neutral-standing-younger-black-beard-v3.png", canonical: "characters/james-son-of-alphaeus/motion/motion-neutral-standing-v3.png" },
  { category: "body_pose", candidate: "james-son-of-alphaeus-motion-walking-younger-black-beard-v3.png", canonical: "characters/james-son-of-alphaeus/motion/motion-walking-v3.png" },
  { category: "body_pose", candidate: "james-son-of-alphaeus-motion-teaching-younger-black-beard-v3.png", canonical: "characters/james-son-of-alphaeus/motion/motion-teaching-v3.png" },
  { category: "body_pose", candidate: "james-son-of-alphaeus-motion-seated-listening-younger-black-beard-v3.png", canonical: "characters/james-son-of-alphaeus/motion/motion-seated-listening-v3.png" }
] as const;
type Manifest = { characters: Array<{ name: string; version_label: string; version_status: string; notes: string; assets: Array<{ category: string; path: string; content_hash: string }> }> };
async function sha256(file: string): Promise<string> { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }

async function main() {
  const copied = await Promise.all(assets.map(async (asset) => {
    const destination = path.join(dataDir, "assets", asset.canonical);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(candidateDir, asset.candidate), destination);
    return { ...asset, content_hash: await sha256(destination) };
  }));
  const db = getDb();
  const old = db.prepare(`SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.name = 'James son of Alphaeus'`).get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!old) throw new Error("No approved James son of Alphaeus version found.");
  if (db.prepare(`SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v3'`).get(old.character_id)) throw new Error("James son of Alphaeus v3 already exists; refusing to promote twice.");
  const notes = "Dan-approved 2026-09-19 revision: James son of Alphaeus is five years younger than the prior canon, with short tightly curled black hair and a full neatly trimmed black beard. His pale flax tunic and gray draped mantle remain locked across the full five-image package. He has no recorded words in the NT and does not need voice mapping.";
  const now = Date.now(); const versionId = randomUUID();
  const insertVersion = db.prepare(`INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, 'v3', 'approved', ?, ?, ?, ?)`);
  const insertAsset = db.prepare(`INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, 'Dan-approved generated candidate, 2026-09-19', ?)`);
  db.exec("BEGIN TRANSACTION");
  try {
    insertVersion.run(versionId, old.character_id, old.voice_provider, old.voice_id, notes, now);
    for (const asset of copied) insertAsset.run(randomUUID(), versionId, asset.category, asset.canonical, asset.content_hash, now);
    db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`).run(old.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const james = manifest.characters.find((character) => character.name === "James son of Alphaeus");
  if (!james) throw new Error("James son of Alphaeus is missing from import-manifest.json.");
  james.version_label = "v3"; james.version_status = "approved"; james.notes = notes;
  james.assets = copied.map(({ category, canonical, content_hash }) => ({ category, path: canonical, content_hash }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Promoted James son of Alphaeus v3 (${versionId}); v2 ${old.id} is superseded.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
