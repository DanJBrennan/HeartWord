import type { DatabaseSync } from "node:sqlite";
import { inspectSourceAvailability, sourceFileEvidence, SOURCE_CATALOG_BOOKS, WORKSPACE_BOOKS } from "../pipeline/ingestion/source-catalog.js";
import { readProductionView } from "./production-view.js";

export interface InventoryAttempt { id:string; target:string; operation:string; provider:string; status:string; path:string|null; createdAt:number }
export interface GenerationCount { records:number; available:number; generated:number; reused:number; derived:number; supplied:number; accepted:number; missing:number; retries:number; retryVerdicts:number }
const blank = ():GenerationCount=>({records:0,available:0,generated:0,reused:0,derived:0,supplied:0,accepted:0,missing:0,retries:0,retryVerdicts:0});
const mediaFileMatches=(kind:"keyframes"|"clips"|"lipSync",path:string)=>kind==="keyframes"?/\.(png|jpe?g|webp)$/i.test(path):/\.(mp4|mov|webm|mkv)$/i.test(path);
export function inventoryMediaKind(attempt:InventoryAttempt):"keyframes"|"clips"|"lipSync"|null {
  if(/assemble|^edit_audio$/.test(attempt.operation)) return null;
  if(/lip_sync/.test(attempt.operation)) return "lipSync";
  if(/\.(png|jpe?g|webp)$/i.test(attempt.path??"")) return "keyframes";
  if(/\.(mp4|mov|webm|mkv)$/i.test(attempt.path??"")) return "clips";
  if(/keyframe/.test(attempt.operation) || ["generate","generate_guided","edit_region"].includes(attempt.operation)) return "keyframes";
  if(/^(generate_draft|generate_final|generate_final_video|generate_coverage_base|generate_short_jesus_base|canonical_v34_base|canonical_v34_close_base|v63_scene_world_base)$/.test(attempt.operation)) return "clips";
  return null;
}
/** Retained file counts and explicitly defined repeat-attempt counts, never
 * inferred provider-internal retries or a count of retry verdicts as submissions. */
export function countInventoryMedia(attempts:InventoryAttempt[], available:(path:string)=>boolean) {
  const counts={keyframes:blank(),clips:blank(),lipSync:blank(),unclassified:0,assembled:0};
  const groups=new Map<string,number>(), seen=new Map<string,Set<string>>();
  for(const attempt of attempts) {
    const kind=inventoryMediaKind(attempt);
    if(!kind) { if(/assemble/.test(attempt.operation)) counts.assembled++; else counts.unclassified++; continue; }
    const count=counts[kind]; count.records++;
    if(/^retry_/.test(attempt.status)) count.retryVerdicts++;
    const origin=/canon_guard/.test(attempt.provider)?"guard":/reuse/.test(attempt.provider)?"reused":/local|ffmpeg|extract/.test(attempt.provider)?"derived":/producer_supplied/.test(attempt.provider)?"supplied":"generated";
    if(origin==="generated") {
      const key=`${kind}:${attempt.target}:${attempt.operation}`; groups.set(key,(groups.get(key)??0)+1);
    }
    if(!attempt.path) continue;
    if(!mediaFileMatches(kind,attempt.path)||!available(attempt.path)) { count.missing++; continue; }
    const paths=seen.get(kind)??new Set<string>(); seen.set(kind,paths);
    // Shared/reused files count once per category, even when several shots
    // reference them. Approval remains a distinct count/evidence field.
    const key=attempt.path.replaceAll("\\","/").toLowerCase();
    if(!paths.has(key)) { paths.add(key); count.available++; if(origin!=="guard") count[origin]++; }
  }
  for(const [key,n] of groups) counts[key.split(":")[0] as "keyframes"|"clips"|"lipSync"].retries+=Math.max(0,n-1);
  for(const kind of ["keyframes","clips","lipSync"] as const) counts[kind].accepted=new Set(attempts.filter(a=>inventoryMediaKind(a)===kind&&a.status==="accepted"&&a.path&&mediaFileMatches(kind,a.path)&&available(a.path)).map(a=>a.path!.replaceAll("\\","/").toLowerCase())).size;
  return counts;
}

