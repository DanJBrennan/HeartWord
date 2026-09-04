/**
 * Loads HEARTWORD_DATA_DIR/assets/characters/import-manifest.json into the
 * characters / character_versions / character_assets tables.
 *
 * The manifest (written when Mark 2's canon was imported from BVET-Data and
 * the OpenAI-Code Comics video character library — see
 * docs/plans/CURRENT_GOAL.md) is field-shaped to match this schema
 * directly, so this script is a straight load rather than a transform.
 * Safe to re-run: each character/version/asset is upserted by its natural
 * key rather than blindly inserted, so re-seeding after editing the
 * manifest doesn't create duplicates.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "./client.js";

interface ManifestAsset {
  category: string;
  path: string;
  content_hash: string;
}

interface ManifestCharacter {
  name: string;
  scope_kind: "global" | "book" | "chapter";
  scope_book?: string;
  scope_chapter?: number;
  canon_status: "candidate" | "approved" | "rejected";
  region: string;
  legacy_identity_id: string;
  version_label: string;
  version_status: "candidate" | "approved" | "superseded" | "rejected";
  voice_provider: string | null;
  voice_id: string | null;
  notes: string;
  assets: ManifestAsset[];
}

interface Manifest {
  characters: ManifestCharacter[];
}

function loadManifest(): Manifest {
  const path = join(getDataDir(), "assets", "characters", "import-manifest.json");
  return JSON.parse(readFileSync(path, "utf-8")) as Manifest;
}

export function seedCharacters(): { characters: number; versions: number; assets: number } {
  const db = getDb();
  const manifest = loadManifest();
  const now = Date.now();

  let characterCount = 0;
  let versionCount = 0;
  let assetCount = 0;

  const findCharacter = db.prepare(
    `SELECT id FROM characters WHERE legacy_identity_id = ?`
  );
  const insertCharacter = db.prepare(
    `INSERT INTO characters
       (id, name, scope_kind, scope_book, scope_chapter, canon_status, region, legacy_identity_id, created_at, updated_at)
     VALUES (@id, @name, @scope_kind, @scope_book, @scope_chapter, @canon_status, @region, @legacy_identity_id, @now, @now)`
  );

  const findVersion = db.prepare(
    `SELECT id FROM character_versions WHERE character_id = ? AND version_label = ?`
  );
  const insertVersion = db.prepare(
    `INSERT INTO character_versions
       (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (@id, @character_id, @version_label, @status, @voice_provider, @voice_id, @notes, @now)`
  );

  const findAsset = db.prepare(
    `SELECT id FROM character_assets WHERE character_version_id = ? AND path = ?`
  );
  const insertAsset = db.prepare(
    `INSERT INTO character_assets
       (id, character_version_id, category, path, content_hash, imported_from, created_at)
     VALUES (@id, @character_version_id, @category, @path, @content_hash, @imported_from, @now)`
  );

  function runAll(characters: ManifestCharacter[]) {
    for (const c of characters) {
      let characterId = (findCharacter.get(c.legacy_identity_id) as { id: string } | undefined)?.id;
      if (!characterId) {
        characterId = randomUUID();
        insertCharacter.run({
          id: characterId,
          name: c.name,
          scope_kind: c.scope_kind,
          scope_book: c.scope_book ?? null,
          scope_chapter: c.scope_chapter ?? null,
          canon_status: c.canon_status,
          region: c.region,
          legacy_identity_id: c.legacy_identity_id,
          now
        });
        characterCount++;
      }

      let versionId = (findVersion.get(characterId, c.version_label) as { id: string } | undefined)?.id;
      if (!versionId) {
        versionId = randomUUID();
        insertVersion.run({
          id: versionId,
          character_id: characterId,
          version_label: c.version_label,
          status: c.version_status,
          voice_provider: c.voice_provider,
          voice_id: c.voice_id,
          notes: c.notes,
          now
        });
        versionCount++;
      }

      for (const asset of c.assets) {
        const existing = findAsset.get(versionId, asset.path);
        if (!existing) {
          insertAsset.run({
            id: randomUUID(),
            character_version_id: versionId,
            category: asset.category,
            path: asset.path,
            content_hash: asset.content_hash,
            imported_from: null,
            now
          });
          assetCount++;
        }
      }
    }
  }

  db.exec("BEGIN TRANSACTION");
  try {
    runAll(manifest.characters);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { characters: characterCount, versions: versionCount, assets: assetCount };
}

// Allow `npm run db:seed-characters` to run this directly.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("seed-characters.ts")) {
  const result = seedCharacters();
  console.log(
    `Seeded ${result.characters} new character(s), ${result.versions} version(s), ${result.assets} asset(s).`
  );
}
