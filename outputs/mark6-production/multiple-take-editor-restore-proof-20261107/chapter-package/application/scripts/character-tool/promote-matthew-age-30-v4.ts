/**
 * Promotes Dan's approved Matthew (Levi) v4 package (2026-09-20): an
 * approximately 30-year-old, bald, clean-shaven Papuan disciple with a
 * stone-gray flax tunic and deep-teal mantle, recorded consistently across
 * the headshot and four motion references. Prior versions are retained.
 *
 * Run: npx tsx scripts/character-tool/promote-matthew-age-30-v4.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "matthew");
const assets = [
  { category: "headshot", candidate: "matthew-headshot-age-30-v6.png", canonical: "characters/matthew/lip_sync_closeup/close-up-neutral-v4.png" },
  { category: "body_pose", candidate: "matthew-motion-neutral-standing-age-30-v6.png", canonical: "characters/matthew/motion/motion-neutral-standing-v4.png" },
  { category: "body_pose", candidate: "matthew-motion-walking-age-30-v6.png", canonical: "characters/matthew/motion/motion-walking-v4.png" },
  { category: "body_pose", candidate: "matthew-motion-teaching-age-30-v6.png", canonical: "characters/matthew/motion/motion-teaching-v4.png" },
  { category: "body_pose", candidate: "matthew-motion-seated-listening-age-30-v6.png", canonical: "characters/matthew/motion/motion-seated-listening-v4.png" }
] as const;
type Manifest = { characters: Array<{ name: string; version_label: string; version_status: string; notes: string; assets: Array<{ category: string; path: string; content_hash: string }> }> };
async function sha256(file: string): Promise<string> { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }

async function main() {
  const db = getDb();
  const old = db.prepare(`SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.name = 'Matthew (Levi)'`).get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!old) throw new Error("No approved Matthew (Levi) version found.");
  if (db.prepare(`SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v4'`).get(old.character_id)) throw new Error("Matthew (Levi) v4 already exists; refusing to promote twice.");

  const copied = await Promise.all(assets.map(async (asset) => {
    const source = path.join(candidateDir, asset.candidate);
    const destination = path.join(dataDir, "assets", asset.canonical);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    return { ...asset, content_hash: await sha256(destination) };
  }));
  const notes = "Dan-approved 2026-09-20 revision: Matthew (Levi) is an approximately 30-year-old, bald, clean-shaven Papuan disciple with a broad, friendly face and fuller build. His pale stone-gray flax tunic, deep-teal mantle, leather belt, and sandals are locked consistently across the full five-image package. This replaces the older v3 headshot and its carried-forward v2 motion references. Matthew has no individually attributed NT line and does not need voice mapping.";
  const now = Date.now();
  const versionId = randomUUID();
  const insertVersion = db.prepare(`INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, 'v4', 'approved', ?, ?, ?, ?)`);
  const insertAsset = db.prepare(`INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, 'Dan-approved generated candidate, 2026-09-20', ?)`);
  db.exec("BEGIN TRANSACTION");
  try {
    insertVersion.run(versionId, old.character_id, old.voice_provider, old.voice_id, notes, now);
    for (const asset of copied) insertAsset.run(randomUUID(), versionId, asset.category, asset.canonical, asset.content_hash, now);
    db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`).run(old.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const matthew = manifest.characters.find((character) => character.name === "Matthew (Levi)");
  if (!matthew) throw new Error("Matthew (Levi) is missing from import-manifest.json.");
  matthew.version_label = "v4";
  matthew.version_status = "approved";
  matthew.notes = notes;
  matthew.assets = copied.map(({ category, canonical, content_hash }) => ({ category, path: canonical, content_hash }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Promoted Matthew (Levi) v4 (${versionId}); v3 ${old.id} is superseded.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
