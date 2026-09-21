/** Promotes Dan's approved Peter costume correction (2026-09-21).
 * Regenerated standing reference only: consistent clavi-striped tunic, plain
 * narrow waist strap, shoulder-draped mantle, and four knotted corner tzitzit.
 * Headshot and other poses remain unchanged, with v3 retained as history.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";
const dataDir = getDataDir();
const candidate = path.join(dataDir, "assets", "characters", "candidates", "canon-costume-fixes-2026-09-21", "peter-standing-clavi-tzitzit-shoulder-mantle-r2.png");
const canonical = "characters/peter/motion/motion-neutral-standing-v4.png";
const notes = "Dan-approved 2026-09-21 Mark 3 costume correction. Regenerated standing reference only: preserved the clavi-striped cream tunic, standardized a plain narrow waist strap, redraped the rust mantle over the shoulders rather than the hips, and replaced loose fringe with four small hand-knotted corner tzitzit. Headshot and remaining motion poses are carried forward unchanged.";
const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();
async function main() {
  const db = getDb(); const old = db.prepare("SELECT cv.id,cv.character_id,cv.version_label,cv.voice_provider,cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id=c.id WHERE c.name=? AND cv.status='approved'").get("Peter") as {id:string;character_id:string;version_label:string;voice_provider:string|null;voice_id:string|null}|undefined;
  if (!old || old.version_label !== "v3") throw new Error(`Expected Peter v3, got ${old?.version_label ?? "none"}.`);
  const assets = db.prepare("SELECT category,path,content_hash FROM character_assets WHERE character_version_id=?").all(old.id) as Array<{category:string;path:string;content_hash:string|null}>;
  const destination = path.join(dataDir,"assets",canonical); await mkdir(path.dirname(destination),{recursive:true}); await copyFile(candidate,destination); const newHash=await hash(destination), versionId=randomUUID(), now=Date.now();
  db.exec("BEGIN TRANSACTION"); try { db.prepare("INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,notes,created_at) VALUES (?,?,'v4','approved',?,?,?,?)").run(versionId,old.character_id,old.voice_provider,old.voice_id,notes,now); const insert=db.prepare("INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,created_at) VALUES (?,?,?,?,?,?,?)"); for(const asset of assets){const replace=asset.path.includes("motion-neutral-standing");insert.run(randomUUID(),versionId,asset.category,replace?canonical:asset.path,replace?newHash:asset.content_hash,replace?"Dan-approved generated candidate, 2026-09-21":"Carried forward unchanged from prior approved version",now);} db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(old.id);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  const manifestPath=path.join(dataDir,"assets","characters","import-manifest.json"); const manifest=JSON.parse(await readFile(manifestPath,"utf8")) as {characters:Array<{name:string;version_label:string;version_status:string;notes:string;assets:Array<{category:string;path:string;content_hash:string}>}>}; const entry=manifest.characters.find(x=>x.name==="Peter");if(!entry)throw new Error("Peter missing from manifest.");entry.version_label="v4";entry.version_status="approved";entry.notes=notes;entry.assets=await Promise.all(assets.map(async asset=>({category:asset.category,path:asset.path.includes("motion-neutral-standing")?canonical:asset.path,content_hash:asset.path.includes("motion-neutral-standing")?newHash:asset.content_hash??await hash(path.join(dataDir,"assets",asset.path))})));await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);console.log(`Promoted Peter v4; v3 ${old.id} is superseded.`);
} main().catch(error=>{console.error(error);process.exit(1);});
