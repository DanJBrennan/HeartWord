/**
 * Promotes Dan's approved 2026-09-21 Mark 3 costume-fix packages.
 *
 * Jesus v4: replaces all four motion poses with the approved finished-hem,
 * simple-sandal package; keeps the v3 close-up and approved source unchanged.
 * Jesus's shoulder-length hair is deliberately unchanged per Dan's override.
 *
 * Crowd witness (stern man, spokesperson) v3: replaces the sole existing
 * turnaround with the approved standing image and adds the approved walking,
 * teaching, and seated reference poses.  The existing v2 asset did not include
 * a separate close-up, so none is invented or carried forward.
 *
 * Both upgrades preserve their prior version and assets as superseded history.
 * Run with --dry-run to inspect the current approved records without writing.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "canon-costume-fixes-2026-09-21");
const dryRun = process.argv.includes("--dry-run");

type Asset = { category: string; candidate: string; canonical: string };
type Promotion = { name: string; oldLabel: string; newLabel: string; notes: string; assets: Asset[] };
type ManifestCharacter = { name: string; version_label: string; version_status: string; notes: string; assets: Array<{ category: string; path: string; content_hash: string }> };
type Manifest = { characters: ManifestCharacter[] };

const promotions: Promotion[] = [
  {
    name: "Jesus", oldLabel: "v3", newLabel: "v4",
    notes: "Dan-approved 2026-09-21 Mark 3 costume correction. Regenerated all four motion poses: finished woven hems and sleeve cuffs replace raw/frayed edges, and simple first-century low-ankle toe-thong sandals replace ankle-wrapping straps. The v3 lip-sync close-up and approved source are carried forward unchanged. Per Dan's explicit override, Jesus's shoulder-length hair is unchanged.",
    assets: [
      { category: "body_pose", candidate: "jesus-motion-neutral-standing-finished-hems-simple-sandals-r8.png", canonical: "characters/jesus/motion/motion-neutral-standing-v4.png" },
      { category: "body_pose", candidate: "jesus-motion-walking-finished-hems-simple-sandals-r8.png", canonical: "characters/jesus/motion/motion-walking-v4.png" },
      { category: "body_pose", candidate: "jesus-motion-teaching-finished-hems-simple-sandals-r8.png", canonical: "characters/jesus/motion/motion-teaching-v4.png" },
      { category: "body_pose", candidate: "jesus-motion-seated-listening-finished-hems-simple-sandals-r8.png", canonical: "characters/jesus/motion/motion-seated-listening-v4.png" }
    ]
  },
  {
    name: "Crowd witness (stern man, spokesperson)", oldLabel: "v2", newLabel: "v3",
    notes: "Dan-approved 2026-09-21 Mark 3 costume correction. Regenerated standing, walking, teaching, and seated reference poses: two dark-indigo woven clavi and elbow-length drop sleeves on the brown inner tunic, a full beard, and an unbelted pale outer mantle; its belt cinches only the inner tunic. Existing tzitzit were retained. This character has no separate close-up asset, so none is invented.",
    assets: [
      { category: "turnaround", candidate: "crowd-stern-man-motion-neutral-standing-clavi-sleeves-beard-r2.png", canonical: "characters/mark-crowd-stern-man/turnaround/hatam-crowd-stern-man-video-canon-v3-standing.png" },
      { category: "body_pose", candidate: "crowd-stern-man-motion-walking-clavi-sleeves-beard-r2.png", canonical: "characters/mark-crowd-stern-man/body_pose/motion-walking-v3.png" },
      { category: "body_pose", candidate: "crowd-stern-man-motion-teaching-clavi-sleeves-beard-r2.png", canonical: "characters/mark-crowd-stern-man/body_pose/motion-teaching-v3.png" },
      { category: "body_pose", candidate: "crowd-stern-man-motion-seated-listening-clavi-sleeves-beard-r2.png", canonical: "characters/mark-crowd-stern-man/body_pose/motion-seated-listening-v3.png" }
    ]
  }
];

async function sha256(file: string) { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }

async function main() {
  const db = getDb();
  const manifestPath = path.join(dataDir, "assets", "characters", "import-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  for (const promotion of promotions) {
    const old = db.prepare(`SELECT cv.id, cv.character_id, cv.version_label, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id WHERE c.name = ? AND cv.status = 'approved'`).get(promotion.name) as { id: string; character_id: string; version_label: string; voice_provider: string | null; voice_id: string | null } | undefined;
    if (!old) throw new Error(`No approved version for ${promotion.name}.`);
    const oldAssets = db.prepare("SELECT category, path, content_hash FROM character_assets WHERE character_version_id = ?").all(old.id) as Array<{ category: string; path: string; content_hash: string | null }>;
    console.log(`${promotion.name}: ${old.version_label}, ${oldAssets.length} current asset(s)`);
    if (!dryRun && old.version_label !== promotion.oldLabel) throw new Error(`${promotion.name} must be ${promotion.oldLabel}, got ${old.version_label}.`);
    if (dryRun) { console.log(oldAssets); continue; }
    const newAssets = await Promise.all(promotion.assets.map(async (asset) => {
      const destination = path.join(dataDir, "assets", asset.canonical);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(candidateDir, asset.candidate), destination);
      return { ...asset, content_hash: await sha256(destination) };
    }));
    const carried = await Promise.all(oldAssets
      .filter((asset) => promotion.name === "Jesus" && !asset.category.includes("body_pose"))
      .map(async (asset) => ({ ...asset, content_hash: asset.content_hash ?? await sha256(path.join(dataDir, "assets", asset.path)) })));
    const versionId = randomUUID(); const now = Date.now();
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)").run(versionId, old.character_id, promotion.newLabel, old.voice_provider, old.voice_id, promotion.notes, now);
      const insert = db.prepare("INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const asset of carried) insert.run(randomUUID(), versionId, asset.category, asset.path, asset.content_hash, "Carried forward unchanged from prior approved version", now);
      for (const asset of newAssets) insert.run(randomUUID(), versionId, asset.category, asset.canonical, asset.content_hash, "Dan-approved generated candidate, 2026-09-21", now);
      db.prepare("UPDATE character_versions SET status = 'superseded' WHERE id = ?").run(old.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    const entry = manifest.characters.find((character) => character.name === promotion.name);
    if (!entry) throw new Error(`${promotion.name} is missing from import-manifest.json.`);
    entry.version_label = promotion.newLabel; entry.version_status = "approved"; entry.notes = promotion.notes;
    entry.assets = [...carried.map((asset) => ({ category: asset.category, path: asset.path, content_hash: asset.content_hash })), ...newAssets.map((asset) => ({ category: asset.category, path: asset.canonical, content_hash: asset.content_hash }))];
  }
  if (!dryRun) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
main().catch((error) => { console.error(error); process.exit(1); });
