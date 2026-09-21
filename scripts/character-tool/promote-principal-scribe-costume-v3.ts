/** Promotes Dan's approved principal-scribe costume correction (2026-09-21).
 * Regenerated the turnaround only: it retains the producer-approved black
 * fabric while adding a loose sudra, small knotted corner tzitzit, and purple
 * non-figurative gamma motifs.  No other asset or identity detail changes.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidate = path.join(dataDir, "assets", "characters", "candidates", "canon-costume-fixes-2026-09-21", "principal-scribe-turnaround-knotted-tzitzit-gamma-sudra-r4.png");
const canonical = "characters/mark-2-principal-scribe/turnaround/hatam-principal-scribe-video-canon-v3.png";
const notes = "Dan-approved 2026-09-21 Mark 3 costume correction. Regenerated the turnaround only: retained the deliberate black/charcoal fabric override, added a loose crown-draped sudra, replaced thick tassels with small hand-knotted wool corner tzitzit, and replaced figurative mantle embroidery with restrained purple non-figurative gamma motifs. All other identity and construction details are carried forward unchanged.";
const sha256 = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();

async function main() {
  const db = getDb();
  const old = db.prepare("SELECT cv.id, cv.character_id, cv.version_label, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id=c.id WHERE c.name=? AND cv.status='approved'").get("Principal scribe") as { id: string; character_id: string; version_label: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!old || old.version_label !== "v2") throw new Error(`Expected Principal scribe v2, got ${old?.version_label ?? "none"}.`);
  const oldAssets = db.prepare("SELECT category, path, content_hash FROM character_assets WHERE character_version_id=?").all(old.id) as Array<{ category: string; path: string; content_hash: string | null }>;
  const destination = path.join(dataDir, "assets", canonical); await mkdir(path.dirname(destination), { recursive: true }); await copyFile(candidate, destination);
  const versionId = randomUUID(), now = Date.now(), newHash = await sha256(destination);
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, 'v3', 'approved', ?, ?, ?, ?)").run(versionId, old.character_id, old.voice_provider, old.voice_id, notes, now);
    const insert = db.prepare("INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const asset of oldAssets) insert.run(randomUUID(), versionId, asset.category, asset.category === "turnaround" ? canonical : asset.path, asset.category === "turnaround" ? newHash : asset.content_hash, asset.category === "turnaround" ? "Dan-approved generated candidate, 2026-09-21" : "Carried forward unchanged from prior approved version", now);
    db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(old.id); db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { characters: Array<{ name: string; version_label: string; version_status: string; notes: string; assets: Array<{ category: string; path: string; content_hash: string }> }> };
  const entry = manifest.characters.find((item) => item.name === "Principal scribe"); if (!entry) throw new Error("Principal scribe missing from manifest.");
  entry.version_label = "v3"; entry.version_status = "approved"; entry.notes = notes;
  entry.assets = await Promise.all(oldAssets.map(async (asset) => ({ category: asset.category, path: asset.category === "turnaround" ? canonical : asset.path, content_hash: asset.category === "turnaround" ? newHash : asset.content_hash ?? await sha256(path.join(dataDir, "assets", asset.path)) })));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Promoted Principal scribe v3; v2 ${old.id} is superseded.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
