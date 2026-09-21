/**
 * Promotes Dan-approved Philip v4 body references (2026-09-21).
 *
 * Regenerated: standing, walking, teaching, seated.  The approved v3
 * close-up is carried forward unchanged as the identity lock.  These bodies
 * correct the prior bearded/mismatched body identity and retain the costume
 * fixes: four distinct knotted corner tzitzit, shoulder-to-hem tunic clavi,
 * a thin leather girdle, drop-shoulder sleeves, and toe-loop sandals.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const dataDir = getDataDir();
const base = path.join(dataDir, "assets", "characters", "candidates", "canon-costume-fixes-2026-09-21");
const replacements: Record<string, string> = {
  "motion-neutral-standing": "philip-motion-neutral-standing-headshot-identity-costume-r4.png",
  "motion-walking": "philip-motion-walking-headshot-identity-costume-r4.png",
  "motion-teaching": "philip-motion-teaching-headshot-identity-costume-r4.png",
  "motion-seated-listening": "philip-motion-seated-headshot-identity-costume-r4.png",
};
const notes = "Dan-approved 2026-09-21 Philip body-reference repair. The approved clean-shaven, long-curled Papuan v3 close-up remains the identity lock and is carried forward unchanged. Regenerated standing, walking, teaching, and seated body poses to match that identity; addressed costume findings with four separate knotted corner tzitzit, symmetric tunic clavi from shoulder to hem, a thin leather girdle, natural drop-shoulder sleeves, and toe-loop leather sandals.";
const sha256 = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();

async function main() {
  const db = getDb();
  const old = db.prepare("SELECT cv.id, cv.character_id, cv.version_label, cv.voice_provider, cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id=c.id WHERE c.name=? AND cv.status='approved'").get("Philip the Apostle") as { id:string; character_id:string; version_label:string; voice_provider:string|null; voice_id:string|null } | undefined;
  if (!old || old.version_label !== "v3") throw new Error(`Expected approved Philip v3, got ${old?.version_label ?? "none"}`);
  const assets = db.prepare("SELECT category,path,content_hash FROM character_assets WHERE character_version_id=?").all(old.id) as Array<{ category:string; path:string; content_hash:string|null }>;
  const revision = new Map<string, { path:string; hash:string }>();
  for (const [stem, candidate] of Object.entries(replacements)) {
    const asset = assets.find(a => a.path.includes(stem));
    if (!asset) throw new Error(`Missing Philip ${stem} asset in v3`);
    const destination = asset.path.replace(/-v\d+(\.png)$/, "-v4$1");
    const output = path.join(dataDir, "assets", destination);
    await mkdir(path.dirname(output), { recursive:true });
    await copyFile(path.join(base, candidate), output);
    revision.set(asset.path, { path:destination, hash:await sha256(output) });
  }
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,notes,created_at) VALUES (?,?,'v4','approved',?,?,?,?)").run(id,old.character_id,old.voice_provider,old.voice_id,notes,now);
    const insert = db.prepare("INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,created_at) VALUES (?,?,?,?,?,?,?)");
    for (const asset of assets) { const r=revision.get(asset.path); insert.run(randomUUID(),id,asset.category,r?.path ?? asset.path,r?.hash ?? asset.content_hash,r ? "Dan-approved generated candidate, 2026-09-21" : "Carried forward unchanged from approved v3",now); }
    db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(old.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const manifestPath=path.join(dataDir,"assets","characters","import-manifest.json");
  const manifest=JSON.parse(await readFile(manifestPath,"utf8")) as {characters:Array<{name:string;version_label:string;version_status:string;notes:string;assets:Array<{category:string;path:string;content_hash:string}>}>};
  const entry=manifest.characters.find(c=>c.name==="Philip the Apostle"); if(!entry) throw new Error("Manifest missing Philip the Apostle");
  entry.version_label="v4"; entry.version_status="approved"; entry.notes=notes;
  entry.assets=assets.map(a=>{const r=revision.get(a.path);return {category:a.category,path:r?.path ?? a.path,content_hash:r?.hash ?? a.content_hash ?? ""};});
  await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
  console.log(`Promoted Philip v4; superseded v3 ${old.id}.`);
}
main().catch(error=>{console.error(error);process.exit(1)});
