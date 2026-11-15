/**
 * Third promotion batch, same workflow as promote-garment-fixes.ts /
 * promote-garment-fixes-2.ts: Jesus (round-7 candidate, "none" -- the
 * synthesis of the Critic's structural fixes and Dan's own art-direction
 * notes on belt width, mantle simplicity, and worn/frayed fabric), James
 * son of Zebedee (round-4, "none"), Judas Iscariot (round-4, "none"), and
 * Thaddaeus/Jude (round-4, "minor") -- per Dan's decision 2026-09-07.
 *
 * Same known limitation as the earlier batches: only the motion-neutral-
 * standing pose was regenerated -- headshot and the other three motion
 * poses (walking/teaching/seated-listening) are carried forward unchanged
 * and still show the pre-fix garment.
 *
 * Run: npx tsx scripts/character-tool/promote-garment-fixes-3.ts
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
  notes: string;
}

const PROMOTIONS: Promotion[] = [
  {
    characterName: "Jesus",
    characterSlug: "jesus",
    candidateFile: "jesus-garment-fix-r7.png",
    newVersionLabel: "v3",
    newStandingFilename: "motion-neutral-standing-v3.png",
    notes:
      "Garment corrected per Critic canon garment audit 2026-09-07, round 7 (tzitzit, draped mantle, corner " +
      "gamma motif, clavi, authentic low-ankle sandals) plus Dan's own art-direction pass: narrower belt, " +
      "simplified/less-matching mantle borders, natural folds, and visibly worn/frayed hems -- with the fraying " +
      "kept distinct from the tied corner tassels after an earlier attempt blended the two. Critic severity: " +
      "none. Only the motion-neutral-standing reference was regenerated -- headshot and other motion poses " +
      "carried forward unchanged from the prior version and still show the pre-fix garment."
  },
  {
    characterName: "James son of Zebedee",
    characterSlug: "james-son-of-zebedee",
    candidateFile: "james-son-of-zebedee-garment-fix-r4.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png",
    notes:
      "Garment corrected per Critic canon garment audit 2026-09-07, round 4 (tzitzit, draped mantle, corner " +
      "gamma motif, symmetric clavi, hardware-free belt, plain neck slit, authentic sandals). Critic severity: " +
      "none. Only the motion-neutral-standing reference was regenerated -- headshot and other motion poses " +
      "carried forward unchanged from the prior version and still show the pre-fix garment."
  },
  {
    characterName: "Judas Iscariot",
    characterSlug: "judas-iscariot",
    candidateFile: "judas-iscariot-garment-fix-r4.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png",
    notes:
      "Garment corrected per Critic canon garment audit 2026-09-07, round 4 (tzitzit, draped mantle, corner " +
      "gamma motif, symmetric clavi, hardware-free belt, plain neck slit, authentic sandals). Critic severity: " +
      "none. Only the motion-neutral-standing reference was regenerated -- headshot and other motion poses " +
      "carried forward unchanged from the prior version and still show the pre-fix garment."
  },
  {
    characterName: "Thaddaeus (Jude)",
    characterSlug: "thaddaeus-jude",
    candidateFile: "thaddaeus-jude-garment-fix-r4.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png",
    notes:
      "Garment corrected per Critic canon garment audit 2026-09-07, round 4 (tzitzit, draped mantle, corner " +
      "gamma motif, symmetric clavi, hardware-free belt, plain neck slit, authentic sandals). Critic severity: " +
      "minor (tassel styling still reads slightly decorative). Only the motion-neutral-standing reference was " +
      "regenerated -- headshot and other motion poses carried forward unchanged from the prior version and " +
      "still show the pre-fix garment."
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
      promo.notes,
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
