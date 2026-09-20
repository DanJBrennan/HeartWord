/**
 * Promotes Dan's approved Bartholomew redesign (2026-09-19): a complete
 * headshot plus four motion references with an indigo mantle / flax tunic
 * color-block that deliberately distinguishes him from Peter.  This creates
 * v3 alongside the previous canon: v2 is superseded, never removed.
 *
 * Run: npx tsx scripts/character-tool/promote-bartholomew-distinct-v3.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "bartholomew");

const assets = [
  {
    category: "headshot",
    candidate: "bartholomew-headshot-distinct-v3.png",
    canonical: "characters/bartholomew/lip_sync_closeup/close-up-neutral-v3.png"
  },
  {
    category: "body_pose",
    candidate: "bartholomew-motion-neutral-standing-distinct-v3.png",
    canonical: "characters/bartholomew/motion/motion-neutral-standing-v3.png"
  },
  {
    category: "body_pose",
    candidate: "bartholomew-motion-walking-distinct-v3.png",
    canonical: "characters/bartholomew/motion/motion-walking-v3.png"
  },
  {
    category: "body_pose",
    candidate: "bartholomew-motion-teaching-distinct-v3.png",
    canonical: "characters/bartholomew/motion/motion-teaching-v3.png"
  },
  {
    category: "body_pose",
    candidate: "bartholomew-motion-seated-listening-distinct-v3.png",
    canonical: "characters/bartholomew/motion/motion-seated-listening-v3.png"
  }
] as const;

type Manifest = {
  characters: Array<{
    name: string;
    version_label: string;
    version_status: string;
    notes: string;
    assets: Array<{ category: string; path: string; content_hash: string }>;
  }>;
};

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();
}

async function main() {
  const copiedAssets = await Promise.all(
    assets.map(async (asset) => {
      const destination = path.join(dataDir, "assets", asset.canonical);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(candidateDir, asset.candidate), destination);
      return { ...asset, content_hash: await sha256(destination) };
    })
  );

  const db = getDb();
  const oldVersion = db
    .prepare(
      `SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.name = 'Bartholomew'`
    )
    .get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!oldVersion) throw new Error("No approved Bartholomew version found.");
  if (db.prepare(`SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v3'`).get(oldVersion.character_id)) {
    throw new Error("Bartholomew v3 already exists; refusing to promote twice.");
  }

  const notes =
    "Dan-approved 2026-09-19 redesign. Identity is a lean late-30s-to-early-40s Hatam/Papuan disciple " +
    "with an oval tapered face, close-cropped tight black curls, and a short pointed beard with minimal gray. " +
    "The locked wardrobe is an undyed flax tunic with a narrow olive woven neckline and a muted deep-indigo " +
    "draped mantle. This full five-image package deliberately separates Bartholomew's silhouette and color " +
    "language from Peter's broad, grayer, rust-brown look. Also called Nathanael in John's Gospel; same person.";
  const now = Date.now();
  const newVersionId = randomUUID();
  const insertVersion = db.prepare(
    `INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (?, ?, 'v3', 'approved', ?, ?, ?, ?)`
  );
  const insertAsset = db.prepare(
    `INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at)
     VALUES (?, ?, ?, ?, ?, 'Dan-approved generated candidate, 2026-09-19', ?)`
  );

  db.exec("BEGIN TRANSACTION");
  try {
    insertVersion.run(newVersionId, oldVersion.character_id, oldVersion.voice_provider, oldVersion.voice_id, notes, now);
    for (const asset of copiedAssets) {
      insertAsset.run(randomUUID(), newVersionId, asset.category, asset.canonical, asset.content_hash, now);
    }
    db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`).run(oldVersion.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const bartholomew = manifest.characters.find((character) => character.name === "Bartholomew");
  if (!bartholomew) throw new Error("Bartholomew is missing from import-manifest.json.");
  bartholomew.version_label = "v3";
  bartholomew.version_status = "approved";
  bartholomew.notes = notes;
  bartholomew.assets = copiedAssets.map(({ category, canonical, content_hash }) => ({
    category,
    path: canonical,
    content_hash
  }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Promoted Bartholomew v3 (${newVersionId}); v2 ${oldVersion.id} is superseded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
