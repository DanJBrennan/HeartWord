/**
 * Promotes Dan's approved Matthew (Levi) v5 package (2026-09-21): a lean,
 * precise 28-year-old Papuan tax collector with compact curls and a bounded
 * wax-tablet accessory. Prior canon remains available as superseded history.
 *
 * Run: npx tsx scripts/character-tool/promote-matthew-precise-papuan-v5.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "matthew");
const assets = [
  { category: "headshot", candidate: "matthew-headshot-lean-precise-tax-collector-papuan-age-28-v9.png", canonical: "characters/matthew/lip_sync_closeup/close-up-neutral-v5.png" },
  { category: "body_pose", candidate: "matthew-motion-neutral-standing-lean-precise-papuan-age-28-v9.png", canonical: "characters/matthew/motion/motion-neutral-standing-v5.png" },
  { category: "body_pose", candidate: "matthew-motion-walking-lean-precise-papuan-age-28-v9.png", canonical: "characters/matthew/motion/motion-walking-v5.png" },
  { category: "body_pose", candidate: "matthew-motion-teaching-lean-precise-papuan-age-28-v9.png", canonical: "characters/matthew/motion/motion-teaching-v5.png" },
  { category: "body_pose", candidate: "matthew-motion-seated-listening-lean-precise-papuan-age-28-v9.png", canonical: "characters/matthew/motion/motion-seated-listening-v5.png" }
] as const;
type Manifest = { characters: Array<{ name: string; version_label: string; version_status: string; notes: string; assets: Array<{ category: string; path: string; content_hash: string }> }> };
async function sha256(file: string): Promise<string> { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }

async function main() {
  const db = getDb();
  const old = db.prepare(`SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.name = 'Matthew (Levi)'`).get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!old) throw new Error("No approved Matthew (Levi) version found.");
  if (db.prepare(`SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v5'`).get(old.character_id)) throw new Error("Matthew (Levi) v5 already exists; refusing to promote twice.");

  const copied = await Promise.all(assets.map(async (asset) => {
    const destination = path.join(dataDir, "assets", asset.canonical);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(candidateDir, asset.candidate), destination);
    return { ...asset, content_hash: await sha256(destination) };
  }));
  const notes = "Dan-approved 2026-09-21 revision: Matthew (Levi) is a lean 28-year-old Papuan tax collector with a fine-boned oval face, compact tightly coiled black hair, a clean-shaven face, and attentive dark eyes. His stone-gray flax tunic, deep-teal mantle, leather belt, and sandals remain locked. A small plain wax tablet and reed stylus are a bounded practical recognition cue for standing, walking, and seated listening; they are tucked away for teaching. His restrained self-contained posture communicates meticulous observation and social unease without caricature. Matthew has no individually attributed NT line and does not need voice mapping.";
  const now = Date.now();
  const versionId = randomUUID();
  const insertVersion = db.prepare(`INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, 'v5', 'approved', ?, ?, ?, ?)`);
  const insertAsset = db.prepare(`INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, 'Dan-approved generated candidate, 2026-09-21', ?)`);
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
  matthew.version_label = "v5";
  matthew.version_status = "approved";
  matthew.notes = notes;
  matthew.assets = copied.map(({ category, canonical, content_hash }) => ({ category, path: canonical, content_hash }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Promoted Matthew (Levi) v5 (${versionId}); v4 ${old.id} is superseded.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
