/**
 * Promotes Dan's approved 2026-09-21 Man with Withered Hand state package.
 *
 * Regenerated: both pre-healing and healed neutral-standing, seated-listening,
 * and walking poses; plus the explicit hand-stretched pre-healing and healed
 * references. The pre-healing references remain eligible only through Mark
 * 3:4; healed references begin at Mark 3:5. Existing close comparison proofs
 * are carried forward only as state-proof assets, never ordinary references.
 *
 * Run: npx tsx scripts/character-tool/promote-man-with-withered-hand-state-package-v3.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "canon-consistency-repair-2026-09-21");
const canonicalRoot = "characters/man-with-withered-hand-mark-3";
const sha256 = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();

type State = "pre_healing" | "healed";
type Candidate = {
  source: string;
  destination: string;
  state: State;
  role: "base_pose" | "story_state_pose";
};

const candidates: Candidate[] = [
  { source: "man-with-withered-hand-neutral-standing-pre-healing-r1.png", destination: "motion/motion-neutral-standing-pre-healing-v1.png", state: "pre_healing", role: "base_pose" },
  { source: "man-with-withered-hand-neutral-standing-healed-r1.png", destination: "motion/motion-neutral-standing-healed-v1.png", state: "healed", role: "base_pose" },
  { source: "man-with-withered-hand-seated-listening-pre-healing-r1.png", destination: "motion/motion-seated-listening-pre-healing-v1.png", state: "pre_healing", role: "base_pose" },
  { source: "man-with-withered-hand-seated-listening-healed-r1.png", destination: "motion/motion-seated-listening-healed-v1.png", state: "healed", role: "base_pose" },
  { source: "man-with-withered-hand-walking-pre-healing-r1.png", destination: "motion/motion-walking-pre-healing-v1.png", state: "pre_healing", role: "base_pose" },
  { source: "man-with-withered-hand-walking-healed-r1.png", destination: "motion/motion-walking-healed-v1.png", state: "healed", role: "base_pose" },
  { source: "man-with-withered-hand-pre-healing-costume-r4.png", destination: "motion/motion-hand-stretched-pre-healing-v2.png", state: "pre_healing", role: "story_state_pose" },
  { source: "man-with-withered-hand-healed-costume-r7-tassels.png", destination: "motion/motion-hand-stretched-healed-v2.png", state: "healed", role: "story_state_pose" }
];

async function copyNonDestructively(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`Approved candidate is missing: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if ((await sha256(source)) !== (await sha256(destination))) throw new Error(`Refusing to overwrite a different canon asset: ${destination}`);
    return;
  }
  await copyFile(source, destination);
}

async function main() {
  const db = getDb();
  const old = db.prepare(`SELECT cv.id, cv.character_id, cv.version_label, cv.voice_provider, cv.voice_id
    FROM characters c JOIN character_versions cv ON cv.character_id = c.id
    WHERE c.name = ? AND cv.status = 'approved'`).get("Man with Withered Hand") as
      { id: string; character_id: string; version_label: string; voice_provider: string | null; voice_id: string | null } | undefined;
  if (!old || old.version_label !== "v2") throw new Error(`Expected approved Man with Withered Hand v2; got ${old?.version_label ?? "none"}.`);
  if (db.prepare("SELECT 1 FROM character_versions WHERE character_id = ? AND version_label = 'v3'").get(old.character_id)) {
    throw new Error("Man with Withered Hand v3 already exists; refusing to promote twice.");
  }

  const proofAssets = db.prepare(`SELECT category, path, content_hash FROM character_assets
    WHERE character_version_id = ? AND category = 'state_proof'`).all(old.id) as Array<{ category: string; path: string; content_hash: string | null }>;
  if (proofAssets.length !== 2) throw new Error(`Expected two state-proof assets, found ${proofAssets.length}.`);

  const copied = await Promise.all(candidates.map(async candidate => {
    const source = path.join(candidateDir, candidate.source);
    const relative = `${canonicalRoot}/${candidate.destination}`;
    const destination = path.join(dataDir, "assets", relative);
    await copyNonDestructively(source, destination);
    return { ...candidate, relative, hash: await sha256(destination) };
  }));

  const notes = "Dan-approved 2026-09-21 full Man with Withered Hand state package. All ordinary body poses now have separate pre-healing and healed references: neutral standing, seated listening, walking, and hand-stretched. The anatomical left hand is visibly contracted through Mark 3:4 and restored beginning Mark 3:5. The approved costume/identity corrections are propagated across those poses. Existing close hand-comparison images are retained only as state proofs.";
  const id = randomUUID();
  const now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`INSERT INTO character_versions (id, character_id, version_label, status, voice_provider, voice_id, notes, created_at)
      VALUES (?, ?, 'v3', 'approved', ?, ?, ?, ?)`).run(id, old.character_id, old.voice_provider, old.voice_id, notes, now);
    const insert = db.prepare(`INSERT INTO character_assets
      (id, character_version_id, category, path, content_hash, imported_from, story_state, available_from_verse, available_through_verse, asset_role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const asset of copied) {
      insert.run(randomUUID(), id, "body_pose", asset.relative, asset.hash, `Dan-approved candidate, 2026-09-21: ${asset.source}`,
        asset.state, asset.state === "healed" ? "Mark 3:5" : null, asset.state === "pre_healing" ? "Mark 3:4" : null, asset.role, now);
    }
    for (const proof of proofAssets) {
      const healed = /healed/i.test(proof.path);
      insert.run(randomUUID(), id, proof.category, proof.path, proof.content_hash, "Carried forward as comparison proof from approved v2",
        healed ? "healed" : "pre_healing", healed ? "Mark 3:5" : null, healed ? null : "Mark 3:4", "comparison_proof", now);
    }
    db.prepare("UPDATE character_versions SET status = 'superseded' WHERE id = ?").run(old.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(`Promoted Man with Withered Hand v3; v2 ${old.id} superseded; ${copied.length} body poses and ${proofAssets.length} state proofs recorded.`);
}

main().catch(error => { console.error(error); process.exit(1); });
