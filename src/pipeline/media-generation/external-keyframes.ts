import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { discoverSourcePaths } from "../ingestion/source-catalog.js";
import { requireCurrentPlan, directionsFromRun, validateHandoffPlan, bindAttemptRevision, validateAttemptRevision, savedProductionRecord, type StoredCrewRun } from "../creative-direction/crew-store.js";
import type { FilmSnapshot } from "../creative-direction/production-record.js";
import { sceneReferenceAssetsForVerse } from "../../providers/story-state-assets.js";
import { getDataDir } from "../../db/client.js";
import { sortAssetsByFreshness } from "../../characters/asset-freshness.js";
import {wardrobeReferenceRole} from "../../characters/wardrobe-refinement.js";

const REFERENCE_CATEGORY_RANK: Record<string, number> = { headshot: 0, body_pose: 1, turnaround: 2 };

// Codex's image tool runs in the assistant session, outside the Node server.
// This handoff uses the existing shot/attempt/review tables, without pretending
// the tool is an API adapter that the unattended server can call.
export interface KeyframeContext {
  project: { id: string; language: string; book: string; chapter: number };
  shot: { id: string; scene_id: string; sequence: number; action: string; verse_ref: string | null;
    framing: string | null; camera_movement: string | null; needs_lip_sync: number;
    crowd_density: string | null; continuity_notes: string | null };
  scene: { id: string; sequence: number; summary: string | null; lighting_continuity: string | null };
  references: Array<{ character_id: string; name: string; version_id: string; version_label: string;
    category: string; path: string; sha256: string; referenceRole?:string; wardrobeFacts?:string }>;
  sceneReferences?: SetReference[];
}

export interface SetReference { path: string; sha256: string; recordRef: string; role: "accepted_scene_view" | "reviewed_set_reference" }
export interface FilmInput { snapshot: FilmSnapshot; sha256: string }
export const BUILTIN_REFERENCE_SLOTS = 5;

export interface KeyframeBrief {
  productionRunId?: string;
  schemaVersion: 1;
  id: string;
  createdAt: number;
  context: KeyframeContext;
  contextHash: string;
  sources: Array<{ role: string; path: string; sha256: string; verses: Array<{ verse: number; text: string }> }>;
  prompt: string;
  promptHash: string;
  rationale: string;
  generationInputs: Array<{ path: string; sha256: string; referenceNumbers: number[] }>;
  filmInput?: FilmInput;
}

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

function imageHeight(path: string): number {
  const bytes = readFileSync(path);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.toString("ascii", 12, 16) === "IHDR") return bytes.readUInt32BE(20);
  // Legacy imports sometimes carry a .png name while their bytes are WebP.
  // ffprobe reads their actual container, avoiding a silent bad contact sheet.
  const output = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", path], { encoding: "utf8" }).trim();
  const height = Number(output);
  if (!Number.isInteger(height) || height <= 0) throw new Error(`Could not read reference height: ${path}`);
  return height;
}

export function referenceBoardFilter(referencePaths: string[]): string {
  if (referencePaths.length < 2) throw new Error("A reference board needs at least two images.");
  const height = Math.min(...referencePaths.map(imageHeight));
  const labels = referencePaths.map((_, index) => `[${index}:v]scale=-2:${height}[r${index}]`).join(";");
  return `${labels};${referencePaths.map((_, index) => `[r${index}]`).join("")}hstack=inputs=${referencePaths.length}`;
}

/** Package pixels without inventing intermediate character designs. Each cell
 * is letterboxed, never cropped; its order is recorded in the prompt. */
export function referenceGridFilter(paths: string[]): string {
  if (paths.length < 2) throw new Error("A reference grid needs at least two images.");
  const size = Math.min(1024, ...paths.map(imageHeight));
  const columns = Math.ceil(Math.sqrt(paths.length));
  return paths.map((_, i) => `[${i}:v]scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[r${i}]`).join(";") +
    `;${paths.map((_, i) => `[r${i}]`).join("")}xstack=inputs=${paths.length}:layout=${paths.map((_, i) => `${i % columns * size}_${Math.floor(i / columns) * size}`).join("|")}:fill=white`;
}

