import type { DatabaseSync } from "node:sqlite";
import type { AudioPlacement } from "../pipeline/creative-direction/crew-types.js";

export interface PreviewInterval { id: string; path: string; startMs: number; endMs: number; sourceStartMs: number; available: boolean; gainDb: number }
export interface PreviewPicture { shotId: string; startMs: number; endMs: number; sourceStartMs: number }
export interface ProgrammePreview {
  renderId: string | null; durationMs: number; timeline: PreviewPicture[];
  source: PreviewInterval[]; performance: PreviewInterval[];
  cues: Array<PreviewInterval & { kind: string; description: string }>;
  issues: string[];
}
interface Audio { id: string; layer: string; source_path: string; start_ms: number; end_ms: number; original_segment_id: string | null }
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
export function joinPreviewIntervals(items: PreviewInterval[]): PreviewInterval[] {
  return items.reduce<PreviewInterval[]>((groups, item) => {
    const last = groups.at(-1);
    if (last && last.path === item.path && last.available === item.available && last.gainDb === item.gainDb && last.endMs === item.startMs && last.sourceStartMs + last.endMs - last.startMs === item.sourceStartMs) last.endMs = item.endMs;
    else groups.push({ ...item });
    return groups;
  }, []);
}
/** Inspection only: never infer a chapter clock from verse labels or rebuild a
 * custom hand edit. The immutable render map remains the timing authority. */
export function readProgrammePreview(db: DatabaseSync, projectId: string,
  render: { id: string; total_duration_ms: number; historical: boolean } | null,
  audio: Audio[], available: (path: string | null) => boolean): ProgrammePreview {
  const preview: ProgrammePreview = { renderId: null, durationMs: 0, timeline: [], source: [], performance: [], cues: [], issues: [] };
  if (!render || render.historical) { preview.issues.push("No current recorded chapter timing map. Accepted reel uses a separate picture-only clock."); return preview; }
  const manifest = db.prepare("SELECT timeline_json,source_audio_json FROM chapter_render_manifests WHERE render_id=?").get(render.id) as { timeline_json: string; source_audio_json: string } | undefined;
  if (!manifest) { preview.issues.push("This recorded cut has no saved timing map. Play its program mix; independent tracks are unavailable."); return preview; }
  try {
    const timeline = JSON.parse(manifest.timeline_json) as PreviewPicture[], placements = JSON.parse(manifest.source_audio_json) as AudioPlacement[];
    if (!Array.isArray(timeline) || !Array.isArray(placements)) throw new Error("Custom legacy recipe is not an executable timeline.");
    if (!finite(render.total_duration_ms) || render.total_duration_ms === 0) throw new Error("Recorded duration is invalid.");
    const shotIds = new Set((db.prepare("SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?").all(projectId) as Array<{ id: string }>).map(item => item.id));
    const validRange = (item: { startMs: number; endMs: number; sourceStartMs: number }) => finite(item.startMs) && finite(item.endMs) && finite(item.sourceStartMs) && item.endMs > item.startMs && item.endMs <= render.total_duration_ms + 50;
    if (timeline.some(item => !shotIds.has(item.shotId) || !validRange(item))) throw new Error("Picture timing is missing, invalid or belongs to another chapter.");
    const ordered = [...timeline].sort((a,b) => a.startMs-b.startMs);
    if (ordered.some((item,i) => i > 0 && item.startMs < ordered[i-1]!.endMs)) throw new Error("Overlapping picture placements require the existing editor.");
    const mapped = [...placements].sort((a,b) => a.startMs-b.startMs);
    if (mapped.some((item,i) => !validRange(item) || !finite(item.sourceEndMs) || Math.abs(item.sourceEndMs-item.sourceStartMs-(item.endMs-item.startMs)) > 50 || (i > 0 && item.startMs < mapped[i-1]!.endMs))) throw new Error("Speech timing is invalid, overlapping or changes source speed.");
    preview.renderId = render.id; preview.durationMs = render.total_duration_ms; preview.timeline = ordered;
    for (const [index, placement] of mapped.entries()) {
      const original = audio.find(item => item.id === placement.segmentId && item.layer === "original_reading");
      if (!original || placement.sourceStartMs < original.start_ms || placement.sourceEndMs > original.end_ms + 50) { preview.issues.push(`Speech placement ${placement.segmentId} lacks its exact source interval; no replacement inferred.`); continue; }
      const source: PreviewInterval = { id: `source:${index}`, path: original.source_path, startMs: placement.startMs, endMs: placement.endMs, sourceStartMs: placement.sourceStartMs, available: available(original.source_path), gainDb: 0 };
      preview.source.push(source);
      if (placement.voice === "cast") {
        const cast = audio.filter(item => item.layer === "composite_cast_master" && item.original_segment_id === original.id && Math.abs((item.end_ms-item.start_ms)-(original.end_ms-original.start_ms)) <= 50);
        if (cast.length !== 1) preview.issues.push(`Saved cast placement ${placement.segmentId} has no unique duration-matched source map. That performance interval is unavailable.`);
        else preview.performance.push({ ...source, id: `cast:${index}`, path: cast[0]!.source_path, sourceStartMs: cast[0]!.start_ms + placement.sourceStartMs-original.start_ms, available: available(cast[0]!.source_path) });
      } else if (placement.voice === "original") preview.performance.push({ ...source, id: `performance:${index}` });
      else preview.issues.push(`Legacy placement ${placement.segmentId} does not record its rendered voice. Select source reading explicitly or play the recorded mix.`);
    }
    preview.source = joinPreviewIntervals(preview.source); preview.performance = joinPreviewIntervals(preview.performance);
    // Only cues from the finishing decision that actually produced this render.
    const command = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='apply_finishing' AND undone=0 AND json_extract(payload,'$.renderId')=? ORDER BY sequence DESC LIMIT 1").get(projectId,render.id) as { payload: string } | undefined;
    if (command) {
      const payload = JSON.parse(command.payload) as { runId: string };
      const run = db.prepare("SELECT result_json FROM production_runs WHERE id=? AND project_id=? AND status='approved'").get(payload.runId,projectId) as { result_json: string } | undefined;
      if (!run) preview.issues.push("Applied finishing decision lacks its approved review. Separate music/effects cannot be reconstructed.");
      else {
        const result = JSON.parse(run.result_json) as { contributions: Record<string,{ audioCues?: Array<{ assetId: string; startMs: number; endMs: number; sourceStartMs: number; gainDb: number }> }> };
        for (const [index,cue] of [...result.contributions.sound_designer?.audioCues ?? [], ...result.contributions.composer?.audioCues ?? []].entries()) {
          const asset = db.prepare("SELECT path,kind,description,duration_ms FROM production_audio_assets WHERE project_id=? AND id=?").get(projectId,cue.assetId) as { path: string; kind: string; description: string; duration_ms: number } | undefined;
          if (!asset || !validRange(cue) || cue.sourceStartMs+cue.endMs-cue.startMs > asset.duration_ms+50 || !Number.isFinite(cue.gainDb) || cue.gainDb > 0 || cue.gainDb < -60) { preview.issues.push(`Cue ${cue.assetId} is unavailable or outside its recorded bounds.`); continue; }
          preview.cues.push({ ...cue, id: `cue:${index}`, path: asset.path, kind: asset.kind, description: asset.description, available: available(asset.path) });
        }
      }
    }
  } catch (error) {
    return { ...preview, renderId: null, durationMs: 0, timeline: [], source: [], performance: [], cues: [], issues: [(error as Error).message + " Preserve and inspect the recorded cut in the existing editor."] };
  }
  return preview;
}
