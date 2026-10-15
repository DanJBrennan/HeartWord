import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Router, type Request } from "express";
import { getDataDir, getDb } from "../../db/client.js";
import { runCasting } from "../../pipeline/casting/index.js";
import { recoverInterruptedCrew, runProductionCrew, latestCrewRun, productionRecordForRun } from "../../pipeline/creative-direction/crew-store.js";
import { digest, loadCrewBrief, productionAssetPath } from "../../pipeline/creative-direction/crew-context.js";
import { applyFinishing, mediaDurationMs, reviewChapter } from "../../pipeline/assembly/finishing.js";
import { runAssembly } from "../../pipeline/assembly/index.js";
import { generateRequestedSoundtrack } from "../../pipeline/assembly/soundtrack.js";
import { importCutManifest } from "../../pipeline/assembly/import-cut-manifest.js";
import { readCutTimingAudit, recordCutTimingAudit } from "../../pipeline/assembly/cut-timing-audit.js";
import { buildProductionMonitor, type NegotiationLogEntry, type ProductionMonitorEvent } from "../production-crew.js";
import { proposeReusableLesson, type LessonScope as SynthesizedLessonScope } from "../../pipeline/creative-direction/lesson-synthesis.js";
import { exportChapterPackage, inspectChapterPackage } from "../../pipeline/assembly/chapter-package.js";
import { backupStatus } from "../../pipeline/assembly/disaster-backup.js";
import { join } from "node:path";

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
  res.json({ runs, assets, attempts, render, timingAudit: audit, backup: backupStatus(getDataDir()), productionRecord:productionRecordForRun(db,latestCrewRun(db,getProjectId(req),"planning"))??null });
});
productionRouter.get("/preservation", (req, res) => {
  try { res.json(inspectChapterPackage(getDb(), getDataDir(), getProjectId(req)).manifest); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); }
});
productionRouter.post("/preservation", (req, res) => {
  try {
    const path = join(getDataDir(), "chapter-packages", randomUUID());
    const manifest = exportChapterPackage(getDb(), getDataDir(), getProjectId(req), path);
    res.json({ path, manifest, summary: `Chapter preserved at ${path}. ${manifest.editability.length ? `${manifest.editability.length} historical editability gaps are listed in the manifest.` : "Assets and production records verified."}` });
  } catch (error) { res.status(409).json({ error: (error as Error).message }); }
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
    ...(db.prepare("SELECT j.* FROM video_generation_jobs j WHERE j.project_id=? ORDER BY j.updated_at DESC LIMIT 100").all(projectId) as Array<{id:string;shot_id:string;backend:string;status:ProductionMonitorEvent["status"];progress_json:string|null;metadata_json:string|null;updated_at:number}>).map((job, index, jobs) => {
      const progress = job.progress_json ? JSON.parse(job.progress_json) as NonNullable<ProductionMonitorEvent["progress"]> : undefined;
      const metadata = job.metadata_json ? JSON.parse(job.metadata_json) as {error?:string} : undefined;
      const details = progress ? `${progress.phase}${progress.percentage === null ? "" : ` ${progress.percentage}%`}${progress.currentStep === null ? "" : `; step ${progress.currentStep}/${progress.totalSteps ?? "?"}`}` : job.status;
      return {id:job.id,kind:"video_generation" as const,sender:"media_generator",round:0,status:job.status,current:jobs.findIndex(j => j.shot_id === job.shot_id) === index,context:job.shot_id,summary:`${job.backend}: ${metadata?.error ?? details}`,createdAt:job.updated_at,progress};
    }),
    ...crew.map(event => { const output = event.output_json ? JSON.parse(event.output_json) as { summary?: string; findings?: Array<{severity?: string; requestedChange?: string; shotId?: string|null}> } : null; const blocking = output?.findings?.find(f => f.severity === "blocking"); const current = event.run_id === currentRun?.id; const resolved = event.run_status === "approved" || event.run_status === "awaiting_assets"; return { id:event.id, runId:event.run_id, kind:"crew_event" as const, sender:event.role, round:event.round, current, status:(!current || resolved ? "completed" : event.error ? "error" : blocking ? "held" : event.run_status === "running" ? "active" : "completed") as ProductionMonitorEvent["status"], context:blocking?.shotId ?? "chapter", summary:event.error ?? blocking?.requestedChange ?? output?.summary ?? "Recorded role event", createdAt:event.created_at }; }),
    ...negotiations.map(event => { const latest = negotiations.find(other => other.idea_id === event.idea_id); const current = latest?.id === event.id; return { id:event.id, kind:"negotiation" as const, sender:event.role, round:event.round, current, status:(current && (event.verdict === "request_changes" || event.verdict === "forced_final") ? "held" : "completed") as ProductionMonitorEvent["status"], context:event.narration_span_verse_ref, summary:event.content, createdAt:event.created_at }; })
  ].sort((a,b) => b.createdAt-a.createdAt);
  res.json(buildProductionMonitor(events));
});
productionRouter.post("/plan", async (req, res) => {
  const projectId = getProjectId(req);
  try {
    const hasShots = getDb().prepare("SELECT s.id FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE sc.project_id = ? LIMIT 1").get(projectId);
    res.json(hasShots ? await runProductionCrew(projectId, "planning", { maxCalls: req.body?.maxCalls ?? 30 }) : await runCasting(projectId));
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
  const projectId = getProjectId(req);
  const reusable = req.body?.reusable === true;
  const explicitScope = LESSON_SCOPES.includes(req.body?.scope) ? req.body.scope as LessonScope : "chapter";
  const explicitPrinciple = req.body?.principle;
  if (reusable && (typeof explicitPrinciple !== "string" || !explicitPrinciple.trim() || explicitPrinciple.trim() === note.trim() || explicitPrinciple.length > 12000)) { res.status(400).json({ error:"A distinct, bounded reusable principle is required; it cannot simply copy the raw correction." }); return; }
  let context: ReturnType<typeof projectLessonContext>;
  try { context = projectLessonContext(projectId); }
  catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  let candidate: { principle: string; rationale: string; scope: LessonScope } | null = null;
  let synthesisError: string | null = null;
  if (!reusable) {
    try { candidate = await proposeReusableLesson({ correction: note.trim(), ...context }); }
    catch (error) { synthesisError = (error as Error).message; }
  }
  const db = getDb(); const noteId = randomUUID(); const lessonId = randomUUID(); const now = Date.now();
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES (?, ?, 'project', ?, 'human', ?, 1, ?)`).run(noteId, projectId, projectId, `Production guidance: ${note.trim()}`, now);
    db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,rationale,status,source_note_id,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(lessonId,projectId,candidate?.scope ?? "chapter",candidate ? lessonScopeValue(candidate.scope,context) : null,projectId,candidate ? "Model-proposed reusable lesson" : "Producer correction",candidate?.principle ?? note.trim(),candidate?.rationale ?? `Candidate synthesis unavailable: ${synthesisError ?? "not requested"}.`,"candidate",noteId,context.language,context.book,context.chapter,context.region,now,now);
    db.prepare("INSERT INTO production_lesson_events (id,lesson_id,action,detail,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),lessonId,"candidate_created",candidate ? "Model-proposed candidate; producer review required." : `Synthesis unavailable: ${synthesisError ?? "not requested"}.`,now);
    if (reusable) {
      const rationale = typeof req.body?.rationale === "string" && req.body.rationale.trim() ? req.body.rationale.trim() : "Explicit producer direction";
      const activeId = randomUUID();
      db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,rationale,status,source_note_id,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(activeId,projectId,explicitScope,lessonScopeValue(explicitScope,context),projectId,"Producer standing guidance",explicitPrinciple.trim(),rationale,"active",noteId,context.language,context.book,context.chapter,context.region,now,now);
      db.prepare("INSERT INTO production_lesson_events (id,lesson_id,action,detail,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),activeId,"activated","Explicit producer principle.",now);
    }
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} res.status(500).json({ error: (error as Error).message }); return; }
  res.status(201).json({ ok: true, lessonId, synthesis: candidate ? "candidate_proposed" : "candidate_needs_review" });
});
productionRouter.get("/lessons", (req,res) => {
  const projectId = getProjectId(req); const db = getDb();
  let context: ReturnType<typeof projectLessonContext>;
  try { context = projectLessonContext(projectId); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const lessons = db.prepare("SELECT * FROM production_lessons WHERE project_id=? ORDER BY created_at DESC").all(projectId);
  const applicableLessons = db.prepare(`SELECT * FROM production_lessons WHERE status='active' AND (
    (scope_kind='chapter' AND project_id=?) OR
    (scope_kind='shot' AND project_id=? AND subject_id IN (SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?)) OR
    (scope_kind='scene' AND project_id=? AND subject_id IN (SELECT id FROM scenes WHERE project_id=?)) OR
    (scope_kind='book' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?) AND lower(source_region)=lower(?)) OR
    (scope_kind='language' AND lower(scope_value)=lower(?) AND lower(source_region)=lower(?)) OR
    (scope_kind='region' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?)) OR scope_kind='global') ORDER BY created_at,id`)
    .all(projectId,projectId,projectId,projectId,projectId,context.book,context.language,context.region,context.language,context.region,context.region,context.language);
  const ids = [...(lessons as Array<{id:string}>), ...(applicableLessons as Array<{id:string}>).filter(item => !(lessons as Array<{id:string}>).some(local => local.id === item.id))].map(item => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const history = ids.length ? db.prepare(`SELECT * FROM production_lesson_events WHERE lesson_id IN (${placeholders}) ORDER BY created_at,id`).all(...ids) : [];
  res.json({ lessons, applicableLessons, history });
});
productionRouter.patch("/lessons/:id", (req,res) => {
  const projectId = getProjectId(req); const db = getDb(); const existing = db.prepare("SELECT * FROM production_lessons WHERE id=? AND project_id=?").get(req.params.id,projectId) as { id:string; project_id:string; subject_id:string|null; issue:string; requested_change: string; source_note_id:string|null } | undefined;
  const principle = req.body?.requestedChange;
  if (!existing) { res.status(404).json({error:"Lesson not found."}); return; }
  if (typeof principle !== "string" || !principle.trim() || principle.length > 12000 || (principle.trim() === existing.requested_change.trim() && existing.issue !== "Model-proposed reusable lesson")) { res.status(400).json({error:"Edit the correction into a distinct reusable principle before activation."}); return; }
  const scope = LESSON_SCOPES.includes(req.body?.scope) ? req.body.scope as LessonScope : "chapter";
  const rationale = typeof req.body?.rationale === "string" && req.body.rationale.trim() ? req.body.rationale.trim() : null;
  let context: ReturnType<typeof projectLessonContext>;
  try { context = projectLessonContext(projectId); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const replacementId = randomUUID(); const now = Date.now();
  try { db.exec("BEGIN IMMEDIATE");
    db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,rationale,status,source_note_id,supersedes_id,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(replacementId,projectId,scope,lessonScopeValue(scope,context),existing.subject_id,existing.issue,principle.trim(),rationale,"active",existing.source_note_id,existing.id,context.language,context.book,context.chapter,context.region,now,now);
    db.prepare("UPDATE production_lessons SET status='superseded',updated_at=? WHERE id=? AND project_id=?").run(now,existing.id,projectId);
    db.prepare("INSERT INTO production_lesson_events (id,lesson_id,action,detail,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),existing.id,"superseded",`Revised as ${replacementId}.`,now);
    db.prepare("INSERT INTO production_lesson_events (id,lesson_id,action,detail,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),replacementId,"activated",`Revision of ${existing.id}.`,now);
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} res.status(500).json({error:(error as Error).message}); return; }
  res.json({ok:true,lessonId:replacementId});
});
productionRouter.post("/lessons/:id/status", (req,res) => { const status=req.body?.status; if (!["disabled","superseded"].includes(status)) { res.status(400).json({error:"Only disabled or superseded are valid historical states; edit a candidate into a distinct principle before activating it."}); return; } const now=Date.now(),db=getDb(); const result=db.prepare("UPDATE production_lessons SET status=?,updated_at=? WHERE id=? AND project_id=?").run(status,now,req.params.id,getProjectId(req)); if (!result.changes) {res.status(404).json({error:"Lesson not found."});return;} db.prepare("INSERT INTO production_lesson_events (id,lesson_id,action,detail,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),req.params.id,status,"Producer action.",now); res.json({ok:true}); });
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
