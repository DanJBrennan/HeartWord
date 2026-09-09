/**
 * Promotes selected garment-fix candidates (fix-jesus-twelve-garments.ts
 * and its round-2/minor-fix follow-ups) to real canon, per Dan's decision
 * 2026-09-07 to promote the clean/minor results now: Bartholomew, Simon
 * the Zealot, and James son of Alphaeus (rated "none" by the Critic),
 * plus Peter (round-2 candidate, "minor") and Philip the Apostle
 * (round-1 candidate, "minor").
 *
 * Follows canonical-characters.md's "Evolving a Character Without Losing
 * Continuity" workflow exactly: never overwrites the old canon asset --
 * creates a NEW character_versions row (status 'approved') carrying the
 * corrected motion-neutral-standing image, sets the OLD version's status
 * to 'superseded' (not deleted), and copies forward the OLD version's
 * headshot and other three motion poses (walking/teaching/seated-
 * listening) UNCHANGED onto the new version -- this script only
 * regenerated the standing full-body reference, not those other angles.
 *
 * KNOWN LIMITATION, surfaced to Dan rather than silently glossed over:
 * the headshot and the walking/teaching/seated-listening poses still
 * show each character's PRE-FIX garment (no tassels, tailored coat,
 * etc.). Only the motion-neutral-standing pose -- the one used as the
 * canon reference image and the one an operator would look at first --
 * carries the correction. A full pass regenerating every angle is a
 * separate follow-up if Dan wants full cross-pose consistency.
 *
 * Run: npx tsx scripts/character-tool/promote-garment-fixes.ts
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
  characterSlug: string; // matches characters/<slug>/... asset paths
  candidateFile: string; // filename within CANDIDATES_DIR
  newVersionLabel: string;
  newStandingFilename: string; // filename to save under characters/<slug>/motion/
}

const PROMOTIONS: Promotion[] = [
  {
    characterName: "Bartholomew",
    characterSlug: "bartholomew",
    candidateFile: "bartholomew-garment-fix.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  },
  {
    characterName: "Simon the Zealot",
    characterSlug: "simon-the-zealot",
    candidateFile: "simon-the-zealot-garment-fix-r2.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  },
  {
    characterName: "James son of Alphaeus",
    characterSlug: "james-son-of-alphaeus",
    candidateFile: "james-son-of-alphaeus-garment-fix.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  },
  {
    characterName: "Peter",
    characterSlug: "peter",
    candidateFile: "peter-garment-fix-r2.png",
    newVersionLabel: "v3",
    newStandingFilename: "motion-neutral-standing-v3.png"
  },
  {
    characterName: "Philip the Apostle",
    characterSlug: "philip-the-apostle",
    candidateFile: "philip-the-apostle-garment-fix.png",
    newVersionLabel: "v2",
    newStandingFilename: "motion-neutral-standing-v2.png"
  }
];

interface OldAssetRow {
  category: string;
  path: string;
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

    const oldAssets = db
      .prepare(`SELECT category, path FROM character_assets WHERE character_version_id = ?`)
      .all(oldVersion.id) as OldAssetRow[];

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
      "Garment corrected per Critic canon garment audit 2026-09-07 (tzitzit added, draped mantle instead of " +
        "tailored coat, natural dye/clavi ornamentation instead of embroidered trim). Only the motion-neutral-" +
        "standing reference was regenerated -- headshot and other motion poses carried forward unchanged from " +
        "the prior version and still show the pre-fix garment.",
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
