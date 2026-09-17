import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "../creative-direction/crew-context.js";

type LibraryKind = "image" | "video" | "frame";
const kindFor = (path: string): LibraryKind => /\.(mp4|mov|webm)$/i.test(path) ? "video" : "image";
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

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
  const item = db.prepare("SELECT * FROM media_library_items WHERE id=? AND kind='video'").get(itemId) as { id:string; project_id:string; shot_id:string; asset_path:string; provenance_json:string } | undefined;
  if (!item) throw new Error("A retained video item is required.");
  if (!Number.isInteger(timeMs) || timeMs < 0) throw new Error("Frame time must be a non-negative integer millisecond value.");
  const source = productionAssetPath(dataDir,item.asset_path); if (!existsSync(source)) throw new Error("The retained source video is missing; no frame was created.");
  const id = randomUUID(), path = `generated/media-library/frames/${id}.png`, output = productionAssetPath(dataDir,path); mkdirSync(dirname(output),{recursive:true});
  execFileSync("ffmpeg",["-v","error","-n","-ss",String(timeMs / 1000),"-i",source,"-frames:v","1",output],{stdio:["ignore","ignore","pipe"]});
  const provenance = { ...JSON.parse(item.provenance_json) as object, parentItemId:item.id, parentPath:item.asset_path, parentTimeMs:timeMs, contentHash:sha256(output) };
  db.prepare(`INSERT INTO media_library_items (id,project_id,shot_id,kind,asset_path,parent_item_id,parent_time_ms,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id,item.project_id,item.shot_id,"frame",path,item.id,timeMs,JSON.stringify(provenance),Date.now());
  return { id, path, parentItemId:item.id, parentTimeMs:timeMs };
}

export function createReuseCandidate(db: DatabaseSync, dataDir: string, itemId: string, targetShotId: string, note: string | null) {
  const item = db.prepare("SELECT * FROM media_library_items WHERE id=?").get(itemId) as { id:string; asset_path:string; provenance_json:string } | undefined;
  const target = db.prepare(`SELECT s.id,sc.project_id,p.language FROM shots s JOIN scenes sc ON sc.id=s.scene_id JOIN projects p ON p.id=sc.project_id WHERE s.id=?`).get(targetShotId) as { id:string; project_id:string; language:string } | undefined;
  if (!item || !target) throw new Error("Library item or target shot was not found.");
  const donor = JSON.parse(item.provenance_json) as { origin?:{ language?:string }, currentOriginCast?:Array<{region?:string}>, generation?:{contentHash?:string} };
  const source = productionAssetPath(dataDir,item.asset_path);
  if (!existsSync(source) || (donor.generation?.contentHash && sha256(source) !== donor.generation.contentHash)) throw new Error("Retained donor file is missing or changed; it cannot be reused.");
  const targetRegions = db.prepare(`SELECT DISTINCT c.region FROM shot_characters sc JOIN characters c ON c.id=sc.character_id JOIN character_versions cv ON cv.character_id=c.id AND cv.status='approved' WHERE sc.shot_id=?`).all(targetShotId) as Array<{ region:string }>;
  const donorRegions = [...new Set((donor.currentOriginCast ?? []).map(c => c.region).filter(Boolean))];
  if (donor.origin?.language !== target.language || targetRegions.length > 1 || donorRegions.length > 1 || (donorRegions.length === 1 && targetRegions.length === 1 && donorRegions[0] !== targetRegions[0]!.region)) throw new Error("Reuse candidate requires matching language and compatible approved regional canon context.");
  const existing = db.prepare("SELECT id FROM media_reuse_candidates WHERE library_item_id=? AND target_shot_id=?").get(itemId,targetShotId) as {id:string}|undefined;
  if (existing) return { id:existing.id, existing:true };
  const context = donorRegions.length ? "Historical generation reference versions are unknown; Dottie must verify target canon before use." : "Characterless donor; Vera and Orion must verify target fitness.";
  const id=randomUUID(); db.prepare("INSERT INTO media_reuse_candidates (id,library_item_id,target_shot_id,note,created_at) VALUES (?,?,?,?,?)").run(id,itemId,targetShotId,[note,context].filter(Boolean).join(" "),Date.now());
  return { id, existing:false };
}
