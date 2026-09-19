import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";

export type SourceProject = { id?: string; language: string; book: string; chapter: number };
export type SourcePaths = { docxPath: string; audioPath: string; referencePath: string; audioRelPath: string; edition: "non_drama" | "drama"; provenance: "catalog" | "legacy" };

const books = ["matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians", "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james", "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation"];
const display: Record<string, string> = { "1-corinthians": "1 Corinthians", "2-corinthians": "2 Corinthians", "1-thessalonians": "1 Thessalonians", "2-thessalonians": "2 Thessalonians", "1-timothy": "1 Timothy", "2-timothy": "2 Timothy", "1-peter": "1 Peter", "2-peter": "2 Peter", "1-john": "1 John", "2-john": "2 John", "3-john": "3 John" };
const title = (book: string) => display[book] ?? book.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const relativeToAssets = (assets: string, path: string) => path.replace(`${assets}\\`, "").replaceAll("\\", "/");

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
  const assets = join(dataDir, "assets");
  const legacy = join(assets, "source", project.language, `${project.book}-${project.chapter}`);
  const legacyDocx = join(legacy, `${project.book}-${project.chapter}-text.docx`);
  const legacyAudio = join(legacy, `${project.book}-${project.chapter}-fcbh-audio.mp3`);
  const legacyReference = join(assets, "reference", "english", `${project.book}-${project.chapter}`, `${project.book}-${project.chapter}-text.docx`);
  // Preserve old projects' ingestion behavior. Source review still requires
  // referencePath to exist before a low-confidence source can be approved.
  if (existsSync(legacyDocx) && (!requireAudio || existsSync(legacyAudio))) return { docxPath: legacyDocx, audioPath: legacyAudio, referencePath: legacyReference, audioRelPath: relativeToAssets(assets, legacyAudio), edition: "non_drama", provenance: "legacy" };
  if (project.language !== "hatam") throw new Error(`No source catalog is configured for language '${project.language}'.`);
  const index = books.indexOf(project.book);
  if (index < 0 && project.book !== "genesis") throw new Error(`No Hatam FCBH catalog entry exists for ${project.book} ${project.chapter}.`);
  const book = title(project.book), chapter = String(project.chapter);
  const docxPath = join(assets, "source", "hatam", "text", book, `${book} ${chapter}.docx`);
  const referencePath = join(assets, "source", "english-esv", "text", book, `${book} ${chapter}.docx`);
  const fileset = edition === "drama" ? "HADLAIN2DA" : "HADLAIN1DA";
  const editionDir = edition === "drama" ? "Hatam_had_LAI_NT_Drama" : "Hatam_had_LAI_NT_Non-Drama";
  const audioDir = join(assets, "source", "hatam", "audio", editionDir);
  const prefix = index >= 0 ? `B${String(index + 1).padStart(2, "0")}___${chapter.padStart(2, "0")}_` : "no-fcbh-genesis-";
  // The FCBH filename's localized book title varies (Matius, Lukas, Markus,
  // etc.); only the fileset/chapter identifier is catalog authority.
  const audioName = existsSync(audioDir) ? readdirSync(audioDir).find(name => name.startsWith(prefix) && name.endsWith(`______${fileset}.mp3`)) : undefined;
  const audioPath = audioName ? join(audioDir, audioName) : join(audioDir, `${prefix}missing______${fileset}.mp3`);
  const candidates: Array<[string, string]> = [["Hatam text", docxPath], ["English reference", referencePath], ...(requireAudio ? [["Hatam FCBH audio", audioPath] as [string, string]] : [])];
  const missing = candidates.filter(([, path]) => !existsSync(path)).map(([label]) => label);
  if (missing.length) throw new Error(`Source catalog is incomplete for Hatam ${book} ${chapter}: missing ${missing.join(", ")}.`);
  return { docxPath, audioPath, referencePath, audioRelPath: relativeToAssets(assets, audioPath), edition, provenance: "catalog" };
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