export function referenceGroups(references: KeyframeContext["references"], sets: SetReference[] = []): number[][] {
  const jesus = references.flatMap((r, i) => r.name.trim().toLowerCase() === "jesus" ? [i + 1] : []);
  const cast = [...new Set(references.filter(r => r.name.trim().toLowerCase() !== "jesus").map(r => r.character_id))];
  const groups = jesus.length ? [jesus] : [];
  for (let i = 0; i < cast.length; i += 4) {
    const ids = new Set(cast.slice(i, i + 4));
    groups.push(references.flatMap((r, j) => ids.has(r.character_id) ? [j + 1] : []));
  }
  if (sets.length) groups.push(sets.map((_, i) => references.length + i + 1));
  if (groups.length > BUILTIN_REFERENCE_SLOTS) throw new Error("Reference packet exceeds five slots. Review the shot's visible cast/coverage; do not omit identities or merge Jesus with other characters silently.");
  return groups;
}

/** Existing accepted scene views are continuity evidence, not building canon.
 * Explicit library set refs need the existing target-shot approval as well. */
export function keyframeSetReferences(db: DatabaseSync, dataDir: string, shotId: string): SetReference[] {
  const target = db.prepare("SELECT scene_id,sequence,action FROM shots WHERE id=?").get(shotId);
  // materializeGapIdea appends supplementary shots to the scene roster. Their
  // saved editorial anchor supplies the story position; the appended sequence
  // can follow an entirely different location (for example shore vs bedroom).
  const anchorId = String(target?.action ?? "").match(/(?:^|\n)Editorial anchor:\s*([a-zA-Z0-9_-]{1,80})\./)?.[1];
  let beforeSequence = Number(target?.sequence ?? Number.MAX_SAFE_INTEGER);
  if (anchorId) {
    const anchor = db.prepare("SELECT scene_id,sequence FROM shots WHERE id=?").get(anchorId);
    if (!anchor || anchor.scene_id !== target?.scene_id || Number(anchor.sequence) >= beforeSequence) {
      throw new Error("Supplementary keyframe needs a valid earlier editorial anchor in the same scene.");
    }
    // Include the accepted anchor view itself, then the preceding scene view.
    beforeSequence = Number(anchor.sequence) + 1;
  }
  const rows = db.prepare(`SELECT ga.id,earlier.id AS shot_id,ga.result_asset_path AS path FROM generation_attempts ga
    JOIN shots earlier ON earlier.id=ga.shot_id JOIN shots target ON target.scene_id=earlier.scene_id
    WHERE target.id=? AND earlier.sequence<? AND ga.operation='generate' AND ga.status='accepted'
      AND ga.result_asset_path IS NOT NULL ORDER BY earlier.sequence DESC,ga.created_at DESC,ga.id DESC`).all(shotId,beforeSequence);
  const refs: SetReference[] = [];
  const paths = new Set<string>();
  const views = new Set<string>();
  for (const row of rows) {
    const path = String(row.path),view=String(row.shot_id);
    if (paths.has(path) || views.has(view)) continue; paths.add(path);views.add(view);
    refs.push({ path, sha256: sha256(readFileSync(assetPath(dataDir, path))), recordRef:`generation_attempts:${row.id}`, role:"accepted_scene_view" });
    if (refs.length === 2) break;
  }
  const library = db.prepare(`SELECT m.id,m.asset_path AS path,m.provenance_json FROM media_reuse_candidates r
    JOIN media_library_items m ON m.id=r.library_item_id WHERE r.target_shot_id=? AND r.status='approved_for_generation'
    AND m.library_status='reusable_reference' AND m.kind IN ('image','frame') ORDER BY m.id`).all(shotId);
  for (const row of library) {
    const path = String(row.path), provenance = JSON.parse(String(row.provenance_json));
    if (provenance.origin?.language !== "hatam" || provenance.origin?.canonRegion !== "Papuan") throw new Error("Set reference has incompatible language/regional provenance.");
    const hash = sha256(readFileSync(assetPath(dataDir,path)));
    if (provenance.generation?.contentHash !== hash) throw new Error("Set reference hash mismatch.");
    if (!paths.has(path)) { paths.add(path); refs.push({path,sha256:hash,recordRef:`media_library_items:${row.id}`,role:"reviewed_set_reference"}); }
  }
  return refs;
}