export function readChapterInventory(db:DatabaseSync,dataDir:string,language="hatam",book="mark",now=Date.now()) {
  if(!/^[a-z0-9-]+$/.test(language)||!/^[a-z0-9-]+$/.test(book)) throw new Error("Use a catalogued language/book identity.");
  const allProjects=db.prepare("SELECT id,language,book,chapter,stage,status,updated_at FROM projects ORDER BY language,book,chapter").all() as unknown as Array<{id:string;language:string;book:string;chapter:number;stage:string;status:string;updated_at:number}>;
  const books=SOURCE_CATALOG_BOOKS.map(item=>({...item,workspaceSupported:Object.hasOwn(WORKSPACE_BOOKS,item.id)}));
  for(const project of allProjects) if(!books.some(item=>item.id===project.book)) books.push({id:project.book,title:project.book,chapters:Math.max(...allProjects.filter(p=>p.book===project.book).map(p=>p.chapter)),workspaceSupported:Object.hasOwn(WORKSPACE_BOOKS,project.book)});
  const selectedBook=books.find(item=>item.id===book); if(!selectedBook) throw new Error("Book is not in the source catalog or saved projects.");
  const fileCache=new Map<string,boolean>();
  const available=(path:string)=> { if(!fileCache.has(path)) fileCache.set(path,sourceFileEvidence(dataDir,path).available); return fileCache.get(path)!; };
  const chapters=Array.from({length:selectedBook.chapters},(_,index)=> {
    const chapter=index+1, project=allProjects.find(item=>item.language===language&&item.book===book&&item.chapter===chapter);
    const inputs=inspectSourceAvailability(db,project??{language,book,chapter},dataDir);
    const source={...inputs,ready:inputs.audio.available&&inputs.text.available,uncertain:!!(inputs.audio.error||inputs.text.error)};
    if(!project) return {chapter,projectId:null,source,state:source.uncertain?"uncertain":"not_started",stage:null,nextAction:source.ready?"Create a chapter workspace to begin the existing source review workflow.":"Supply the missing raw chapter audio/text in the existing source catalog.",lastProgressAt:null,alignment:null,identification:null,canon:null,casting:null,generation:null,error:null};
    const view=readProductionView(db,dataDir,project.id,now);
    const attempts=db.prepare("SELECT ga.id,ga.shot_id AS target,ga.operation,ga.provider,ga.status,ga.result_asset_path AS path,ga.created_at AS createdAt FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY ga.created_at,ga.id").all(project.id) as unknown as InventoryAttempt[];
    const coverage=db.prepare("SELECT a.id,a.coverage_beat_id AS target,'coverage_keyframe' AS operation,a.provider,a.status,a.result_asset_path AS path,a.created_at AS createdAt FROM coverage_keyframe_attempts a JOIN coverage_beats b ON b.id=a.coverage_beat_id JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY a.created_at,a.id").all(project.id) as unknown as InventoryAttempt[];
    const history=[...attempts,...coverage], current=history.filter(item=>!view.cutover||item.createdAt>=view.cutover.started_at);
    const characters=db.prepare(`WITH ids AS (
      SELECT sc.character_id id,1 visual FROM shot_characters sc JOIN shots sh ON sh.id=sc.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=?
      UNION ALL SELECT sh.dialogue_character_id,1 FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND sh.dialogue_character_id IS NOT NULL
      UNION ALL SELECT speaker_character_id,0 FROM audio_segments WHERE project_id=? AND speaker_character_id IS NOT NULL)
      SELECT ids.id,COALESCE(c.name,ids.id) name,c.canon_status,c.region,MAX(ids.visual) visual FROM ids LEFT JOIN characters c ON c.id=ids.id GROUP BY ids.id ORDER BY name`).all(project.id,project.id,project.id) as unknown as Array<{id:string;name:string;canon_status:string|null;region:string|null;visual:number}>;
    const cast=characters.map(character=> {
      const versions=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").all(character.id) as Array<{id:string}>;
      const refs=db.prepare("SELECT ca.path FROM character_assets ca JOIN character_versions cv ON cv.id=ca.character_version_id WHERE cv.character_id=? AND cv.status='approved' AND ca.asset_role!='comparison_proof'").all(character.id) as Array<{path:string}>;
      const availableReferences=refs.filter(ref=>available(ref.path)).length;
      return {...character,approvedVersions:versions.length,availableReferences,ready:character.canon_status==="approved"&&versions.length>0&&availableReferences>0};
    });
    const audio=db.prepare("SELECT layer,COUNT(*) n FROM audio_segments WHERE project_id=? GROUP BY layer").all(project.id) as Array<{layer:string;n:number}>;
    const original=audio.find(item=>item.layer==="original_reading")?.n??0;
    const ingestion=view.stages.find(item=>item.stage==="ingestion")!, casting=view.stages.find(item=>item.stage==="casting")!;
    const review=db.prepare("SELECT reviewer_name,created_at FROM source_alignment_reviews WHERE project_id=? ORDER BY created_at DESC LIMIT 1").get(project.id) as {reviewer_name:string;created_at:number}|undefined;
    const visual=cast.filter(item=>item.visual);
    return {chapter,projectId:project.id,source,state:view.state,stage:view.currentStage,nextAction:view.nextAction,lastProgressAt:view.lastProgressAt,
      alignment:{state:!source.ready||!original?"uncertain":ingestion.state,intervals:original,executionId:ingestion.executionId,summary:ingestion.summary,review:review??null,note:"Recorded execution/review evidence. File availability is not a fresh source/alignment attestation."},
      identification:{count:cast.length,visualCount:visual.length,characters:cast,notes:view.reviews.filter(item=>!item.resolved&&item.subject_type==="project"&&item.note.startsWith("Casting:")).map(item=>item.note)},
      canon:{required:visual.length,ready:visual.filter(item=>item.ready).length,characters:visual},
      casting:{state:casting.state,executionId:casting.executionId,summary:casting.summary,shots:view.shots.length,castSpeechIntervals:audio.find(item=>item.layer==="composite_cast_master")?.n??0},
      generation:{current:countInventoryMedia(current,available),history:countInventoryMedia(history,available),cutover:view.cutover,scopeNote:"Current excludes pre-restart media; all retained history and cumulative film cost remain preserved."},error:null};
  });
  return {observedAt:now,language,book,books,languages:[...new Set(["hatam","meyah","sougb","english",...allProjects.map(item=>item.language)])],chapters,
    note:"Read-only source availability and saved production evidence. No workspace creation, stage execution, source binding, approval, migration or spending occurs on this GET.",
    retryDefinition:"Retries are additional recorded generation attempts for the same target and operation. Retry verdicts, reused/derived/supplied files and new coverage targets are not submitted retries. Historical intent and provider-internal retries may be unreported."};
}
export type ChapterInventory = ReturnType<typeof readChapterInventory>;
