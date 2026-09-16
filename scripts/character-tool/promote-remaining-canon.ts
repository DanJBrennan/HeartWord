/**
 * Promotes the remaining canon garment-fix candidates to canon: 8 Mark 2
 * crowd witnesses and 4 scribes, per Dan's decision 2026-09-07 to accept
 * current results and promote everything now. Friend 1-4 and the Healed
 * paralytic are deliberately excluded (left as originally designed --
 * see fix-remaining-canon-round1.ts's comment for why).
 *
 * These characters use a single "turnaround" asset (not headshot + 4
 * motion poses like Jesus/the Twelve), so promotion is simpler: one new
 * character_versions row, one new character_assets row, old version
 * superseded. Same non-destructive workflow as every other promotion
 * this session.
 *
 * KNOWN LIMITATIONS AT TIME OF PROMOTION, recorded here rather than
 * glossed over:
 * - Crowd witness (man, headwrap): still renders bareheaded despite the
 *   character's own name/spec calling for a headwrap -- a real content
 *   bug, not just a period-accuracy nitpick. Critic severity: moderate.
 * - Crowd witness (stern man, spokesperson): Critic severity SEVERE --
 *   the outer mantle is belted like a sarong, distorting the drape and
 *   bunching the tassels awkwardly at the knee. Promoted anyway per
 *   Dan's explicit "promote everything now," but this is the weakest
 *   result in the batch and a good candidate for a future pass.
 * - Crowd witness (young man): Critic severity SEVERE -- tassels are a
 *   single thread on one corner rather than tied at all four. Same
 *   caveat as above.
 * - Principal scribe, Scribe (middle-aged, tablet-bearer), Scribe
 *   (younger, lean): kept in solid black/charcoal as a deliberate
 *   producer override on the Critic's historical-accuracy finding (black
 *   dye was rare/costly in the period) -- see canon-critic.ts's
 *   producerOverrides support and the recorded review_notes override for
 *   each of these three character versions. Scribe (older, stout) was
 *   already a muted charcoal-grey and needed no override.
 * - Scribe (younger, lean): Critic severity moderate at final promotion
 *   -- tassel bulk, turban headwear (flagged as historically
 *   priest-only), and a thin rope belt are unresolved after 5 rounds of
 *   iteration; accepted as a practical stopping point after the tunic-
 *   length fix (Mark 12:38) landed cleanly.
 *
 * Run: npx tsx scripts/character-tool/promote-remaining-canon.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

interface Promotion {
  characterName: string;
  characterSlug: string; // matches characters/<slug>/turnaround/
  candidateFile: string;
  newFilename: string;
  notes: string;
}

const PROMOTIONS: Promotion[] = [
  {
    characterName: "Crowd witness (elder, grey beard)",
    characterSlug: "mark-crowd-elder-grey-beard",
    candidateFile: "crowd-elder-grey-beard-fix-r2.png",
    newFilename: "hatam-crowd-elder-grey-beard-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2 (plain outer mantle with minimal undyed tassels added -- light-touch tier, no ornamentation forced given modest social station). Severity: moderate (missing clavi/gammadia, some modern tailoring details) -- accepted as a practical stopping point."
  },
  {
    characterName: "Crowd witness (man, headwrap)",
    characterSlug: "mark-crowd-man-headwrap",
    candidateFile: "crowd-man-headwrap-fix-r2.png",
    newFilename: "hatam-crowd-man-headwrap-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2 (plain outer mantle with minimal undyed tassels added). Severity: moderate. KNOWN GAP: still renders bareheaded despite this character's own name calling for a headwrap -- a real content bug, not yet fixed."
  },
  {
    characterName: "Crowd witness (older woman, cream headscarf)",
    characterSlug: "mark-crowd-older-woman-cream",
    candidateFile: "crowd-older-woman-cream-fix-r2.png",
    newFilename: "hatam-crowd-older-woman-cream-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2 (plain outer wrap/veil for public modesty, no tassels per correct female exemption). Severity: minor."
  },
  {
    characterName: "Crowd witness (older woman, rust headscarf)",
    characterSlug: "mark-crowd-older-woman-rust",
    candidateFile: "crowd-older-woman-rust-fix-r2.png",
    newFilename: "hatam-crowd-older-woman-rust-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2 (plain outer wrap/veil for public modesty, no tassels per correct female exemption). Severity: minor."
  },
  {
    characterName: "Crowd witness (stern man, spokesperson)",
    characterSlug: "mark-crowd-stern-man",
    candidateFile: "crowd-stern-man-fix-r2.png",
    newFilename: "hatam-crowd-stern-man-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2. Severity: SEVERE (outer mantle belted like a sarong, distorting drape/tassels) -- promoted per Dan's explicit decision to accept current results, good candidate for a future pass."
  },
  {
    characterName: "Crowd witness (woman with child)",
    characterSlug: "mark-crowd-woman-with-child",
    candidateFile: "crowd-woman-with-child-fix.png",
    newFilename: "hatam-crowd-woman-with-child-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 1 (light-touch anachronism fixes only). Severity: none -- passed clean."
  },
  {
    characterName: "Crowd witness (young man)",
    characterSlug: "mark-crowd-young-man",
    candidateFile: "crowd-young-man-fix-r2.png",
    newFilename: "hatam-crowd-young-man-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2. Severity: SEVERE (tassels are a single thread on one corner, not tied at all four) -- promoted per Dan's explicit decision to accept current results, good candidate for a future pass."
  },
  {
    characterName: "Crowd witness (young woman)",
    characterSlug: "mark-crowd-young-woman",
    candidateFile: "crowd-young-woman-fix-r2.png",
    newFilename: "hatam-crowd-young-woman-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 2 (plain outer wrap/veil for public modesty, no tassels per correct female exemption). Severity: minor."
  },
  {
    characterName: "Principal scribe",
    characterSlug: "mark-2-principal-scribe",
    candidateFile: "principal-scribe-fix-r3-black.png",
    newFilename: "hatam-principal-scribe-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07 (unstitched draped mantle, tassels, clavi, gammadia, sandals) with a PRODUCER OVERRIDE keeping the solid black/charcoal color as a deliberate storytelling device (see recorded review_notes override). Severity with override applied: minor."
  },
  {
    characterName: "Scribe (middle-aged, tablet-bearer)",
    characterSlug: "mark-scribe-middleaged-tablet",
    candidateFile: "scribe-middleaged-tablet-fix-r3-black.png",
    newFilename: "hatam-scribe-middleaged-tablet-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07 (unstitched draped mantle, tassels, clavi, mantle border motif, sandals) with a PRODUCER OVERRIDE keeping the solid black/charcoal color (see recorded review_notes override). Severity with override applied: none -- passed clean."
  },
  {
    characterName: "Scribe (older, stout)",
    characterSlug: "mark-scribe-older-stout",
    candidateFile: "scribe-older-stout-fix.png",
    newFilename: "hatam-scribe-older-stout-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07, round 1 (full correction tier). Severity: none -- passed clean on first pass, already used a muted charcoal-grey so no color override was needed."
  },
  {
    characterName: "Scribe (younger, lean)",
    characterSlug: "mark-scribe-younger-lean",
    candidateFile: "scribe-younger-lean-fix-r5.png",
    newFilename: "hatam-scribe-younger-lean-video-canon-v2.png",
    notes: "Garment corrected per Critic canon garment audit 2026-09-07 across 5 rounds (unstitched mantle, tassel presence, headwear-panel consistency fixed, tunic lengthened to ankle-length per Mark 12:38) with a PRODUCER OVERRIDE keeping solid black/charcoal color (see recorded review_notes override). Severity with override applied: moderate (tassel bulk, turban style, thin belt unresolved) -- accepted as a practical stopping point after 5 rounds."
  }
];

interface OldAssetRow {
  id: string;
  category: string;
  path: string;
}

function readOldAssets(rows: Record<string, unknown>[]): OldAssetRow[] {
  return rows.map((row) => {
    if (typeof row.id !== "string" || typeof row.category !== "string" || typeof row.path !== "string") {
      throw new Error("Expected character asset rows with string id, category, and path.");
    }
    return { id: row.id, category: row.category, path: row.path };
  });
}

async function main() {
  const db = getDb();
  const now = Date.now();

  const insertVersion = db.prepare(
    `INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (?, ?, 'v2', 'approved', ?, ?, ?, ?)`
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
      .prepare(`SELECT id, category, path FROM character_assets WHERE character_version_id = ?`)
      .all(oldVersion.id));

    const relPath = `characters/${promo.characterSlug}/turnaround/${promo.newFilename}`;
    const absPath = path.join(dataDir, "assets", relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await copyFile(path.join(CANDIDATES_DIR, promo.candidateFile), absPath);

    const newVersionId = randomUUID();
    insertVersion.run(newVersionId, oldVersion.character_id, oldVersion.voice_provider, oldVersion.voice_id, promo.notes, now);

    // Carry forward every old asset unchanged EXCEPT the turnaround, which gets the new corrected file.
    for (const asset of oldAssets) {
      const isTurnaround = asset.category === "turnaround";
      insertAsset.run(randomUUID(), newVersionId, asset.category, isTurnaround ? relPath : asset.path, now);
    }

    supersedeVersion.run(oldVersion.id);
    console.log(`  -> new version ${newVersionId} (v2), old version ${oldVersion.id} superseded`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