export function prepareReferencePacket(dataDir: string, id: string, references: KeyframeContext["references"], sets: SetReference[] = []) {
  const groups = referenceGroups(references, sets);
  const all = [...references, ...sets];
  const inputs: KeyframeBrief["generationInputs"] = [];
  const legend: string[] = [];
  for (const [i, numbers] of groups.entries()) {
    const group = numbers.map(n => all[n - 1]!);
    let path = group[0]!.path;
    if (group.length > 1) {
      path = `generated/keyframe-briefs/${id}/reference-slot-${i + 1}.png`;
      const out = assetPath(dataDir, path); mkdirSync(dirname(out), {recursive:true});
      const paths = group.map(r => assetPath(dataDir,r.path));
      execFileSync("ffmpeg",["-v","error","-n",...paths.flatMap(p=>["-i",p]),"-filter_complex",referenceGridFilter(paths),"-frames:v","1",out],{windowsHide:true});
    }
    inputs.push({path,sha256:sha256(readFileSync(assetPath(dataDir,path))),referenceNumbers:numbers});
    legend.push(`Image ${i + 1}, cells in row-major order: ` + numbers.map(n => {
      const r = all[n - 1]!;
      return "character_id" in r ? `${r.name} (${r.version_label}, ${r.category}, reference ${n}${r.referenceRole?`, role ${r.referenceRole}`:""})${r.wardrobeFacts?` WARDROBE FACTS: ${r.wardrobeFacts}`:""}` : `SET ONLY (${r.role}, ${r.recordRef}, reference ${n})`;
    }).join("; "));
  }
  return {inputs, direction:"\nREFERENCE INPUT MAP:\n" + legend.join("\n") + "\nThese are references, never a collage to reproduce. Preserve each named identity/wardrobe; identity_only constrains face/hair/build, never its older clothing. wardrobe constrains the versioned garment, construction and drape; individual views are one person, not extra cast. Set images constrain architecture only, not people, pose or camera. An accepted scene view does not approve hidden geometry or create building canon. No reference labels or board borders in the output.\n"};
}

export function keyframeFilmInput(run: StoredCrewRun, shotId: string): FilmInput | undefined {
  const record = savedProductionRecord(run);
  if (!record) return undefined; // Historical runs acquire no invented FDL.
  if (record.status !== "accepted") throw new Error("Keyframe requires accepted FDL.");
  const snapshot = record.snapshots.find(s => s.shots.some(shot => shot.id === shotId));
  if (!snapshot) throw new Error("Keyframe shot is outside the saved FDL.");
  return {snapshot:structuredClone(snapshot),sha256:sha256(JSON.stringify(snapshot))};
}

export function keyframeFilmDirection(input: FilmInput | undefined): string {
  if (!input) return "";
  const snapshot = input.snapshot;
  const extension = snapshot.extensions.bibleRegional;
  return "\nPINNED FDL WORLD / BIBLE-REGIONAL CONTEXT (" + input.sha256 + "):\n" +
    snapshot.world.flatMap(entity => Object.entries(entity.facts).map(([name,f]) =>
      `${entity.id}.${name}: ${f.status === "approved" ? f.value : `${f.status}; ${f.reason}`} [${f.owner}]`)).join("\n") +
    "\nSource, regional identity, historical setting and grounding (existing record refs are evidence, not new approvals):\n" +
    JSON.stringify(extension) + "\nUnknown/open facts stay unresolved; do not infer hidden architecture or source timing.\n";
}

export function validateKeyframeFilm(run: StoredCrewRun, shotId: string, input?: FilmInput): void {
  if (JSON.stringify(keyframeFilmInput(run,shotId)) !== JSON.stringify(input)) throw new Error("Keyframe FDL changed after preparation.");
}

