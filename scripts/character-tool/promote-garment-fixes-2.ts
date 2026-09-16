/**
 * Second promotion batch, same workflow as promote-garment-fixes.ts:
 * Andrew (round-3 candidate, rated "minor") and Matthew/Levi (round-3
 * candidate, rated "none") -- both cleared after two earlier rounds
 * stayed severe, per Dan's decision 2026-09-07 to promote them once they
 * passed and continue refining the rest separately.
 *
 * Same known limitation as the first batch: only the motion-neutral-
 * standing pose was regenerated -- headshot and the other three motion
 * poses (walking/teaching/seated-listening) are carried forward unchanged
 * and still show the pre-fix garment.
 *
 * Run: npx tsx scripts/character-tool/promote-garment-fixes-2.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

interface Promotion {
  characterName: string;
  characterSlug: string;
  candidateFile: string;
  newVersionLabel: string;
  newStandingFilename: string;
}

const PROMOTIONS: Promotion[] = [
  {
    characterName: "Andrew",
    characterSlug: "andrew",
    candidateFile: "andrew-garment-fix-r3.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  },
  {
    characterName: "Matthew (Levi)",
    characterSlug: "matthew",
    candidateFile: "matthew-garment-fix-r3.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  }
];

interface OldAssetRow {
  category: string;
  path: string;
}

function readOldAssets(rows: Record<string, unknown>[]): OldAssetRow[] {
  return rows.map((row) => {
    if (typeof row.category !== "string" || typeof row.path !== "string") {
      throw new Error("Expected character asset rows with string category and path.");
    }
    return { category: row.category, path: row.path };
  });
}

async function main() {
  const db = getDb();
  const now = Date.now();

  const insertVersion = db.prepare(
    `INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)`
  );
  const supersedeVersion = db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`);
  const insertAsset = db.prepare(
    `INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?)`
  );

  for (const promo of PROMOTIONS) {
    console.log(`\nPromoting ${promo.characterName}...`);

    const oldVersion = db
      .prepare(
        `SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c
         JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
         WHERE c.name = ?`
      )
      .get(promo.characterName) as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
    if (!oldVersion) {
      console.error(`  -> FAILED: no current approved version found for ${promo.characterName}`);
      continue;
    }

    const oldAssets = readOldAssets(db
      .prepare(`SELECT category, path FROM character_assets WHERE character_version_id = ?`)
      .all(oldVersion.id));

    const relStandingPath = path.join("characters", promo.characterSlug, "motion", promo.newStandingFilename);
    const absStandingPath = path.join(dataDir, "assets", relStandingPath);
    await mkdir(path.dirname(absStandingPath), { recursive: true });
    await copyFile(path.join(CANDIDATES_DIR, promo.candidateFile), absStandingPath);

    const newVersionId = randomUUID();
    insertVersion.run(
      newVersionId,
      oldVersion.character_id,
      promo.newVersionLabel,
      oldVersion.voice_provider,
      oldVersion.voice_id,
      "Garment corrected per Critic canon garment audit 2026-09-07, round 3 (tzitzit, draped mantle, corner " +
        "gamma/notched motifs instead of continuous border trim, symmetric clavi, hardware-free belt, plain neck " +
        "slit, authentic sandals). Only the motion-neutral-standing reference was regenerated -- headshot and " +
        "other motion poses carried forward unchanged from the prior version and still show the pre-fix garment.",
      now
    );

    for (const asset of oldAssets) {
      const isStandingPose = asset.path.includes("motion-neutral-standing");
      insertAsset.run(
        randomUUID(),
        newVersionId,
        asset.category,
        isStandingPose ? relStandingPath.replace(/\\/g, "/") : asset.path,
        now
      );
    }

    supersedeVersion.run(oldVersion.id);
    console.log(`  -> new version ${newVersionId} (${promo.newVersionLabel}), old version ${oldVersion.id} superseded`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
