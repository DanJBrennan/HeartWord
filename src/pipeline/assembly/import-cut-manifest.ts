import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { loadCrewBrief } from "../creative-direction/crew-context.js";
import { structuralCutFindings } from "./finishing.js";
import type { AudioPlacement } from "../creative-direction/crew-types.js";

/** Attach producer-supplied timing from an existing editor export, without rendering. */
export function importCutManifest(db: DatabaseSync, dataDir: string, projectId: string, value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("A timing manifest is required.");
  const manifest = value as { renderId: string; renderSha256: string; timeline: Array<{ shotId: string; startMs: number; endMs: number }>; audioMap: AudioPlacement[] };
  const brief = loadCrewBrief(db, dataDir, projectId, "finishing");
  if (manifest.renderId !== brief.render!.id || manifest.renderSha256 !== brief.render!.sha256) throw new Error("Timing must describe the current, unchanged render.");
  if (!Array.isArray(manifest.timeline) || !manifest.timeline.length || manifest.timeline.length > 2000 || !Array.isArray(manifest.audioMap) || manifest.audioMap.some(a => !a || typeof a !== "object") || manifest.timeline.some(t => !t || typeof t !== "object")) throw new Error("Ordered shot and source-audio placements are required.");
  brief.render!.timeline = manifest.timeline; brief.render!.audioMap = manifest.audioMap;
  const issues = structuralCutFindings(brief);
  if (issues.length) throw new Error(issues.join(" "));
  if (db.prepare("SELECT render_id FROM chapter_render_manifests WHERE render_id=?").get(manifest.renderId)) throw new Error("This render already has an immutable timing manifest.");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(manifest.renderId, JSON.stringify(manifest.timeline), JSON.stringify(manifest.audioMap));
    const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'import_cut_timing',?,?,?)")
      .run(randomUUID(), projectId, sequence, JSON.stringify(manifest), `cut-timing:${manifest.renderId}`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
