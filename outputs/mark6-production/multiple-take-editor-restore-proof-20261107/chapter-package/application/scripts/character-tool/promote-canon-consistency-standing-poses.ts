/**
 * Promotes Dan's approved 2026-09-21 clean production-standing references.
 *
 * Regenerated: the sole single-pose neutral standing reference for Principal
 * scribe, Crowd witness (young man), Scribe (younger, lean), Crowd witness
 * (man, headwrap), and Scribe (older, stout). Their approved turnaround
 * sheets are retained unchanged as design references only.
 *
 * Run: npx tsx scripts/character-tool/promote-canon-consistency-standing-poses.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const candidateDir = path.join(dataDir, "assets", "characters", "candidates", "canon-consistency-repair-2026-09-21");
const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();

const promotions = [
  { name: "Principal scribe", slug: "principal-scribe", candidate: "principal-scribe-standing-production-r4.png", expected: "v3", next: "v4" },
  { name: "Crowd witness (young man)", slug: "crowd-young-man", candidate: "crowd-young-man-standing-production-r5.png", expected: "v3", next: "v4" },
  { name: "Scribe (younger, lean)", slug: "scribe-younger-lean", candidate: "scribe-younger-lean-standing-production-r4.png", expected: "v3", next: "v4" },
  { name: "Crowd witness (man, headwrap)", slug: "crowd-man-headwrap", candidate: "crowd-man-headwrap-standing-production-r5.png", expected: "v3", next: "v4" },
  { name: "Scribe (older, stout)", slug: "scribe-older-stout", candidate: "scribe-older-stout-standing-production-r5.png", expected: "v3", next: "v4" }
] as const;

async function copyCandidate(source: string, destination: string) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if ((await hash(source)) !== (await hash(destination))) throw new Error(`Refusing to overwrite a different canon asset: ${destination}`);
    return;
  }
  await copyFile(source, destination);
}

async function main() {
  const db = getDb();
  const now = Date.now();
  for (const promotion of promotions) {
    const old = db.prepare(`SELECT cv.id, cv.character_id, cv.version_label, cv.voice_provider, cv.voice_id
      FROM characters c JOIN character_versions cv ON cv.character_id=c.id
      WHERE c.name=? AND cv.status='approved'`).get(promotion.name) as
        { id: string; character_id: string; version_label: string; voice_provider: string | null; voice_id: string | null } | undefined;
    if (!old || old.version_label !== promotion.expected) throw new Error(`${promotion.name}: expected approved ${promotion.expected}, got ${old?.version_label ?? "none"}.`);
    if (db.prepare("SELECT 1 FROM character_versions WHERE character_id=? AND version_label=?").get(old.character_id, promotion.next)) throw new Error(`${promotion.name}: ${promotion.next} already exists.`);
    const assets = db.prepare("SELECT category,path,content_hash FROM character_assets WHERE character_version_id=?").all(old.id) as Array<{ category: string; path: string; content_hash: string | null }>;
    const oldBody = assets.filter(asset => asset.category === "body_pose");
    if (oldBody.length !== 1) throw new Error(`${promotion.name}: expected exactly one production body pose, found ${oldBody.length}.`);

    const source = path.join(candidateDir, promotion.candidate);
    if (!existsSync(source)) throw new Error(`${promotion.name}: missing approved candidate ${source}.`);
    const replacement = `characters/${promotion.slug}/body_pose/motion-neutral-standing-v2.png`;
    const destination = path.join(dataDir, "assets", replacement);
    await copyCandidate(source, destination);
    const replacementHash = await hash(destination);
    const notes = `Dan-approved 2026-09-21 canon-consistency repair. Replaced the sole production neutral-standing body pose with the reviewed clean standing reference; the approved turnaround sheet remains a reference-only design asset and is carried forward unchanged.`;
    const id = randomUUID();

    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare(`INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,notes,created_at)
        VALUES (?,? ,?,'approved',?,?,?,?)`).run(id, old.character_id, promotion.next, old.voice_provider, old.voice_id, notes, now);
      const insert = db.prepare(`INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,created_at)
        VALUES (?,?,?,?,?,?,?)`);
      for (const asset of assets) {
        const replace = asset.category === "body_pose";
        insert.run(randomUUID(), id, asset.category, replace ? replacement : asset.path, replace ? replacementHash : asset.content_hash,
          replace ? `Dan-approved candidate, 2026-09-21: ${promotion.candidate}` : "Carried forward unchanged from approved prior version", now);
      }
      db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(old.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    console.log(`Promoted ${promotion.name} ${promotion.next}; ${old.version_label} superseded.`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
