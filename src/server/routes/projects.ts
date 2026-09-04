import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getDb } from "../../db/client.js";
import { runPipeline } from "../../pipeline/orchestrator.js";

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
