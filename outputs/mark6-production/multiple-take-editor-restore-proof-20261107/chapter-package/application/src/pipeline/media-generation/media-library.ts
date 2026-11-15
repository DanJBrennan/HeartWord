import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "../creative-direction/crew-context.js";

type LibraryKind = "image" | "video" | "frame";
const kindFor = (path: string): LibraryKind => /\.(mp4|mov|webm)$/i.test(path) ? "video" : "image";
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

export interface StandaloneLibraryAsset {
  assetPath: string;
  title: string;
  location: string;
  tags: string[];
  language: string;
  canonRegion: string;
  provenance: Record<string, unknown>;
}

/** Catalogs an existing immutable still or video; it never copies or approves timeline media. */
export function registerStandaloneLibraryAsset(db: DatabaseSync, dataDir: string, input: StandaloneLibraryAsset) {
  const assetPath = input.assetPath.replaceAll("\\", "/");
  if (!/\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(assetPath)) throw new Error("A supported image or video path is required.");
  if (!input.title?.trim() || !input.location?.trim() || !input.language?.trim() || !input.canonRegion?.trim()) throw new Error("Title, location, language, and canon region are required.");
  if (input.language.trim().toLowerCase() !== "hatam" || input.canonRegion.trim() !== "Papuan") throw new Error("Standalone references currently require the approved Hatam/Papuan production context.");
  if (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== "string" || !tag.trim()) || input.tags.length > 20) throw new Error("Tags must be a short list of nonempty labels.");
  if (!input.provenance || typeof input.provenance !== "object" || Array.isArray(input.provenance)) throw new Error("Production provenance must be an object.");
  const absolute = productionAssetPath(dataDir,assetPath);
  if (!existsSync(absolute)) throw new Error("The original asset file was not found.");
  const existing = db.prepare("SELECT id,provenance_json FROM media_library_items WHERE asset_path=?").get(assetPath) as {id:string;provenance_json:string}|undefined;
  if (existing) {
    const recorded = JSON.parse(existing.provenance_json) as {generation?:{contentHash?:string}};
    if (recorded.generation?.contentHash && recorded.generation.contentHash !== sha256(absolute)) throw new Error("The cataloged original has changed on disk.");
    return { id:existing.id, existing:true };
  }
  const id=randomUUID();
  const provenance = { ...input.provenance, origin:{ language:input.language.trim().toLowerCase(), canonRegion:input.canonRegion.trim(), standalone:true }, generation:{ ...(typeof input.provenance.generation === "object" && input.provenance.generation !== null ? input.provenance.generation : {}), contentHash:sha256(absolute) }, currentOriginCast:[] };
  db.prepare(`INSERT INTO media_library_items (id,kind,asset_path,title,location,tags_json,library_status,provenance_json,created_at)
    VALUES (?,?,?,?,?,?,'reusable_reference',?,?)`).run(id,kindFor(assetPath),assetPath,input.title.trim(),input.location.trim(),JSON.stringify(input.tags.map(tag=>tag.trim())),JSON.stringify(provenance),Date.now());
  return { id, existing:false };
}

