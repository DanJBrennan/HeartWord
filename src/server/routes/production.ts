import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Router, type Request } from "express";
import { getDataDir, getDb } from "../../db/client.js";
import { runCasting } from "../../pipeline/casting/index.js";
import { recoverInterruptedCrew, runProductionCrew } from "../../pipeline/creative-direction/crew-store.js";
import { digest, loadCrewBrief, productionAssetPath } from "../../pipeline/creative-direction/crew-context.js";
import { applyFinishing, mediaDurationMs, reviewChapter } from "../../pipeline/assembly/finishing.js";
import { runAssembly } from "../../pipeline/assembly/index.js";
import { generateRequestedSoundtrack } from "../../pipeline/assembly/soundtrack.js";
import { importCutManifest } from "../../pipeline/assembly/import-cut-manifest.js";
import { readCutTimingAudit, recordCutTimingAudit } from "../../pipeline/assembly/cut-timing-audit.js";
import { buildProductionMonitor, type NegotiationLogEntry, type ProductionMonitorEvent } from "../production-crew.js";
import { proposeReusableLesson, type LessonScope as SynthesizedLessonScope } from "../../pipeline/creative-direction/lesson-synthesis.js";

export const productionRouter = Router({ mergeParams: true });
const getProjectId = (req: Request): string => req.params.projectId!;
type LessonScope = SynthesizedLessonScope;
const LESSON_SCOPES: readonly LessonScope[] = ["chapter", "book", "language", "region", "global"];
function projectLessonContext(projectId: string) {
  const db = getDb();
  const project = db.prepare("SELECT language, book, chapter FROM projects WHERE id=?").get(projectId) as { language: string; book: string; chapter: number } | undefined;
  if (!project) throw new Error("Project not found.");
  const regions = db.prepare(`SELECT DISTINCT c.region AS region FROM characters c
    JOIN shot_characters sc ON sc.character_id = c.id JOIN shots s ON s.id = sc.shot_id
    JOIN scenes scene ON scene.id = s.scene_id WHERE scene.project_id=? AND c.canon_status='approved' AND c.region IS NOT NULL`).all(projectId) as Array<{ region: string }>;
  if (regions.length !== 1 || !regions[0]?.region) throw new Error("One approved regional canon context is required before reusable guidance can be scoped.");
  const canon = db.prepare(`SELECT DISTINCT c.name AS name, cv.id AS versionId FROM characters c
    JOIN shot_characters sc ON sc.character_id=c.id JOIN shots s ON s.id=sc.shot_id JOIN scenes scene ON scene.id=s.scene_id
    JOIN character_versions cv ON cv.character_id=c.id AND cv.status='approved' WHERE scene.project_id=? ORDER BY c.name,cv.id`).all(projectId) as Array<{ name: string; versionId: string }>;
  return { ...project, region: regions[0].region, canon };
}
function lessonScopeValue(scope: LessonScope, context: ReturnType<typeof projectLessonContext>): string | null {
  if (scope === "book") return context.book;
  if (scope === "language") return context.language;
  if (scope === "region") return context.region;
  return null;
}
productionRouter.use((req, res, next) => {
  if (!getDb().prepare("SELECT id FROM projects WHERE id = ?").get(getProjectId(req))) {
    res.status(404).json({ error: "Project not found." }); return;
  }
  next();
});
productionRouter.get("/", (req, res) => {
  const db = getDb();
  const runs = db.prepare(`SELECT r.id, r.phase, r.status, r.result_json, r.brief_json, r.created_at,
    (SELECT COUNT(*) FROM production_events e WHERE e.run_id = r.id) AS calls
    FROM production_runs r WHERE r.project_id = ? ORDER BY r.created_at DESC, r.rowid DESC LIMIT 20`).all(getProjectId(req));
  const assets = db.prepare("SELECT * FROM production_audio_assets WHERE project_id = ? ORDER BY created_at").all(getProjectId(req));
  const attempts = db.prepare("SELECT id,kind,status,path,error,cost_usd FROM soundtrack_attempts WHERE project_id=? ORDER BY created_at DESC LIMIT 100").all(getProjectId(req));
  const render = db.prepare("SELECT id,result_asset_path AS path FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(getProjectId(req)) ?? null;
  const audit = render ? readCutTimingAudit(db, getProjectId(req), String(render.id)) : null;
  // A recorded observation is labelled as such; actual crew loading also
  // verifies both the film hash and current source hashes before using it.
  res.json({ runs, assets, attempts, render, timingAudit: audit });
});
productionRouter.get("/runs/:runId", (req, res) => {
  const db = getDb();
  const run = db.prepare("SELECT * FROM production_runs WHERE id = ? AND project_id = ?").get(req.params.runId!, getProjectId(req));
  if (!run) { res.status(404).json({ error: "Run not found." }); return; }
  const events = db.prepare("SELECT * FROM production_events WHERE run_id = ? ORDER BY sequence").all(req.params.runId!);
  res.json({ run, events });
});
productionRouter.get("/monitor", (req, res) => {
  const db = getDb(); const projectId = getProjectId(req);
  const currentRun = db.prepare(`SELECT id FROM production_runs WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(projectId) as { id: string } | undefined;
  const crew = db.prepare(`SELECT e.id,e.run_id,e.role,e.round,e.output_json,e.error,e.created_at,r.status AS run_status
    FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? ORDER BY e.created_at DESC,e.sequence DESC LIMIT 100`).all(projectId) as Array<{id:string;run_id:string;role:string;round:number;output_json:string|null;error:string|null;created_at:number;run_status:string}>;
  const negotiations = db.prepare(`SELECT id,narration_span_verse_ref,idea_id,round,role,verdict,content,created_at FROM director_negotiation_log WHERE project_id=? ORDER BY created_at DESC LIMIT 100`).all(projectId) as unknown as NegotiationLogEntry[];
  const events: ProductionMonitorEvent[] = [
    ...crew.map(event => { const output = event.output_json ? JSON.parse(event.output_json) as { summary?: string; findings?: Array<{severity?: string; requestedChange?: string; shotId?: string|null}> } : null; const blocking = output?.findings?.find(f => f.severity === "blocking"); const current = event.run_id === currentRun?.id; return { id:event.id, runId:event.run_id, kind:"crew_event" as const, sender:event.role, round:event.round, current, status:(!current ? "completed" : event.error ? "error" : blocking ? "held" : event.run_status === "running" ? "active" : "completed") as ProductionMonitorEvent["status"], context:blocking?.shotId ?? "chapter", summary:event.error ?? blocking?.requestedChange ?? output?.summary ?? "Recorded role event", createdAt:event.created_at }; }),
    ...negotiations.map(event => ({ id:event.id, kind:"negotiation" as const, sender:event.role, round:event.round, status:(event.verdict === "request_changes" || event.verdict === "forced_final" ? "held" : "completed") as ProductionMonitorEvent["status"], context:event.narration_span_verse_ref, summary:event.content, createdAt:event.created_at }))
  ].sort((a,b) => b.createdAt-a.createdAt);
  res.json(buildProductionMonitor(events));
});
productionRouter.post("/plan", async (req, res) => {
  const projectId = getProjectId(req);
  try {
    const hasShots = getDb().prepare("SELECT s.id FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE sc.project_id = ? LIMIT 1").get(projectId);
    res.json(hasShots ? await runProductionCrew(projectId, "planning", { maxCalls: req.body?.maxCalls ?? 24 }) : await runCasting(projectId));
  } catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/recover/:runId", (req, res) => {
  try { recoverInterruptedCrew(getDb(), getProjectId(req), req.params.runId!); res.json({ summary: "Interrupted review retained and marked incomplete." }); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/review-cut", async (req, res) => {
  try { res.json(await reviewChapter(getProjectId(req), req.body?.maxCalls ?? 16)); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/edit-cut", async (req, res) => {
  try { res.json(await runAssembly(getProjectId(req))); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/cut-timing", (req, res) => {
  try {
    if (req.body?.kind === "observed_cut_timing") {
      const brief = loadCrewBrief(getDb(), getDataDir(), getProjectId(req), "finishing");
      recordCutTimingAudit(getDb(), brief, req.body);
      res.status(201).json({ summary: "Observed timing saved for crew review. Source coverage remains unverified; automatic finishing is held." });
    } else {
      importCutManifest(getDb(), getDataDir(), getProjectId(req), req.body);
      res.status(201).json({ summary: "Existing cut timing imported. The video file was retained." });
    }
  }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
productionRouter.post("/soundtrack/:runId", async (req, res) => {
  try {
    const result = await generateRequestedSoundtrack(getProjectId(req), req.params.runId!);
    res.json({ ...result, summary: `${result.accepted} audio assets passed review.${result.failures.length ? ` ${result.failures.join(" ")}` : " Review the cut again to place the new cues."}` });
  } catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/finish/:runId", (req, res) => {
  try { res.json(applyFinishing(getDb(), getDataDir(), getProjectId(req), req.params.runId!)); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/guidance", async (req, res) => {
  const note = req.body?.note;
  if (typeof note !== "string" || !note.trim() || note.length > 12000) { res.status(400).json({ error: "A production note of 1–12,000 characters is required." }); return; }
  const db = getDb(); const noteId = randomUUID();
  db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
    VALUES (?, ?, 'project', ?, 'human', ?, 1, ?)`).run(noteId, getProjectId(req), getProjectId(req), `Production guidance: ${note.trim()}`, Date.now());
  const lessonId = randomUUID();
  const context = projectLessonContext(getProjectId(req));
  let candidate: { principle: string; rationale: string; scope: LessonScope } | null = null;
  let synthesisError: string | null = null;
  if (req.body?.reusable !== true) {
    try { candidate = await proposeReusableLesson({ correction: note.trim(), ...context }); }
    catch (error) { synthesisError = (error as Error).message; }
  }
  // The proposed lesson is inactive by default. A provider error is recorded
  // as review context; it never triggers an invisible retry or an activation.
  db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,rationale,status,source_note_id,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(lessonId,getProjectId(req),candidate?.scope ?? "chapter",candidate ? lessonScopeValue(candidate.scope,context) : null,getProjectId(req),candidate ? "Model-proposed reusable lesson" : "Producer correction",candidate?.principle ?? note.trim(),candidate?.rationale ?? `Candidate synthesis unavailable: ${synthesisError ?? "not requested"}.`,"candidate",noteId,context.language,context.book,context.chapter,context.region,Date.now(),Date.now());
  if (req.body?.reusable === true) {
    const scope = LESSON_SCOPES.includes(req.body?.scope) ? req.body.scope as LessonScope : "chapter";
    const principle = req.body?.principle;
    if (typeof principle !== "string" || !principle.trim() || principle.trim() === note.trim() || principle.length > 12000) { res.status(400).json({ error:"A distinct, bounded reusable principle is required; it cannot simply copy the raw correction." }); return; }
    const rationale = typeof req.body?.rationale === "string" && req.body.rationale.trim() ? req.body.rationale.trim() : "Explicit producer direction";
    db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,rationale,status,source_note_id,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(),getProjectId(req),scope,lessonScopeValue(scope,context),getProjectId(req),"Producer standing guidance",principle.trim(),rationale,"active",noteId,context.language,context.book,context.chapter,context.region,Date.now(),Date.now());
  }
  res.status(201).json({ ok: true, lessonId, synthesis: candidate ? "candidate_proposed" : "candidate_needs_review" });
});
productionRouter.get("/lessons", (req,res) => {
  const lessons = getDb().prepare("SELECT * FROM production_lessons WHERE project_id=? ORDER BY created_at DESC").all(getProjectId(req));
  const active = (lessons as Array<{ id: string; status: string; scope_kind: string; scope_value: string | null }>).filter(lesson => lesson.status === "active");
  const overlaps = active.flatMap((lesson, index) => active.slice(index + 1).filter(other => other.scope_kind === lesson.scope_kind && other.scope_value === lesson.scope_value).map(other => [lesson.id, other.id]));
  res.json({ lessons, potentialOverlaps: overlaps });
});
productionRouter.patch("/lessons/:id", (req,res) => {
  const db = getDb(); const existing = db.prepare("SELECT * FROM production_lessons WHERE id=? AND project_id=?").get(req.params.id,getProjectId(req)) as { requested_change: string; issue: string } | undefined;
  const principle = req.body?.requestedChange;
  if (!existing) { res.status(404).json({error:"Lesson not found."}); return; }
  if (typeof principle !== "string" || !principle.trim() || principle.length > 12000 || (principle.trim() === existing.requested_change.trim() && existing.issue !== "Model-proposed reusable lesson")) { res.status(400).json({error:"Edit the correction into a distinct reusable principle before activation."}); return; }
  const scope = LESSON_SCOPES.includes(req.body?.scope) ? req.body.scope as LessonScope : "chapter";
  const rationale = typeof req.body?.rationale === "string" && req.body.rationale.trim() ? req.body.rationale.trim() : null;
  const context = projectLessonContext(getProjectId(req));
  db.prepare(`UPDATE production_lessons SET requested_change=?,rationale=?,scope_kind=?,scope_value=?,status='active',source_language=?,source_book=?,source_chapter=?,source_region=?,updated_at=? WHERE id=? AND project_id=?`)
    .run(principle.trim(),rationale,scope,lessonScopeValue(scope,context),context.language,context.book,context.chapter,context.region,Date.now(),req.params.id,getProjectId(req));
  res.json({ok:true});
});
productionRouter.post("/lessons/:id/status", (req,res) => { const status=req.body?.status; if (!["disabled","superseded"].includes(status)) { res.status(400).json({error:"Only disabled or superseded are valid historical states; edit a candidate into a distinct principle before activating it."}); return; } const result=getDb().prepare("UPDATE production_lessons SET status=?,updated_at=? WHERE id=? AND project_id=?").run(status,Date.now(),req.params.id,getProjectId(req)); if (!result.changes) {res.status(404).json({error:"Lesson not found."});return;} res.json({ok:true}); });
productionRouter.post("/audio-assets", (req, res) => {
  const { path, kind, description } = req.body ?? {};
  if (typeof path !== "string" || typeof description !== "string" || !description.trim() || description.length > 2000 || !["music", "sfx"].includes(kind)) {
    res.status(400).json({ error: "An asset path, music/sfx kind, and description are required." }); return;
  }
  try {
    const absolute = productionAssetPath(getDataDir(), path);
    const durationMs = mediaDurationMs(absolute);
    const id = randomUUID();
    getDb().prepare(`INSERT INTO production_audio_assets (id, project_id, kind, description, path, sha256, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, getProjectId(req), kind, description.trim(), path, digest(readFileSync(absolute)), durationMs, Date.now());
    res.status(201).json({ id });
  } catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
