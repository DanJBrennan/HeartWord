import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getDb } from "../../db/client.js";
import { runPipeline } from "../../pipeline/orchestrator.js";
import { runVoicing } from "../../pipeline/voicing/index.js";
import { runCasting } from "../../pipeline/casting/index.js";

export const projectsRouter = Router();

projectsRouter.get("/", (_req, res) => {
  const db = getDb();
  const projects = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
  res.json({ projects });
});

projectsRouter.post("/", (req, res) => {
  const { language, book, chapter } = req.body ?? {};
  if (!language || !book || !Number.isInteger(chapter)) {
    res.status(400).json({ error: "language, book, and chapter (integer) are required." });
    return;
  }

  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO projects (id, language, book, chapter, stage, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ingestion', 'not_started', ?, ?)`
    ).run(id, language, book, chapter, now, now);
  } catch (err) {
    res.status(409).json({ error: `Could not create project: ${(err as Error).message}` });
    return;
  }

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  res.status(201).json({ project });
});

projectsRouter.post("/:id/run", async (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const result = await runPipeline(req.params.id);
  res.json(result);
});


projectsRouter.get("/:id/audio-segments", (req, res) => {
  const db = getDb();
  const layer = typeof req.query.layer === "string" ? req.query.layer : "composite_cast_master";

  const segments = db
    .prepare(
      `SELECT a.id, a.layer, a.source_path, a.start_ms, a.end_ms, a.verse_ref, a.speaker_character_id,
              c.name AS speaker_name
       FROM audio_segments a
       LEFT JOIN characters c ON c.id = a.speaker_character_id
       WHERE a.project_id = ? AND a.layer = ?
       ORDER BY a.start_ms`
    )
    .all(req.params.id, layer);

  res.json({ segments });
});

// Runs the composite-cast-master generation (the audio half of stage 5 --
// see src/pipeline/voicing/index.ts). Costs real ElevenLabs credits for
// each newly re-voiced segment, so this is only ever run when Dan asks
// for it, not automatically.
projectsRouter.post("/:id/voicing", async (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const force = req.body?.force === true;
  try {
    const result = await runVoicing(req.params.id, { force });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});


// Runs stage 3 (casting & direction) -- one Gemini planning call per
// scene, see src/pipeline/casting/index.ts. Costs a Gemini call per
// scene, so only run when Dan asks for it.
projectsRouter.post("/:id/casting", async (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  try {
    const result = await runCasting(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

projectsRouter.get("/:id/shots", (req, res) => {
  const db = getDb();
  const scenes = db
    .prepare(`SELECT id, sequence, verse_start, verse_end, summary, reasoning FROM scenes WHERE project_id = ? ORDER BY sequence`)
    .all(req.params.id) as Array<{ id: string; sequence: number; verse_start: string; verse_end: string; summary: string | null; reasoning: string | null }>;

  const shotsStmt = db.prepare(
    `SELECT s.id, s.sequence, s.action, s.status,
            (SELECT GROUP_CONCAT(c.name, ', ') FROM shot_characters sc JOIN characters c ON c.id = sc.character_id WHERE sc.shot_id = s.id) AS characters
     FROM shots s WHERE s.scene_id = ? ORDER BY s.sequence`
  );

  const scenesWithShots = scenes.map((scene) => ({
    ...scene,
    shots: shotsStmt.all(scene.id)
  }));

  res.json({ scenes: scenesWithShots });
});
