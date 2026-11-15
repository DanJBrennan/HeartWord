/**
 * Restores Dan's approved Jesus v3 reference package as a new immutable v5.
 * v3's neutral studio backgrounds and tassel treatment are retained exactly;
 * v4 remains superseded history for comparison and rollback.
 * Run: npx tsx scripts/character-tool/restore-jesus-v3-reference-package.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();

async function main() {
  const db = getDb(), dataDir = getDataDir();
  const versions = db.prepare(`SELECT cv.id, cv.character_id, cv.version_label, cv.status, cv.voice_provider, cv.voice_id
    FROM characters c JOIN character_versions cv ON cv.character_id=c.id WHERE c.name=?`).all("Jesus") as
      Array<{ id: string; character_id: string; version_label: string; status: string; voice_provider: string | null; voice_id: string | null }>;
  const source = versions.find(version => version.version_label === "v3");
  const current = versions.find(version => version.status === "approved");
  if (!source || !current || current.version_label !== "v4") throw new Error("Expected preserved Jesus v3 and approved v4.");
  if (db.prepare("SELECT 1 FROM character_versions WHERE character_id=? AND version_label='v5'").get(current.character_id)) throw new Error("Jesus v5 already exists; refusing to restore twice.");
  const assets = db.prepare("SELECT category,path FROM character_assets WHERE character_version_id=? ORDER BY path").all(source.id) as Array<{ category: string; path: string }>;
  if (assets.length !== 6) throw new Error(`Expected six v3 assets, found ${assets.length}.`);
  const now = Date.now(), id = randomUUID();
  const notes = "Dan-approved 2026-09-21 restoration of the complete Jesus v3 reference package as v5. Restores v3's neutral studio backgrounds and its established tassel treatment across all motion poses. v4 remains superseded history; no source artwork is overwritten.";
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,notes,created_at)
      VALUES (?,?,'v5','approved',?,?,?,?)`).run(id, current.character_id, current.voice_provider, current.voice_id, notes, now);
    const insert = db.prepare(`INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,created_at)
      VALUES (?,?,?,?,?,?,?)`);
    for (const asset of assets) {
      insert.run(randomUUID(), id, asset.category, asset.path, await hash(path.join(dataDir, "assets", asset.path)), "Restored exactly from Dan-approved Jesus v3 reference package", now);
    }
    db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(current.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(`Restored Jesus v3 package as approved v5; v4 ${current.id} superseded.`);
}
main().catch(error => { console.error(error); process.exit(1); });
