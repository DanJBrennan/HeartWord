import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { latestCrewRun, requireCurrentPlan, directionsFromRun, validateHandoffPlan } from "../creative-direction/crew-store.js";
import { sortAssetsByFreshness } from "../../characters/asset-freshness.js";

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
    category: string; path: string; sha256: string }>;
}

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
  if (project.language.toLowerCase() !== "hatam" || project.book.toLowerCase() !== "mark" || project.chapter !== 2) {
    throw new Error("The external keyframe handoff currently supports Hatam Mark 2 only.");
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
    const rawAssets = db.prepare(`SELECT category, path, content_hash, imported_from AS importedFrom
      FROM character_assets WHERE character_version_id = ?
      AND category IN ('headshot','body_pose','turnaround','approved_source')`)
      .all(version.id) as Array<{ category: string; path: string; content_hash: string | null; importedFrom: string | null }>;
    // A costume-fix promotion can leave several rows in the same category
    // (e.g. a corrected motion-neutral-standing next to untouched motion-
    // walking/-teaching/-seated poses it never regenerated). Ordering by
    // category alone left the choice between same-category rows to path,
    // which could silently pick an unrelated OLD asset over the one a
    // promotion just fixed -- see asset-freshness.ts.
    const assets = sortAssetsByFreshness(rawAssets, REFERENCE_CATEGORY_RANK);
    // A lip-sync shot can contain silent supporting cast (for example the
    // paralytic while Jesus speaks). Those characters still need their canon
    // reference, but must not block a keyframe because they have no headshot.
    const chosen = shot.needs_lip_sync && assets.some(a => a.category === "headshot")
      ? [assets.find(a => a.category === "headshot"), assets.find(a => a.category === "body_pose")].filter(a => a !== undefined)
      : [assets.find(a => a.category === "body_pose") ?? assets[0]].filter(a => a !== undefined);
    if (!chosen.length) {
      throw new Error(`Missing approved reference assets: ${character.name}`);
    }
    for (const asset of chosen) {
      const hash = sha256(readFileSync(assetPath(dataDir, asset.path)));
      if (asset.content_hash && asset.content_hash.toLowerCase() !== hash) throw new Error(`Reference hash mismatch: ${asset.path}`);
      references.push({ character_id: character.id, name: character.name, version_id: version.id,
        version_label: version.version_label, category: asset.category, path: asset.path, sha256: hash });
    }
  }
  return { project, shot, scene, references };
}

export function prepareKeyframe(db: DatabaseSync, dataDir: string, shotId: string, prompt: string, rationale: string): KeyframeBrief {
  if (!prompt.trim() || !rationale.trim()) throw new Error("Prompt and production rationale are required.");
  if (!/16\s*:\s*9/.test(prompt)) throw new Error("Explicit 16:9 framing is required.");
  const context = getKeyframeContext(db, dataDir, shotId);
  if (latestCrewRun(db, context.project.id, "planning")) {
    prompt += directionsFromRun(requireCurrentPlan(db, dataDir, context.project.id), shotId);
  }
  const sources = [
    { role: "verified Hatam source", path: "source/hatam/mark-2/mark-2-text.docx" },
    { role: "English reference", path: "reference/english/mark-2/mark-2-text.docx" }
  ].map(source => {
    const path = assetPath(dataDir, source.path);
    return { ...source, sha256: sha256(readFileSync(path)), verses: parseSourceTextByVerse(path) };
  });
  const id = randomUUID();
  // Contact sheets only package the original reference pixels side by side.
  // They do not generate, retouch, crop, or redesign any canon artwork.
  const generationInputs: KeyframeBrief["generationInputs"] = [];
  const groupSize = Math.ceil(context.references.length / 5) || 1;
  for (let i = 0; i < context.references.length; i += groupSize) {
    const group = context.references.slice(i, i + groupSize);
    let path = group[0]!.path;
    if (group.length > 1) {
      path = `generated/keyframe-briefs/${id}/references-${i + 1}-${i + group.length}.png`;
      const out = assetPath(dataDir, path);
      mkdirSync(dirname(out), { recursive: true });
      const paths = group.map(r => assetPath(dataDir, r.path));
      execFileSync("ffmpeg", ["-v", "error", "-n", ...paths.flatMap(p => ["-i", p]),
        "-filter_complex", referenceBoardFilter(paths), "-frames:v", "1", out]);
    }
    generationInputs.push({ path, sha256: sha256(readFileSync(assetPath(dataDir, path))),
      referenceNumbers: group.map((_, j) => i + j + 1) });
  }
  return { schemaVersion: 1, id, createdAt: Date.now(), context, productionRunId: latestCrewRun(db, context.project.id, "planning")?.id,
    contextHash: sha256(JSON.stringify(context)), sources, prompt, promptHash: sha256(prompt), rationale, generationInputs };
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

export function acceptKeyframe(db: DatabaseSync, attemptId: string): { attemptId: string; shotId: string } {
  const attempt = db.prepare(`SELECT ga.id, ga.shot_id, ga.status, ga.provider
    FROM generation_attempts ga WHERE ga.id = ?`).get(attemptId) as
    { id: string; shot_id: string; status: string; provider: string } | undefined;
  if (!attempt || attempt.provider !== "codex_imagegen") throw new Error(`Unknown Codex keyframe attempt: ${attemptId}`);
  if (attempt.status !== "hold_for_review" && attempt.status !== "accepted") {
    throw new Error(`Codex keyframe is not awaiting approval: ${attemptId}`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
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
