/**
 * Promotes Thomas's round-6 garment-fix candidate to canon (Critic
 * severity: moderate -- the best of 8 rounds; three further attempts to
 * fix the one remaining asymmetric-clavus nitpick regressed other
 * already-fixed details instead of improving, likely because this pose's
 * mantle drape occludes the left shoulder where the second stripe would
 * go), per Dan's decision 2026-09-07 to accept this as the practical
 * stopping point. Same workflow as the other promotions: new approved
 * character_versions row, old version superseded (not deleted), only the
 * motion-neutral-standing pose replaced.
 *
 * Run: npx tsx scripts/character-tool/promote-thomas.ts
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
       WHERE c.name = 'Thomas'`
    )
    .get() as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null };

  const oldAssets = db
    .prepare(`SELECT category, path FROM character_assets WHERE character_version_id = ?`)
    .all(oldVersion.id) as Array<{ category: string; path: string }>;

  const relStandingPath = "characters/thomas/motion/motion-neutral-standing-v2.png";
  const absStandingPath = path.join(dataDir, "assets", relStandingPath);
  await mkdir(path.dirname(absStandingPath), { recursive: true });
  await copyFile(path.join(CANDIDATES_DIR, "thomas-garment-fix-r6.png"), absStandingPath);

  const newVersionId = randomUUID();
  db.prepare(
    `INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (?, ?, 'v2', 'approved', ?, ?, ?, ?)`
  ).run(
    newVersionId,
    oldVersion.character_id,
    oldVersion.voice_provider,
    oldVersion.voice_id,
    "Garment corrected per Critic canon garment audit 2026-09-07, round 6 (tzitzit added at mantle corners, " +
      "corner gamma motifs replacing a continuous modern-style striped border, short sleeves, narrow cord belt, " +
      "unstitched draped mantle). Critic severity: moderate -- one remaining nitpick (the tunic's clavus stripe " +
      "only shows on one side, likely because this pose's mantle drape covers the other shoulder) survived three " +
      "further correction attempts without improving and was accepted as a practical stopping point. Only the " +
      "motion-neutral-standing reference was regenerated -- headshot and other motion poses carried forward " +
      "unchanged from the prior version and still show the pre-fix garment.",
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
  console.log(`Promoted Thomas: new version ${newVersionId} (v2), old version ${oldVersion.id} superseded`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
