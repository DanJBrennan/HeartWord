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

export const productionRouter = Router({ mergeParams: true });
const getProjectId = (req: Request): string => req.params.projectId!;
productionRouter.use((req, res, next) => {
  if (!getDb().prepare("SELECT id FROM projects WHERE id = ?").get(getProjectId(req))) {
    res.status(404).json({ error: "Project not found." }); return;
  }
  next();
});
productionRouter.get("/", (req, res) => {
  const db = getDb();
  const runs = db.prepare(`SELECT r.id, r.phase, r.status, r.result_json, r.created_at,
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
productionRouter.post("/guidance", (req, res) => {
  const note = req.body?.note;
  if (typeof note !== "string" || !note.trim() || note.length > 12000) { res.status(400).json({ error: "A production note of 1–12,000 characters is required." }); return; }
  getDb().prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
    VALUES (?, ?, 'project', ?, 'human', ?, 1, ?)`).run(randomUUID(), getProjectId(req), getProjectId(req), `Production guidance: ${note.trim()}`, Date.now());
  res.status(201).json({ ok: true });
});
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
