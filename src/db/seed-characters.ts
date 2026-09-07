/**
 * Loads HEARTWORD_DATA_DIR/assets/characters/import-manifest.json into the
 * characters / character_versions / character_assets / character_groups
 * tables.
 *
 * The manifest (written when Mark 2's canon was imported from BVET-Data and
 * the OpenAI-Code Comics video character library -- see
 * docs/plans/CURRENT_GOAL.md) is field-shaped to match this schema
 * directly, so this script is a straight load rather than a transform.
 * Safe to re-run: each character/version/asset/group is upserted by its
 * natural key rather than blindly inserted, so re-seeding after editing the
 * manifest doesn't create duplicates.
 *
 * Upsert scope, chosen deliberately rather than uniformly:
 * - `characters`' identity/canon fields (name, scope, canon_status, region)
 *   and its group membership ARE resynced from the manifest on every run --
 *   nothing else in the app mutates these, and treating the manifest as
 *   authoritative here is what closes the exact class of bug found
 *   2026-09-06 (a direct DB fix for Jesus's stale v1 headshot never got
 *   mirrored into the manifest, so a future re-seed could have silently
 *   resurrected the stale asset via a fresh row at the old path).
 * - `character_versions`' status/voice_provider/voice_id are NOT resynced
 *   for an already-existing version row -- the live voice-casting UI
 *   (`PATCH /api/characters/:id/voice`) writes real ElevenLabs
 *   voice_provider/voice_id directly onto that row, and this manifest has
 *   no way to know about that -- resyncing would silently wipe out a
 *   producer's real voice approvals on the next seed run. `notes` IS
 *   resynced every run, though -- nothing else in the app writes to it, so
 *   a corrected note (e.g. "verified this disciple doesn't speak") should
 *   actually reach the database on re-seed, not sit unapplied in the file.
 * - `character_assets` stays insert-if-missing-by-path, unchanged -- a
 *   manifest asset whose path changed (e.g. a v1->v2 promotion) still needs
 *   a manual fix at the row that changed, same as the Jesus/Peter
 *   corrections in docs/plans/CURRENT_GOAL.md. Making this fully self-
 *   healing is a separate, larger change than this pass.
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

interface ManifestGroupRef {
  /** Natural key -- character_groups.name is UNIQUE, so this is how an
   *  existing group is found rather than duplicated. */
  name: string;
  scope_kind: "global" | "book" | "chapter";
  scope_book?: string;
  scope_chapter?: number;
  notes?: string;
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
  /** Set only for a member of a character group (a set of 4+ distinct
   *  designs meant to be cast/repeated together to fill out a crowd --
   *  see docs/design/canonical-characters.md's "Character Groups"
   *  section). Omit entirely for a named individual like Jesus or a
   *  disciple. */
  group?: ManifestGroupRef;
  /** Only meaningful alongside `group`. At most one member per group
   *  should set this -- the member who gets voice-mapped and lip-synced
   *  when the group needs a line; enforced by a partial unique index in
   *  schema.sql, so a manifest mistake here fails loudly at seed time
   *  rather than silently. */
  is_spokesperson?: boolean;
}

interface Manifest {
  characters: ManifestCharacter[];
}

function loadManifest(): Manifest {
  const path = join(getDataDir(), "assets", "characters", "import-manifest.json");
  return JSON.parse(readFileSync(path, "utf-8")) as Manifest;
}

export function seedCharacters(): { characters: number; versions: number; assets: number; groups: number } {
  const db = getDb();
  const manifest = loadManifest();
  const now = Date.now();

  let characterCount = 0;
  let versionCount = 0;
  let assetCount = 0;
  let groupCount = 0;

  const findCharacter = db.prepare(`SELECT id FROM characters WHERE legacy_identity_id = ?`);
  const insertCharacter = db.prepare(
    `INSERT INTO characters
       (id, name, scope_kind, scope_book, scope_chapter, canon_status, region, legacy_identity_id, created_at, updated_at)
     VALUES (@id, @name, @scope_kind, @scope_book, @scope_chapter, @canon_status, @region, @legacy_identity_id, @now, @now)`
  );
  // Identity/canon fields are resynced from the manifest every run -- see
  // this file's header for why that's safe here but not for versions.
  const updateCharacterIdentity = db.prepare(
    `UPDATE characters
     SET name = @name, scope_kind = @scope_kind, scope_book = @scope_book, scope_chapter = @scope_chapter,
         canon_status = @canon_status, region = @region, updated_at = @now
     WHERE id = @id`
  );
  const updateCharacterGroup = db.prepare(
    `UPDATE characters SET group_id = ?, is_spokesperson = ?, updated_at = ? WHERE id = ?`
  );

  const findGroupByName = db.prepare(`SELECT id FROM character_groups WHERE name = ?`);
  const insertGroup = db.prepare(
    `INSERT INTO character_groups (id, name, scope_kind, scope_book, scope_chapter, notes, created_at)
     VALUES (@id, @name, @scope_kind, @scope_book, @scope_chapter, @notes, @now)`
  );

  const findVersion = db.prepare(`SELECT id FROM character_versions WHERE character_id = ? AND version_label = ?`);
  const insertVersion = db.prepare(
    `INSERT INTO character_versions
       (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
     VALUES (@id, @character_id, @version_label, @status, @voice_provider, @voice_id, @notes, @now)`
  );
  const updateVersionNotes = db.prepare(`UPDATE character_versions SET notes = ? WHERE id = ?`);

  const findAsset = db.prepare(`SELECT id FROM character_assets WHERE character_version_id = ? AND path = ?`);
  const insertAsset = db.prepare(
    `INSERT INTO character_assets
       (id, character_version_id, category, path, content_hash, imported_from, created_at)
     VALUES (@id, @character_version_id, @category, @path, @content_hash, @imported_from, @now)`
  );

  function findOrCreateGroup(ref: ManifestGroupRef): string {
    const existing = findGroupByName.get(ref.name) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    insertGroup.run({
      id,
      name: ref.name,
      scope_kind: ref.scope_kind,
      scope_book: ref.scope_book ?? null,
      scope_chapter: ref.scope_chapter ?? null,
      notes: ref.notes ?? null,
      now
    });
    groupCount++;
    return id;
  }

  function runAll(characters: ManifestCharacter[]) {
    for (const c of characters) {
      let characterId = (findCharacter.get(c.legacy_identity_id) as { id: string } | undefined)?.id;
      const identityFields = {
        name: c.name,
        scope_kind: c.scope_kind,
        scope_book: c.scope_book ?? null,
        scope_chapter: c.scope_chapter ?? null,
        canon_status: c.canon_status,
        region: c.region,
        now
      };
      if (!characterId) {
        characterId = randomUUID();
        insertCharacter.run({ id: characterId, ...identityFields, legacy_identity_id: c.legacy_identity_id });
        characterCount++;
      } else {
        updateCharacterIdentity.run({ id: characterId, ...identityFields });
      }

      if (c.group) {
        const groupId = findOrCreateGroup(c.group);
        updateCharacterGroup.run(groupId, c.is_spokesperson ? 1 : 0, now, characterId);
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
      } else {
        updateVersionNotes.run(c.notes, versionId);
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

  return { characters: characterCount, versions: versionCount, assets: assetCount, groups: groupCount };
}

// Allow `npm run db:seed-characters` to run this directly.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("seed-characters.ts")) {
  const result = seedCharacters();
  console.log(
    `Seeded ${result.characters} new character(s), ${result.versions} version(s), ${result.assets} asset(s), ` +
      `${result.groups} new group(s).`
  );
}