/** Idempotently exposes existing, verifiable generated files without moving them. */
export function registerGeneratedMediaLibraryItems(db: DatabaseSync, dataDir: string): number {
  const attempts = db.prepare(`SELECT ga.id,ga.result_asset_path AS path,ga.provider,ga.model,ga.operation,ga.prompt,ga.status,ga.created_at,
      s.id AS shot_id,s.action,s.verse_ref,sc.project_id,p.language,p.book,p.chapter
    FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id JOIN scenes sc ON sc.id=s.scene_id JOIN projects p ON p.id=sc.project_id
    WHERE ga.result_asset_path IS NOT NULL ORDER BY ga.created_at,ga.id`).all() as Array<Record<string, unknown>>;
  const insert = db.prepare(`INSERT OR IGNORE INTO media_library_items (id,generation_attempt_id,project_id,shot_id,kind,asset_path,provenance_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  let added = 0;
  for (const attempt of attempts) {
    const path = String(attempt.path), absolute = productionAssetPath(dataDir, path);
    if (!existsSync(absolute)) continue; // Never invent a retained record for a missing file.
    const characters = db.prepare(`SELECT c.id,c.name,c.region,cv.id AS versionId FROM shot_characters sc JOIN characters c ON c.id=sc.character_id
      JOIN character_versions cv ON cv.character_id=c.id AND cv.status='approved' WHERE sc.shot_id=? ORDER BY c.id,cv.id`).all(String(attempt.shot_id));
    const provenance = { origin: { projectId:attempt.project_id, language:attempt.language, book:attempt.book, chapter:attempt.chapter, shotId:attempt.shot_id, action:attempt.action, verseRef:attempt.verse_ref },
      generation: { attemptId:attempt.id, provider:attempt.provider, model:attempt.model, operation:attempt.operation, prompt:attempt.prompt, reviewStatus:attempt.status, contentHash:sha256(absolute) },
      currentOriginCast:characters, historicalCanonVersions:"unknown — generation_attempts did not record reference versions" };
    const result = insert.run(randomUUID(),String(attempt.id),String(attempt.project_id),String(attempt.shot_id),kindFor(path),path,JSON.stringify(provenance),Number(attempt.created_at));
    added += Number(result.changes);
  }
  return added;
}

export function extractLibraryFrame(db: DatabaseSync, dataDir: string, itemId: string, timeMs: number) {
  const item = db.prepare("SELECT * FROM media_library_items WHERE id=? AND kind='video'").get(itemId) as { id:string; project_id:string|null; shot_id:string|null; asset_path:string; provenance_json:string; title:string|null; location:string|null; tags_json:string|null; library_status:string } | undefined;
  if (!item) throw new Error("A retained video item is required.");
  if (!Number.isInteger(timeMs) || timeMs < 0) throw new Error("Frame time must be a non-negative integer millisecond value.");
  const source = productionAssetPath(dataDir,item.asset_path); if (!existsSync(source)) throw new Error("The retained source video is missing; no frame was created.");
  const id = randomUUID(), path = `generated/media-library/frames/${id}.png`, output = productionAssetPath(dataDir,path); mkdirSync(dirname(output),{recursive:true});
  execFileSync("ffmpeg",["-v","error","-n","-ss",String(timeMs / 1000),"-i",source,"-frames:v","1",output],{stdio:["ignore","ignore","pipe"]});
  const parent = JSON.parse(item.provenance_json) as {generation?:{contentHash?:string}};
  const provenance = { ...parent, generation:{ ...parent.generation, contentHash:sha256(output) }, parentItemId:item.id, parentPath:item.asset_path, parentTimeMs:timeMs, parentContentHash:parent.generation?.contentHash };
  db.prepare(`INSERT INTO media_library_items (id,project_id,shot_id,kind,asset_path,parent_item_id,parent_time_ms,title,location,tags_json,library_status,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,item.project_id,item.shot_id,"frame",path,item.id,timeMs,item.title,item.location,item.tags_json,item.library_status,JSON.stringify(provenance),Date.now());
  return { id, path, parentItemId:item.id, parentTimeMs:timeMs };
}

export function createReuseCandidate(db: DatabaseSync, dataDir: string, itemId: string, targetShotId: string, note: string | null) {
  const item = db.prepare("SELECT * FROM media_library_items WHERE id=?").get(itemId) as { id:string; asset_path:string; provenance_json:string } | undefined;
  const target = db.prepare(`SELECT s.id,sc.project_id,p.language FROM shots s JOIN scenes sc ON sc.id=s.scene_id JOIN projects p ON p.id=sc.project_id WHERE s.id=?`).get(targetShotId) as { id:string; project_id:string; language:string } | undefined;
  if (!item || !target) throw new Error("Library item or target shot was not found.");
  const donor = JSON.parse(item.provenance_json) as { origin?:{ language?:string; canonRegion?:string }, currentOriginCast?:Array<{region?:string}>, generation?:{contentHash?:string} };
  const source = productionAssetPath(dataDir,item.asset_path);
  if (!existsSync(source) || (donor.generation?.contentHash && sha256(source) !== donor.generation.contentHash)) throw new Error("Retained donor file is missing or changed; it cannot be reused.");
  const targetRegions = db.prepare(`SELECT DISTINCT c.region FROM shot_characters sc JOIN characters c ON c.id=sc.character_id JOIN character_versions cv ON cv.character_id=c.id AND cv.status='approved' WHERE sc.shot_id=?`).all(targetShotId) as Array<{ region:string }>;
  const donorRegions = [...new Set((donor.currentOriginCast ?? []).map(c => c.region).filter(Boolean))];
  const donorRegion = donor.origin?.canonRegion ?? donorRegions[0];
  const targetRegion = target.language.toLowerCase() === "hatam" ? "Papuan" : targetRegions[0]?.region;
  if (donor.origin?.language !== target.language || !targetRegion || targetRegions.length > 1 || donorRegions.length > 1 || (donorRegion && donorRegion !== targetRegion)) throw new Error("Reuse candidate requires matching language and compatible approved regional canon context.");
  const existing = db.prepare("SELECT id FROM media_reuse_candidates WHERE library_item_id=? AND target_shot_id=?").get(itemId,targetShotId) as {id:string}|undefined;
  if (existing) return { id:existing.id, existing:true };
  const context = donorRegions.length ? "Historical generation reference versions are unknown; Dottie must verify target canon before use." : "Characterless donor; Vera and Orion must verify target fitness.";
  const id=randomUUID(); db.prepare("INSERT INTO media_reuse_candidates (id,library_item_id,target_shot_id,note,created_at) VALUES (?,?,?,?,?)").run(id,itemId,targetShotId,[note,context].filter(Boolean).join(" "),Date.now());
  return { id, existing:false };
}

/** Producer's scoped set-reference review. It grants no identity, reusable
 * reconstruction, picture selection or release approval. */
export function reviewSetReference(db: DatabaseSync, dataDir: string, projectId: string, shotId: string, candidateId: string,
  decision: "approved_for_generation" | "dismissed", note: string) {
  if (!["approved_for_generation","dismissed"].includes(decision) || !note.trim()) throw new Error("An explicit set-reference decision and review evidence are required.");
  const row=db.prepare(`SELECT r.status,r.library_item_id,m.asset_path,m.provenance_json,m.library_status,m.kind
    FROM media_reuse_candidates r JOIN media_library_items m ON m.id=r.library_item_id
    JOIN shots s ON s.id=r.target_shot_id JOIN scenes sc ON sc.id=s.scene_id
    WHERE r.id=? AND r.target_shot_id=? AND sc.project_id=?`).get(candidateId,shotId,projectId);
  if(!row || row.library_status!=="reusable_reference" || !["image","frame"].includes(String(row.kind)))throw new Error("A retained location-image candidate in this shot/project is required.");
  // Recheck the existing language/canon/file guards even when the candidate
  // was created before a source/canon change.
  createReuseCandidate(db,dataDir,String(row.library_item_id),shotId,note);
  const provenance=JSON.parse(String(row.provenance_json));
  if(provenance.origin?.language!=="hatam" || provenance.origin?.canonRegion!=="Papuan" ||
    provenance.generation?.contentHash!==sha256(productionAssetPath(dataDir,String(row.asset_path))))throw new Error("Set reference lacks matching pinned production provenance.");
  const payload=JSON.stringify({candidateId,shotId,from:row.status,to:decision,note:note.trim(),assetPath:row.asset_path,sha256:provenance.generation.contentHash,scope:"Set-view reference only; no new building canon or geometry approval"});
  const existing=db.prepare("SELECT id,payload FROM edit_commands WHERE project_id=? AND command_type='review_set_reference' AND json_extract(payload,'$.candidateId')=? ORDER BY sequence DESC LIMIT 1").get(projectId,candidateId);
  const previous=existing ? JSON.parse(String(existing.payload)) : undefined;
  if(existing && row.status===decision && previous.note===note.trim() && previous.sha256===provenance.generation.contentHash)return {candidateId,status:decision,editId:String(existing.id)};
  db.exec("BEGIN IMMEDIATE");
  try{
    const id=randomUUID(),now=Date.now();
    const sequence=Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'review_set_reference',?,?,?)").run(id,projectId,sequence,payload,`set-reference:${id}`,now);
    const changed=db.prepare("UPDATE media_reuse_candidates SET status=?,note=? WHERE id=? AND status=?").run(decision,note.trim(),candidateId,String(row.status));
    if(Number(changed.changes)!==1)throw new Error("Set-reference decision changed; refresh the review.");
    db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'human',?,1,?)").run(randomUUID(),projectId,shotId,`Set reference ${candidateId}: ${decision}. ${note.trim()}\n${payload}`,now);
    db.exec("COMMIT");return {candidateId,status:decision,editId:id};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