export function validateReferenceFiles(dataDir:string,brief:Pick<KeyframeBrief,"prompt"|"promptHash"|"contextHash"|"sources"|"generationInputs"> & {context:unknown}):void {
  if(sha256(brief.prompt)!==brief.promptHash || sha256(JSON.stringify(brief.context))!==brief.contextHash)throw new Error("Brief changed after preparation.");
  for(const source of brief.sources)if(sha256(readFileSync(assetPath(dataDir,source.path)))!==source.sha256)throw new Error("Scripture source changed after preparation.");
  for(const input of brief.generationInputs)if(sha256(readFileSync(assetPath(dataDir,input.path)))!==input.sha256)throw new Error("Generation input changed after preparation.");
}

export function assetPath(dataDir: string, path: string): string {
  const root = resolve(dataDir, "assets");
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error("Asset path must stay within the asset directory.");
  }
  return absolute;
}

export function getKeyframeContext(db: DatabaseSync, dataDir: string, shotId: string): KeyframeContext {
  const shot = db.prepare(`SELECT id, scene_id, sequence, action, verse_ref, framing, camera_movement,
    needs_lip_sync, crowd_density, continuity_notes FROM shots WHERE id = ?`).get(shotId) as KeyframeContext["shot"] | undefined;
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const scene = db.prepare(`SELECT id, sequence, summary, lighting_continuity FROM scenes WHERE id = ?`)
    .get(shot.scene_id) as KeyframeContext["scene"];
  const project = db.prepare(`SELECT p.id, p.language, p.book, p.chapter FROM projects p
    JOIN scenes sc ON sc.project_id = p.id WHERE sc.id = ?`).get(scene.id) as KeyframeContext["project"];
  // This bridge is deliberately scoped to the active production, not an implicit
  // approval of other books, languages or regional canons.
  if (project.language.toLowerCase() !== "hatam" || project.book.toLowerCase() !== "mark" || ![2, 4, 5].includes(project.chapter)) {
    throw new Error("The external keyframe handoff currently supports Hatam Mark 2 and the producer-approved Mark 4 and 5 plans only.");
  }
  const cast = db.prepare(`SELECT c.id, c.name, c.region, c.canon_status FROM shot_characters sh
    JOIN characters c ON c.id = sh.character_id WHERE sh.shot_id = ? ORDER BY c.id`).all(shotId) as
    Array<{ id: string; name: string; region: string; canon_status: string }>;
  const references: KeyframeContext["references"] = [];
  for (const character of cast) {
    if (character.region !== "Papuan") throw new Error(`Wrong regional canon: ${character.name}`);
    if (character.canon_status !== "approved") throw new Error(`Character is not approved: ${character.name}`);
    const versions = db.prepare(`SELECT id, version_label FROM character_versions
      WHERE character_id = ? AND status = 'approved'`).all(character.id) as Array<{ id: string; version_label: string }>;
    if (versions.length !== 1) throw new Error(`Need exactly one approved version: ${character.name}`);
    const version = versions[0]!;
    const rawAssets = db.prepare(`SELECT category, path, content_hash, imported_from AS importedFrom,
      story_state, available_from_verse, available_through_verse, asset_role
      FROM character_assets WHERE character_version_id = ?
      AND category IN ('headshot','body_pose','turnaround','approved_source')`)
      .all(version.id) as Array<{ category: string; path: string; content_hash: string | null; importedFrom: string | null }>;
    // A costume-fix promotion can leave several rows in the same category
    // (e.g. a corrected motion-neutral-standing next to untouched motion-
    // walking/-teaching/-seated poses it never regenerated). Ordering by
    // category alone left the choice between same-category rows to path,
    // which could silently pick an unrelated OLD asset over the one a
    // promotion just fixed -- see asset-freshness.ts.
    const assets = sortAssetsByFreshness(sceneReferenceAssetsForVerse(rawAssets, shot.verse_ref ?? undefined), REFERENCE_CATEGORY_RANK);
    // A lip-sync shot can contain silent supporting cast (for example the
    // paralytic while Jesus speaks). Those characters still need their canon
    // reference, but must not block a keyframe because they have no headshot.
    const refined=wardrobeReferenceRole(db,version.id,"body_pose")==="wardrobe";
    const chosen = (shot.needs_lip_sync||refined) && assets.some(a => a.category === "headshot")
      ? [assets.find(a => a.category === "headshot"), assets.find(a => a.category === "body_pose")].filter(a => a !== undefined)
      : [assets.find(a => a.category === "body_pose") ?? assets[0]].filter(a => a !== undefined);
    if (!chosen.length) {
      throw new Error(`Missing approved reference assets: ${character.name}`);
    }
    for (const asset of chosen) {
      const hash = sha256(readFileSync(assetPath(dataDir, asset.path)));
      if (asset.content_hash && asset.content_hash.toLowerCase() !== hash) throw new Error(`Reference hash mismatch: ${asset.path}`);
      const role=wardrobeReferenceRole(db,version.id,asset.category);
      const facts=refined?db.prepare("SELECT locked_visual_facts FROM character_versions WHERE id=?").get(version.id)?.locked_visual_facts:null;
      references.push({ character_id: character.id, name: character.name, version_id: version.id,
        version_label: version.version_label, category: asset.category, path: asset.path, sha256: hash,
        ...(refined?{referenceRole:role,...(role==="wardrobe"&&facts?{wardrobeFacts:String(facts)}:{})}:{}) });
    }
  }
  const sceneReferences = keyframeSetReferences(db,dataDir,shotId);
  return { project, shot, scene, references, ...(sceneReferences.length ? {sceneReferences} : {}) };
}

