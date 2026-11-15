/**
 * Promotes Dan's approved distinct headshots for James son of Zebedee, Philip
 * the Apostle, Matthew (Levi), and Thaddaeus (Jude), 2026-09-19. Each gets a
 * new v3 with its approved headshot; the four existing v2 body-pose references
 * are intentionally carried forward unchanged until matching body packages
 * receive their own producer review. Prior versions are superseded, never
 * deleted.
 *
 * Run: npx tsx scripts/character-tool/promote-distinct-disciple-headshots-v3.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const promotions = [
  { name: "James son of Zebedee", slug: "james-son-of-zebedee", candidate: "james-son-of-zebedee-headshot-distinct-v3.png", identity: "a sturdy mid-40s man with a wide square jaw, closely cropped curls, and a compact squared black beard; cream flax with a terracotta-red mantle" },
  { name: "Philip the Apostle", slug: "philip-the-apostle", candidate: "philip-the-apostle-headshot-distinct-v3.png", identity: "a lean late-20s-to-early-30s man with a long oval face, side-swept wavy hair, and no beard; mustard flax with a dark-umber mantle" },
  { name: "Matthew (Levi)", slug: "matthew", candidate: "matthew-headshot-distinct-v3.png", identity: "a fuller late-40s-to-early-50s bald, clean-shaven man with a broad rounded face; stone-gray flax with a deep teal mantle" },
  { name: "Thaddaeus (Jude)", slug: "thaddaeus-jude", candidate: "thaddaeus-jude-headshot-distinct-v3.png", identity: "a slim mid-20s man with an angular face, crisp short coils, and a fine moustache; aubergine flax with a dusty-saffron mantle" }
] as const;
type ManifestAsset = { category: string; path: string; content_hash: string };
type ManifestCharacter = { name: string; version_label: string; version_status: string; notes: string; assets: ManifestAsset[] };
type Manifest = { characters: ManifestCharacter[] };
async function sha256(file: string): Promise<string> { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }

async function main() {
  const db = getDb();
  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const now = Date.now();
  const insertVersion = db.prepare(`INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, 'v3', 'approved', ?, ?, ?, ?)`);
  const insertAsset = db.prepare(`INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, 'Dan-approved generated candidate, 2026-09-19', ?)`);

  for (const promotion of promotions) {
    const old = db.prepare(`SELECT cv.id, cv.character_id, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.name = ?`).get(promotion.name) as { id: string; character_id: string; voice_provider: string | null; voice_id: string | null } | undefined;
    if (!old) throw new Error(`No approved version found for ${promotion.name}.`);
    if (db.prepare(`SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v3'`).get(old.character_id)) throw new Error(`${promotion.name} v3 already exists; refusing to promote twice.`);
    const oldAssets = db.prepare(`SELECT category, path FROM character_assets WHERE character_version_id = ?`).all(old.id) as Array<{ category: string; path: string }>;
    const headshotPath = `characters/${promotion.slug}/lip_sync_closeup/close-up-neutral-v3.png`;
    const destination = path.join(dataDir, "assets", headshotPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(dataDir, "assets", "characters", "candidates", promotion.slug, promotion.candidate), destination);
    const headshotHash = await sha256(destination);
    const notes = `Dan-approved 2026-09-19 distinct headshot revision: ${promotion.identity}. This locks a face/hair/beard/age and color-language distinction from the similar disciples. The headshot is v3; existing motion references are carried forward unchanged from v2 pending a separately reviewed matching body-pose package.`;
    const versionId = randomUUID();
    db.exec("BEGIN TRANSACTION");
    try {
      insertVersion.run(versionId, old.character_id, old.voice_provider, old.voice_id, notes, now);
      for (const asset of oldAssets) {
        const assetPath = asset.category === "headshot" ? headshotPath : asset.path;
        const hash = asset.category === "headshot" ? headshotHash : await sha256(path.join(dataDir, "assets", assetPath));
        insertAsset.run(randomUUID(), versionId, asset.category, assetPath, hash, now);
      }
      db.prepare(`UPDATE character_versions SET status = 'superseded' WHERE id = ?`).run(old.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    const character = manifest.characters.find((entry) => entry.name === promotion.name);
    if (!character) throw new Error(`${promotion.name} is missing from import-manifest.json.`);
    character.version_label = "v3"; character.version_status = "approved"; character.notes = notes;
    character.assets = await Promise.all(oldAssets.map(async (asset) => {
      const assetPath = asset.category === "headshot" ? headshotPath : asset.path;
      return { category: asset.category, path: assetPath, content_hash: asset.category === "headshot" ? headshotHash : await sha256(path.join(dataDir, "assets", assetPath)) };
    }));
    console.log(`Promoted ${promotion.name} v3 (${versionId}); v2 ${old.id} is superseded.`);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
main().catch((error) => { console.error(error); process.exit(1); });
