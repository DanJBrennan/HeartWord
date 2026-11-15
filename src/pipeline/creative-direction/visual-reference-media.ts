import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {execFileSync} from "node:child_process";
import {join,relative} from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "./crew-context.js";
import type { CrewBrief, ReviewMedia } from "./crew-types.js";
import {referenceGridFilter} from "../media-generation/reference-board-filters.js";
import {sortAssetsByFreshness,isAssetCarriedForward} from "../../characters/asset-freshness.js";
import {sceneReferenceAssetsForVerse} from "../../providers/story-state-assets.js";

const MIME_BY_EXTENSION: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** Bounded samples of already selected coverage, inside Nell's existing call.
 * This never generates a proxy or approves missing/unseen footage. */
export function acceptedCoverageMedia(dataDir: string, brief: CrewBrief): ReviewMedia[] {
  const selected = brief.shots.flatMap(shot => [...new Map([shot.clip, ...shot.availableClips ?? []]
    .flatMap(clip => clip ? [[clip.id, clip] as const] : [])).values()].map(clip => ({ shot, clip }))), media: ReviewMedia[] = [];
  let bytesUsed = 0;
  for (const { shot, clip } of selected) {
    if (media.length >= 3) break;
    const path = productionAssetPath(dataDir, clip.path);
    try {
      const size = statSync(path).size;
      if (bytesUsed + size > 18 * 1024 * 1024 || !/\.mp4$/i.test(path)) continue;
      const bytes = readFileSync(path); bytesUsed += bytes.length;
      media.push({mimeType:"video/mp4",data:bytes.toString("base64"),caption:`Accepted coverage sample: shot ${shot.id}, clip ${clip.id}, SHA256 ${createHash("sha256").update(bytes).digest("hex")}. ${clip.durationMs} ms. At most three selected clips / 18 MiB are sampled from ${selected.length} selections; omitted footage is unobserved. This is not an assembled cut. Provider audio is not the approved source/cast performance; judge picture only.`});
    } catch { /* Missing or inaccessible coverage remains unobserved, not approved. */ }
  }
  return media;
}

/**
 * One captioned reference image per chapter character, for the planning
 * roles whose job is inherently visual (see VISUAL_ROLES in crew.ts) --
 * see docs/plans/CURRENT_GOAL.md, 2026-09-19. Without this, every visual
 * judgment during planning was made from a character's name and free-text
 * canon notes alone, never the actual approved art.
 *
 * Character IDs let the existing task dispatcher select applicable images.
 * The bounded Codex route can package up to four non-Jesus identities in an
 * existing, non-generative letterboxed reference grid. Originals are retained
 * and hashed, Jesus stays separate, and captions identify every panel.
 */