export function prepareKeyframe(db: DatabaseSync, dataDir: string, shotId: string, prompt: string, rationale: string): KeyframeBrief {
  if (!prompt.trim() || !rationale.trim()) throw new Error("Prompt and production rationale are required.");
  if (!/16\s*:\s*9/.test(prompt)) throw new Error("Explicit 16:9 framing is required.");
  const context = getKeyframeContext(db, dataDir, shotId);
  const plan = requireCurrentPlan(db, dataDir, context.project.id);
  prompt += directionsFromRun(plan, shotId);
  const filmInput = keyframeFilmInput(plan,shotId);
  prompt += keyframeFilmDirection(filmInput);
  const sourcePaths = discoverSourcePaths(context.project, undefined, dataDir, false);
  const sources = [
    { role: "verified Hatam source", path: relative(join(dataDir, "assets"), sourcePaths.docxPath).replace(/\\/g, "/") },
    { role: "English reference", path: relative(join(dataDir, "assets"), sourcePaths.referencePath).replace(/\\/g, "/") }
  ].map(source => {
    const path = assetPath(dataDir, source.path);
    return { ...source, sha256: sha256(readFileSync(path)), verses: parseSourceTextByVerse(path) };
  });
  const id = randomUUID();
  const packet = prepareReferencePacket(dataDir,id,context.references,context.sceneReferences);
  prompt += packet.direction;
  if (context.shot.needs_lip_sync) prompt += "\nPrefer a scene-context head-and-shoulders performance image with unobstructed face/mouth, especially Jesus facing or near the camera. A reasonable side angle/distance remains allowed when the accepted shot requires it; do not change approved blocking for this preference.\n";
  return { schemaVersion: 1, id, createdAt: Date.now(), context, productionRunId: plan.id,
    contextHash: sha256(JSON.stringify(context)), sources, prompt, promptHash: sha256(prompt), rationale, generationInputs:packet.inputs, ...(filmInput ? {filmInput} : {}) };
}

export function readLandscapePng(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("Expected a PNG image.");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  // Some tool outputs round an otherwise 16:9 frame to a whole pixel (e.g.
  // 1672x941). Preserve that original; exact delivery sizing belongs to export.
  if (width < 1024 || height < 576 || Math.abs(height - width * 9 / 16) > 1) {
    throw new Error(`Expected 16:9 within one pixel, at least 1024x576; got ${width}x${height}.`);
  }
  return { width, height };
}

