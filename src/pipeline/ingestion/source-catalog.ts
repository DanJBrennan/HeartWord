import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";

export type SourceProject = { id?: string; language: string; book: string; chapter: number };
export type SourcePaths = { docxPath: string; audioPath: string; referencePath: string; audioRelPath: string; edition: "non_drama" | "drama"; provenance: "catalog" | "legacy" };

const books = ["matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians", "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james", "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation"];
const display: Record<string, string> = { "1-corinthians": "1 Corinthians", "2-corinthians": "2 Corinthians", "1-thessalonians": "1 Thessalonians", "2-thessalonians": "2 Thessalonians", "1-timothy": "1 Timothy", "2-timothy": "2 Timothy", "1-peter": "1 Peter", "2-peter": "2 Peter", "1-john": "1 John", "2-john": "2 John", "3-john": "3 John" };
const title = (book: string) => display[book] ?? book.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
// Navigation metadata for the books already understood by this source catalog.
// Listing a corpus book does not enable a new ingestion/casting implementation.
const chapterCounts = [28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
export const SOURCE_CATALOG_BOOKS = [{ id:"genesis", title:"Genesis", chapters:50 }, ...books.map((id,index) => ({id,title:title(id),chapters:chapterCounts[index]!}))];
export const WORKSPACE_BOOKS: Readonly<Record<string,number>> = { mark:16, acts:28, genesis:50 };
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const relativeToAssets = (assets: string, path: string) => path.replace(`${assets}\\`, "").replaceAll("\\", "/");

function sourceCandidates(project: SourceProject, edition: "non_drama" | "drama", dataDir: string, includeCatalog = true): SourcePaths[] {
  const assets = join(dataDir,"assets"), legacy = join(assets,"source",project.language,`${project.book}-${project.chapter}`);
  const candidates: SourcePaths[] = [{docxPath:join(legacy,`${project.book}-${project.chapter}-text.docx`),audioPath:join(legacy,`${project.book}-${project.chapter}-fcbh-audio.mp3`),referencePath:join(assets,"reference","english",`${project.book}-${project.chapter}`,`${project.book}-${project.chapter}-text.docx`),audioRelPath:`source/${project.language}/${project.book}-${project.chapter}/${project.book}-${project.chapter}-fcbh-audio.mp3`,edition:"non_drama",provenance:"legacy"}];
  // The reviewed Meyah corpus has its own published spelling and folder
  // layout. Acts files are retained as source material, but this profile only
  // enables the explicitly approved Mark language-edition workflow.
  if (includeCatalog && project.language === "meyah" && project.book === "mark" && edition === "non_drama") {
    const chapter = String(project.chapter), audioDir = join(assets,"source","meyah","audio","Meyah_mej_TBL_NT_Non-Drama");
    const prefix = `B02___${chapter.padStart(2,"0")}_`;
    const audioName = existsSync(audioDir) ? readdirSync(audioDir).find(name => name.startsWith(prefix) && name.endsWith("MEJTBLN1DA.mp3")) : undefined;
    const audioPath = join(audioDir,audioName ?? `${prefix}missing______MEJTBLN1DA.mp3`);
    candidates.push({docxPath:join(assets,"source","meyah","text","Mark",`Mark ${chapter}.docx`),audioPath,
      referencePath:join(assets,"source","english-esv","text","Mark",`Mark ${chapter}.docx`),
      audioRelPath:relativeToAssets(assets,audioPath),edition,provenance:"catalog"});
    return candidates;
  }
  if (!includeCatalog || project.language !== "hatam") return candidates;
  const index=books.indexOf(project.book); if(index<0 && project.book!=="genesis") return candidates;
  const book=title(project.book), chapter=String(project.chapter), fileset=edition==="drama"?"HADLAIN2DA":"HADLAIN1DA";
  const audioDir=join(assets,"source","hatam","audio",edition==="drama"?"Hatam_had_LAI_NT_Drama":"Hatam_had_LAI_NT_Non-Drama");
  const prefix=index>=0?`B${String(index+1).padStart(2,"0")}___${chapter.padStart(2,"0")}_`:"no-fcbh-genesis-";
  const audioName=existsSync(audioDir)?readdirSync(audioDir).find(name=>name.startsWith(prefix)&&name.endsWith(`______${fileset}.mp3`)):undefined;
  const audioPath=join(audioDir,audioName??`${prefix}missing______${fileset}.mp3`);
  candidates.push({docxPath:join(assets,"source","hatam","text",book,`${book} ${chapter}.docx`),audioPath,referencePath:join(assets,"source","english-esv","text",book,`${book} ${chapter}.docx`),audioRelPath:relativeToAssets(assets,audioPath),edition,provenance:"catalog"});
  return candidates;
}

export function sourceFileEvidence(dataDir: string, assetPath: string) {
  const root=resolve(dataDir,"assets"), absolute=resolve(root,assetPath), local=relative(root,absolute);
  if(isAbsolute(assetPath)||local===".."||local.startsWith(`..${sep}`)||isAbsolute(local)) return {path:assetPath,available:false,error:"Path is outside chapter assets."};
  try {const stat=statSync(absolute);return {path:assetPath,available:stat.isFile()&&stat.size>0,error:null};}
  catch(error) {return {path:assetPath,available:false,error:(error as NodeJS.ErrnoException).code==="ENOENT"?null:"File availability could not be inspected."};}
}

/** File availability only, with no binding, migration, parsing, attestation or
 * fallback from an explicitly bound source. References/stems are not raw audio. */
export function inspectSourceAvailability(db: DatabaseSync, project: SourceProject, dataDir: string) {
  const assets=join(dataDir,"assets");
  const binding=project.id ? db.prepare("SELECT docx_path,audio_path,audio_edition FROM project_source_bindings WHERE project_id=?").get(project.id) as {docx_path:string;audio_path:string;audio_edition:string}|undefined : undefined;
  if(binding) return {selection:"bound",edition:binding.audio_edition,text:sourceFileEvidence(dataDir,binding.docx_path),audio:sourceFileEvidence(dataDir,binding.audio_path)};
  const candidates=sourceCandidates(project,"non_drama",dataDir).map(candidate=>({selection:candidate.provenance,edition:candidate.edition,text:sourceFileEvidence(dataDir,relative(assets,candidate.docxPath)),audio:sourceFileEvidence(dataDir,relative(assets,candidate.audioPath))}));
  // Complete legacy pairs retain ingestion precedence; incomplete pairs never
  // borrow another edition's audio or the English reference to look ready.
  return candidates.find(item=>item.text.available&&item.audio.available) ?? candidates.find(item=>item.selection==="catalog"&&(item.text.available||item.audio.available)) ?? candidates.find(item=>item.text.available||item.audio.available) ?? candidates.at(-1)!;
}

/**
 * Locate immutable corpus inputs. Generated assets and separated stems are
 * deliberately never searched. `dataDir` defaults to the real
 * HEARTWORD_DATA_DIR, but a caller that already takes an explicit data
 * directory for test isolation (e.g. crew-context.ts's loadCrewBrief) can
 * override it so catalog resolution respects that same isolation instead
 * of silently falling back to the real data directory.
 *
 * `requireAudio` (default true) preserves ingestion/casting's existing
 * behavior, where the FCBH audio file is a genuine requirement. A caller
 * that only needs the Hatam text and English reference -- crew-context.ts's
 * loadCrewBrief never aligned against or verified a chapter audio file, it
 * reads audio purely per-segment from audio_segments.source_path -- passes
 * false so a missing/absent audio file doesn't block text resolution or
 * wrongly force catalog provenance when the legacy docx/reference layout is
 * actually what's present.
 */
export function discoverSourcePaths(project: SourceProject, edition: "non_drama" | "drama" = "non_drama", dataDir: string = getDataDir(), requireAudio = true): SourcePaths {
  const legacy=sourceCandidates(project,edition,dataDir,false)[0]!;
  if(existsSync(legacy.docxPath)&&(!requireAudio||existsSync(legacy.audioPath))) return legacy;
  if(project.language!=="hatam" && !(project.language==="meyah" && project.book==="mark" && edition==="non_drama")) throw new Error(`No source catalog is configured for language '${project.language}'.`);
  const catalog=sourceCandidates(project,edition,dataDir)[1];
  if(!catalog) throw new Error(`No source catalog entry exists for ${project.language} ${project.book} ${project.chapter}.`);
  const languageName=project.language==="hatam"?"Hatam":"Meyah";
  const candidates: Array<[string,string]> = [[`${languageName} text`,catalog.docxPath],["English reference",catalog.referencePath],...(requireAudio?[[project.language==="hatam"?"Hatam FCBH audio":"Meyah non-drama audio",catalog.audioPath] as [string,string]]:[])];
  const missing=candidates.filter(([,path])=>!existsSync(path)).map(([name])=>name);
  if(missing.length) throw new Error(`Source catalog is incomplete for ${languageName} ${title(project.book)} ${project.chapter}: missing ${missing.join(", ")}.`);
  return catalog;
}

/**
 * Bind exactly the discovered source bytes on first ingestion; later source
 * edits safely invalidate reuse. `dataDir` overrides the same way as
 * discoverSourcePaths, for a caller with its own test-isolated data
 * directory.
 */
export function resolveAndBindSourcePaths(db: DatabaseSync, project: SourceProject, dataDir: string = getDataDir()): SourcePaths {
  const assets = join(dataDir, "assets");
  let binding: { docx_path: string; audio_path: string; reference_path: string; audio_edition: "non_drama" | "drama"; docx_hash: string; audio_hash: string; reference_hash: string; provenance: "catalog" | "legacy" } | undefined;
  if (project.id) try { binding = db.prepare("SELECT docx_path,audio_path,reference_path,audio_edition,docx_hash,audio_hash,reference_hash,provenance FROM project_source_bindings WHERE project_id=?").get(project.id) as typeof binding; } catch { /* lightweight legacy test DB */ }
  if (binding) {
    const paths = { docxPath: join(assets, binding.docx_path), audioPath: join(assets, binding.audio_path), referencePath: join(assets, binding.reference_path), audioRelPath: binding.audio_path, edition: binding.audio_edition, provenance: binding.provenance } as SourcePaths;
    if (![paths.docxPath, paths.audioPath, paths.referencePath].every(existsSync) || digest(paths.docxPath) !== binding.docx_hash || digest(paths.audioPath) !== binding.audio_hash || digest(paths.referencePath) !== binding.reference_hash) throw new Error("Bound source inputs changed or are unavailable; producer reconciliation is required before dependent work can be reused.");
    return paths;
  }
  const paths = discoverSourcePaths(project, undefined, dataDir);
  if (project.id && existsSync(paths.referencePath)) try { db.prepare("INSERT INTO project_source_bindings (project_id,docx_path,audio_path,reference_path,audio_edition,docx_hash,audio_hash,reference_hash,provenance,bound_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(project.id, relativeToAssets(assets, paths.docxPath), relativeToAssets(assets, paths.audioPath), relativeToAssets(assets, paths.referencePath), paths.edition, digest(paths.docxPath), digest(paths.audioPath), digest(paths.referencePath), paths.provenance, Date.now()); } catch { /* catalog still supports schema-light tests */ }
  return paths;
}
