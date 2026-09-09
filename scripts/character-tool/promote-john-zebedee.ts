/**
 * Promotes John son of Zebedee's round-5 garment-fix candidate to canon
 * (Critic severity: none), per Dan's decision 2026-09-07. Same workflow
 * as promote-garment-fixes.ts / -2 / -3: new approved character_versions
 * row, old version superseded (not deleted), only the motion-neutral-
 * standing pose replaced -- headshot and the other three motion poses
 * carried forward unchanged and still show the pre-fix garment (same
 * follow-up needed as the other 11 already-promoted characters).
 *
 * Run: npx tsx scripts/character-tool/promote-john-zebedee.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

async function main() {
  const db = getDb();
  const now = Date.now();

  const oldVersion = db
    .prepare(
      `SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.name = 'John son of Zebedee'`
    )
    .get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null };

  const oldAssets = db
    .prepare(`SELECT category, path FROM character_assets WHERE character_version_id = ?`)
    .all(oldVersion.id) as Array<{ category: string; path: string }>;

  const relStandingPath = "characters/john-son-of-zebedee/motion/motion-neutral-standing-v2.png";
  const absStandingPath = path.join(dataDir, "assets", relStandingPath);
  await mkdir(path.dirname(absStandingPath), { recursive: true });
  await copyFile(path.join(CANDIDATES_DIR, "john-son-of-zebedee-garment-fix-r5.png"), absStandingPath);

  const newVersionId = randomUUID();
  db.prepare(
    `INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (?, ?, 'v2', 'approved', ?, ?, ?, ?)`
  ).run(
    newVersionId,
    oldVersion.character_id,
    oldVersion.voice_provider,
    oldVersion.voice_id,
    "Garment corrected per Critic canon garment audit 2026-09-07, round 5 (tzitzit and gamma motif moved from " +
      "tunic to mantle where they belong, unstitched draped mantle construction, narrow belt, low-ankle sandals). " +
      "Critic severity: none. Only the motion-neutral-standing reference was regenerated -- headshot and other " +
      "motion poses carried forward unchanged from the prior version and still show the pre-fix garment.",
    now
  );

  const insertAsset = db.prepare(
    `INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?)`
  );
  for (const asset of oldAssets) {
    const isStandingPose = asset.path.includes("motion-neutral-standing");
    insertAsset.run(randomUUID(), newVersionId, asset.category, isStandingPose ? relStandingPath : asset.path, now);
  }

  db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`).run(oldVersion.id);
  console.log(`Promoted John son of Zebedee: new version ${newVersionId} (v2), old version ${oldVersion.id} superseded`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