export function canonReferenceMedia(db: DatabaseSync, dataDir: string, brief: CrewBrief,options:{compact?:boolean;includeBody?:boolean}={}): ReviewMedia[] {
  const media: ReviewMedia[] = [];
  const sources:Array<{characterId:string;versionId:string;name:string;view?:string;carriedForward?:boolean;path:string;sha256:string;media:ReviewMedia}>=[];
  for (const character of brief.canon) {
    if(options.includeBody){
      type Asset={path:string;category:string;importedFrom?:string|null;content_hash?:string|null;asset_role?:string;story_state?:string|null;available_from_verse?:string|null;available_through_verse?:string|null};
      let rows:Asset[];
      try{rows=db.prepare(`SELECT path,category,imported_from AS importedFrom,content_hash,asset_role,story_state,available_from_verse,available_through_verse FROM character_assets WHERE character_version_id=?`).all(character.versionId) as Asset[];}
      catch{try{rows=db.prepare('SELECT path,category FROM character_assets WHERE character_version_id=?').all(character.versionId) as Asset[];}catch{continue;}}
      const assets=sortAssetsByFreshness(sceneReferenceAssetsForVerse(rows),{headshot:0,body_pose:1,turnaround:2});
      const identity=assets.find(a=>a.category==='headshot'),body=assets.find(a=>a.category==='body_pose')??assets.find(a=>a.category==='turnaround');
      for(const asset of [identity,body].filter((a):a is Asset=>Boolean(a))){
        const mimeType=MIME_BY_EXTENSION[asset.path.slice(asset.path.lastIndexOf('.')).toLowerCase()];if(!mimeType)continue;
        const path=productionAssetPath(dataDir,asset.path);if(!existsSync(path))continue;
        const bytes=readFileSync(path),sha256=createHash('sha256').update(bytes).digest('hex');
        if(asset.content_hash&&asset.content_hash.toLowerCase()!==sha256)throw Error(`Approved crew reference hash mismatch: ${asset.path}`);
        const view=asset===identity?'IDENTITY HEADSHOT':'BODY / WARDROBE VIEW';
        const reference:ReviewMedia={mimeType,data:bytes.toString('base64'),characterIds:[character.id],caption:`Approved version reference for "${character.name}": ${view}; category ${asset.category}; original SHA256${sha256}. ${isAssetCarriedForward(asset.importedFrom)?'Carried-forward image: approved refinements in current version notes may not be visible here. ':''}Use current approved version notes to resolve reference roles; inspect actual visible details only. A portrait does not establish unseen body construction; neither view alone certifies all costume details.`};
        media.push(reference);sources.push({characterId:character.id,versionId:character.versionId,name:character.name,view,carriedForward:isAssetCarriedForward(asset.importedFrom),path:asset.path,sha256,media:reference});
      }
      continue;
    }
    let asset: { path: string } | undefined;
    try {
      asset = db.prepare(
        `SELECT path FROM character_assets WHERE character_version_id=?
         ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 ELSE 2 END LIMIT 1`
      ).get(character.versionId) as { path: string } | undefined;
    } catch { continue; } // pre-migration or minimal test database
    if (!asset) continue;
    const extension = asset.path.slice(asset.path.lastIndexOf(".")).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) continue;
    try {
      const bytes = readFileSync(productionAssetPath(dataDir, asset.path)),data=bytes.toString("base64");
      const reference={mimeType,data,caption:`Canon reference image for "${character.name}":`,characterIds:[character.id]};
      media.push(reference);sources.push({characterId:character.id,versionId:character.versionId,name:character.name,path:asset.path,sha256:createHash("sha256").update(bytes).digest("hex"),media:reference});
    } catch { /* asset row exists but the file is missing/unreadable -- skip it rather than fail the whole call */ }
  }
  if(!options.compact||(media.length<=16&&media.reduce((n,m)=>n+Buffer.byteLength(m.data,"base64"),0)<=16*1024*1024))return media;
  const groups:typeof sources[]=[];
  for(const source of sources.filter(s=>s.name.trim().toLowerCase()==="jesus"))groups.push([source]);
  const others=sources.filter(s=>s.name.trim().toLowerCase()!=="jesus");
  for(let i=0;i<others.length;i+=4)groups.push(others.slice(i,i+4));
  return groups.map(group=>{
    if(group.length===1)return group[0]!.media;
    const inputs=group.map(({media,...source})=>source),key=createHash("sha256").update(JSON.stringify({layout:"reference-grid-v2",inputs})).digest("hex");
    const directory=join(dataDir,"assets","preparation","crew-reference-boards"),output=join(directory,key+".jpg"),receipt=output+".json";
    mkdirSync(directory,{recursive:true});
    if(!existsSync(output)){
      const paths=group.map(s=>productionAssetPath(dataDir,s.path));
      execFileSync("ffmpeg",["-v","error","-nostdin","-n",...paths.flatMap(path=>["-i",path]),"-filter_complex",referenceGridFilter(paths),"-frames:v","1","-q:v","3",output],{windowsHide:true,stdio:"pipe"});
      if(group.some((s,i)=>createHash("sha256").update(readFileSync(paths[i]!)).digest("hex")!==s.sha256))throw new Error("Canon reference changed during board packaging; reconcile before inference.");
      writeFileSync(receipt,JSON.stringify({layout:"reference-grid-v2",inputs,outputSha256:createHash("sha256").update(readFileSync(output)).digest("hex"),operation:"deterministic_reference_packaging_no_generation",originalsUnchanged:true}),{flag:"wx"});
    }
    const bytes=readFileSync(output),saved=JSON.parse(readFileSync(receipt,"utf8"));
    if(saved.outputSha256!==createHash("sha256").update(bytes).digest("hex")||JSON.stringify(saved.inputs)!==JSON.stringify(inputs))throw new Error("Retained canon reference board/provenance changed.");
    return{mimeType:"image/jpeg",data:bytes.toString("base64"),characterIds:group.map(s=>s.characterId),caption:`Approved canon REFERENCE BOARD, row-major order (left to right, then next row): ${inputs.map((s,i)=>`panel${i+1}: "${s.name}"${s.view?` (${s.view}${s.carriedForward?"; carried forward unchanged":""})`:""} [${s.characterId}], original SHA256${s.sha256}`).join("; ")}. Letterboxed original references, no generated design or added cast. ${options.includeBody?"Identity and body views are labeled separately. Carried-forward art can predate explicitly approved refinements; current version notes retain authority. Do not infer unseen costume construction from portraits. ":""}Judge only what is visible; fine detail in originals is not certified by this review view. Provenance: ${relative(join(dataDir,"assets"),receipt)}.`};
  });
}