export function importKeyframe(db: DatabaseSync, dataDir: string, brief: KeyframeBrief, imagePath: string,
  review: string): { attemptId: string; imagePath: string; provenancePath: string } {
  if (brief.schemaVersion !== 1 || !review.trim()) throw new Error("A v1 brief and visual review are required.");
  if (sha256(brief.prompt) !== brief.promptHash || sha256(JSON.stringify(brief.context)) !== brief.contextHash) {
    throw new Error("Brief changed after preparation. Prepare a new brief.");
  }
  const current = getKeyframeContext(db, dataDir, brief.context.shot.id);
  validateHandoffPlan(db, dataDir, current.project.id, brief.productionRunId);
  validateKeyframeFilm(requireCurrentPlan(db,dataDir,current.project.id),current.shot.id,brief.filmInput);
  if (sha256(JSON.stringify(current)) !== brief.contextHash) throw new Error("Shot/canon changed after preparation. Prepare a new brief.");
  for (const source of brief.sources) {
    if (sha256(readFileSync(assetPath(dataDir, source.path))) !== source.sha256) throw new Error("Scripture source changed after preparation.");
  }
  for (const input of brief.generationInputs) {
    if (sha256(readFileSync(assetPath(dataDir, input.path))) !== input.sha256) throw new Error("Generation input changed after preparation.");
  }
  const bytes = readFileSync(imagePath);
  const dimensions = readLandscapePng(bytes);
  const resultHash = sha256(bytes);
  // The brief id is also the attempt id, so importing the same call is idempotent.
  const existing = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE id = ?`).get(brief.id) as
    { result_asset_path: string } | undefined;
  if (existing) {
    const saved = assetPath(dataDir, existing.result_asset_path);
    if (sha256(readFileSync(saved)) !== resultHash) throw new Error("This brief already has a different image; prepare a new brief for each generation.");
    return { attemptId: brief.id, imagePath: saved, provenancePath: saved.replace(/\.png$/, ".json") };
  }
  const resultPath = `generated/keyframes/codex/${current.shot.id}/${brief.id}.png`;
  const saved = assetPath(dataDir, resultPath);
  const provenancePath = saved.replace(/\.png$/, ".json");
  mkdirSync(dirname(saved), { recursive: true });
  copyFileSync(imagePath, saved, constants.COPYFILE_EXCL);
  const billing = "Built-in Codex image tool: underlying model and per-call billing not reported. cost_usd=0 is a schema compatibility placeholder, not a claim of free generation. No cost ledger entry was invented.";
  writeFileSync(provenancePath, JSON.stringify({ ...brief, provider: "codex_imagegen", model: "not_reported",
    resultPath, resultHash, dimensions, billing, review, status: "hold_for_review" }, null, 2), { flag: "wx" });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts
      (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
      VALUES (?, ?, 'codex_imagegen', 'not_reported', 'generate', ?, ?, 'hold_for_review', ?, 0, ?)`)
      .run(brief.id, current.shot.id, `${dimensions.width}x${dimensions.height}`, brief.prompt, resultPath, Date.now());
    const plan=requireCurrentPlan(db,dataDir,current.project.id);
    bindAttemptRevision(db,current.project.id,brief.id,{runId:plan.id,briefHash:plan.brief_hash});
    db.prepare(`UPDATE shots SET status = 'keyframe_generated' WHERE id = ?`).run(current.shot.id);
    db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`)
      .run(randomUUID(), current.project.id, current.shot.id,
        `Codex keyframe candidate ${brief.id}\n${review}\n\n${billing}\nProvenance: ${resultPath.replace(/\.png$/, ".json")}\nPending producer review; no video generated.`, Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { attemptId: brief.id, imagePath: saved, provenancePath };
}

export function acceptKeyframe(db: DatabaseSync, attemptId: string, dataDir=getDataDir()): { attemptId: string; shotId: string } {
  const attempt = db.prepare(`SELECT ga.id, ga.shot_id, ga.status, ga.provider, ga.result_asset_path
    FROM generation_attempts ga WHERE ga.id = ?`).get(attemptId) as
    { id: string; shot_id: string; status: string; provider: string; result_asset_path:string } | undefined;
  if (!attempt || attempt.provider !== "codex_imagegen") throw new Error(`Unknown Codex keyframe attempt: ${attemptId}`);
  if (attempt.status !== "hold_for_review" && attempt.status !== "accepted") {
    throw new Error(`Codex keyframe is not awaiting approval: ${attemptId}`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    if(attempt.status!=="accepted"){
      const project=db.prepare("SELECT sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?").get(attempt.shot_id)!;
      validateAttemptRevision(db,dataDir,String(project.project_id),attemptId);
      const image=assetPath(dataDir,attempt.result_asset_path);
      const saved=JSON.parse(readFileSync(image.replace(/\.png$/,".json"),"utf8")) as KeyframeBrief & {resultHash:string};
      validateReferenceFiles(dataDir,saved);
      if(saved.id!==attempt.id || sha256(readFileSync(image))!==saved.resultHash)throw new Error("Candidate image/provenance changed before acceptance.");
      const current=getKeyframeContext(db,dataDir,attempt.shot_id);
      if(sha256(JSON.stringify(current))!==saved.contextHash)throw new Error("Keyframe reference context changed before acceptance.");
      validateKeyframeFilm(requireCurrentPlan(db,dataDir,current.project.id),attempt.shot_id,saved.filmInput);
    }
    db.prepare(`UPDATE generation_attempts SET status='accepted' WHERE id=?`).run(attempt.id);
    db.prepare(`UPDATE shots SET status='keyframe_approved' WHERE id=?`).run(attempt.shot_id);
    db.prepare(`UPDATE review_notes SET resolved=1 WHERE subject_type='shot' AND subject_id=?
      AND source='qc' AND note LIKE ?`).run(attempt.shot_id, `%Codex keyframe candidate ${attempt.id}%`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { attemptId: attempt.id, shotId: attempt.shot_id };
}

export function recordProducerOverride(db: DatabaseSync, attemptId: string, note: string): { attemptId: string; shotId: string } {
  if (!note.trim()) throw new Error("A producer override explanation is required.");
  const attempt = db.prepare(`SELECT ga.id, ga.shot_id, sc.project_id
    FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id JOIN scenes sc ON sc.id=s.scene_id
    WHERE ga.id=? AND ga.provider='codex_imagegen'`).get(attemptId) as
    { id: string; shot_id: string; project_id: string } | undefined;
  if (!attempt) throw new Error(`Unknown Codex keyframe attempt: ${attemptId}`);
  db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
    VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`)
    .run(randomUUID(), attempt.project_id, attempt.shot_id, `Producer override for Codex keyframe ${attempt.id}\n${note.trim()}`, Date.now());
  return { attemptId: attempt.id, shotId: attempt.shot_id };
}

export function keyframeStatus(db: DatabaseSync, projectId: string): unknown[] {
  return db.prepare(`SELECT sc.sequence AS scene, s.sequence AS shot, s.id AS shot_id, s.verse_ref,
    ga.id AS attempt_id, ga.provider, ga.status, ga.result_asset_path,
    (SELECT COUNT(*) FROM generation_attempts a WHERE a.shot_id=s.id AND a.operation='generate') AS attempts,
    (SELECT COUNT(*) FROM review_notes rn WHERE rn.subject_id=s.id AND rn.resolved=0) AS unresolved_notes
    FROM shots s JOIN scenes sc ON sc.id=s.scene_id
    LEFT JOIN generation_attempts ga ON ga.id=(SELECT a.id FROM generation_attempts a
      WHERE a.shot_id=s.id AND a.operation='generate' ORDER BY a.created_at DESC, a.id DESC LIMIT 1)
    WHERE sc.project_id=? ORDER BY sc.sequence,s.sequence`).all(projectId);
}
