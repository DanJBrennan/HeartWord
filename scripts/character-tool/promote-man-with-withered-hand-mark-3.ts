/**
 * Promotes only Dan's selected Mark 3 Man with Withered Hand candidates.
 * The candidate originals remain intact; state-gated scene references and
 * comparison proofs are copied into a chapter-scoped, approved v1 record.
 * Run: npx tsx scripts/character-tool/promote-man-with-withered-hand-mark-3.ts
 */
import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const slug = "man-with-withered-hand-mark-3";
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", slug);
const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");

type ApprovedAsset = { candidate: string; destination: string; category: string; storyState: "pre_healing" | "healed"; from?: string; through?: string; role: "base_pose" | "story_state_pose" | "comparison_proof" };
const assets: ApprovedAsset[] = [
  { candidate: "man-with-withered-hand-mark-3-motion-neutral-standing-v1.png", destination: "motion/motion-neutral-standing-v1.png", category: "body_pose", storyState: "pre_healing", through: "Mark 3:4", role: "base_pose" },
  { candidate: "man-with-withered-hand-mark-3-motion-walking-v1.png", destination: "motion/motion-walking-v1.png", category: "body_pose", storyState: "pre_healing", through: "Mark 3:4", role: "base_pose" },
  { candidate: "man-with-withered-hand-mark-3-motion-seated-listening-v1.png", destination: "motion/motion-seated-listening-v1.png", category: "body_pose", storyState: "pre_healing", through: "Mark 3:4", role: "base_pose" },
  { candidate: "../man-with-withered-hand-mark-3-hand-comparison-left-v4.png", destination: "reference/left-hand-affected-comparison-v1.png", category: "state_proof", storyState: "pre_healing", through: "Mark 3:4", role: "comparison_proof" },
  { candidate: "man-with-withered-hand-mark-3-motion-hand-stretched-pre-healing-v1.png", destination: "motion/motion-hand-stretched-pre-healing-v1.png", category: "body_pose", storyState: "pre_healing", through: "Mark 3:4", role: "story_state_pose" },
  { candidate: "man-with-withered-hand-mark-3-motion-hand-stretched-healed-v1.png", destination: "motion/motion-hand-stretched-healed-v1.png", category: "body_pose", storyState: "healed", from: "Mark 3:5", role: "story_state_pose" },
  { candidate: "man-with-withered-hand-mark-3-healed-hand-comparison-closeup-v1.png", destination: "reference/left-hand-healed-comparison-v1.png", category: "state_proof", storyState: "healed", from: "Mark 3:5", role: "comparison_proof" }
];

async function copyCandidate(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`Approved candidate is missing: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (await hash(source) !== await hash(destination)) throw new Error(`Refusing to overwrite different existing canon asset: ${destination}`);
    return;
  }
  await copyFile(source, destination);
}

async function main() {
  const db = getDb(), now = Date.now();
  if (db.prepare("SELECT id FROM characters WHERE name=?").get("Man with Withered Hand")) throw new Error("Man with Withered Hand is already registered; review the existing canon instead of creating another version.");
  const copied = await Promise.all(assets.map(async asset => {
    const source = path.resolve(candidateDir, asset.candidate), relative = `characters/${slug}/${asset.destination}`;
    const destination = path.join(dataDir, "assets", relative);
    await copyCandidate(source, destination);
    return { ...asset, source, relative, contentHash: await hash(destination) };
  }));
  const characterId = randomUUID(), versionId = randomUUID();
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("INSERT INTO characters (id,name,scope_kind,scope_book,scope_chapter,canon_status,region,created_at,updated_at) VALUES (?,?, 'chapter','mark',3,'approved','Papuan',?,?)").run(characterId, "Man with Withered Hand", now, now);
    db.prepare("INSERT INTO character_versions (id,character_id,version_label,status,notes,created_at) VALUES (?,?,'v1','approved',?,?)").run(versionId, characterId, "Dan-approved Mark 3 canon. Anatomical LEFT hand is affected in pre-healing references through Mark 3:4; healed references become eligible only at Mark 3:5. Hand-comparison images are proof/reference only, never ordinary scene poses.", now);
    const insert = db.prepare("INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,story_state,available_from_verse,available_through_verse,asset_role,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (const asset of copied) insert.run(randomUUID(), versionId, asset.category, asset.relative, asset.contentHash, path.relative(path.join(dataDir, "assets"), asset.source).replaceAll("\\", "/"), asset.storyState, asset.from ?? null, asset.through ?? null, asset.role, now);
    db.exec("COMMIT");
    console.log(JSON.stringify({ characterId, versionId, assets: copied.map(asset => asset.relative) }, null, 2));
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

main().catch(error => { console.error(error); process.exit(1); });
