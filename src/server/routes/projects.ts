import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Router } from "express";
import { getDb } from "../../db/client.js";
import { runPipeline } from "../../pipeline/orchestrator.js";
import { runVoicing } from "../../pipeline/voicing/index.js";
import { runCasting, resolveEnglishReferencePath } from "../../pipeline/casting/index.js";
import { runMediaGeneration } from "../../pipeline/media-generation/index.js";
import { parseSourceTextByVerse } from "../../pipeline/ingestion/parse-source-text.js";
import { parseVerseRange } from "../../pipeline/scene-breakdown/build-scenes.js";

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

// Runs stage 4 (media generation) -- one Nano Banana / Nano Banana Pro
// keyframe image per shot, see src/pipeline/media-generation/index.ts.
// Costs a real Gemini image call per shot not already generated, so only
// run when Dan asks for it.
projectsRouter.post("/:id/media-generation", async (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  try {
    const result = await runMediaGeneration(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

projectsRouter.get("/:id/shots", (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(req.params.id) as
    | { id: string; language: string; book: string; chapter: number }
    | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const scenes = db
    .prepare(
      `SELECT id, sequence, verse_start, verse_end, summary, reasoning, lighting_continuity
       FROM scenes WHERE project_id = ? ORDER BY sequence`
    )
    .all(req.params.id) as Array<{
    id: string;
    sequence: number;
    verse_start: string;
    verse_end: string;
    summary: string | null;
    reasoning: string | null;
    lighting_continuity: string | null;
  }>;

  // English reference text per scene, so Dan can compare each shot's
  // keyframe directly against the passage it's supposed to depict --
  // the same source stage 3 (casting) grounds its own shot planning in
  // (see NON_GOALS.md: this is the source of truth for what happens, not
  // the Hatam text an LLM can't read). Best-effort: a project whose
  // reference docx isn't present yet just gets no englishText rather than
  // failing the whole shots view.
  let englishTextByVerse: Map<number, string> | null = null;
  try {
    const referencePath = resolveEnglishReferencePath(project);
    if (existsSync(referencePath)) {
      const verses = parseSourceTextByVerse(referencePath);
      englishTextByVerse = new Map(verses.map((v) => [v.verse, v.text]));
    }
  } catch {
    // No reference text available -- englishText stays null per scene below.
  }

  const shotsStmt = db.prepare(
    `SELECT s.id, s.sequence, s.action, s.status, s.verse_ref, s.framing, s.camera_movement,
            s.needs_lip_sync, s.coverage_plan, s.coverage_notes,
            dc.name AS dialogue_character,
            (SELECT GROUP_CONCAT(c.name, ', ') FROM shot_characters sc JOIN characters c ON c.id = sc.character_id WHERE sc.shot_id = s.id) AS characters,
            (SELECT ga.result_asset_path FROM generation_attempts ga
             WHERE ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted'
             ORDER BY ga.created_at DESC LIMIT 1) AS keyframe_path,
            (SELECT rn.note FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'human'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_human_note,
            (SELECT rn.resolved FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'human'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_human_note_resolved
     FROM shots s
     LEFT JOIN characters dc ON dc.id = s.dialogue_character_id
     WHERE s.scene_id = ? ORDER BY s.sequence`
  );

  const scenesWithShots = scenes.map((scene) => {
    let englishText: string | null = null;
    if (englishTextByVerse) {
      try {
        // Same verse-range convention casting/index.ts uses when it
        // grounds its own shot planning: start of verse_start through end
        // of verse_end (matching src/pipeline/casting/index.ts's
        // sceneStart/sceneEnd computation).
        const sceneStart = parseVerseRange(scene.verse_start).start;
        const sceneEnd = parseVerseRange(scene.verse_end).end;
        const lines: string[] = [];
        for (let v = sceneStart; v <= sceneEnd; v++) {
          const text = englishTextByVerse.get(v);
          if (text) lines.push(`${v}. ${text}`);
        }
        englishText = lines.length > 0 ? lines.join(" ") : null;
      } catch {
        englishText = null;
      }
    }
    return { ...scene, englishText, shots: shotsStmt.all(scene.id) };
  });

  res.json({ scenes: scenesWithShots });
});

// Records Dan's own review decision on a shot's current keyframe --
// "approved" (a resolved human review_notes row) or "flagged" (an
// unresolved one carrying his comment, the same table QC's own automated
// checks like canonical-likeness.ts already write to, just source='human'
// instead of 'qc'). Not wired to any pipeline action itself (approving
// doesn't do anything special yet, flagging doesn't auto-regenerate) --
// this just gives Dan a durable, visible record of what he's looked at
// and what he wants changed, which the review_notes table already exists
// to hold.
projectsRouter.post("/:id/shots/:shotId/review", (req, res) => {
  const db = getDb();
  const shot = db.prepare(`SELECT id FROM shots WHERE id = ?`).get(req.params.shotId);
  if (!shot) {
    res.status(404).json({ error: "Shot not found." });
    return;
  }

  const { decision, comment } = req.body ?? {};
  if (decision !== "approved" && decision !== "flagged") {
    res.status(400).json({ error: "decision must be 'approved' or 'flagged'." });
    return;
  }
  if (decision === "flagged" && (!comment || typeof comment !== "string" || comment.trim().length === 0)) {
    res.status(400).json({ error: "A comment is required when flagging a shot." });
    return;
  }

  const note = decision === "approved" ? (typeof comment === "string" && comment.trim() ? comment.trim() : "Approved") : comment.trim();
  const resolved = decision === "approved" ? 1 : 0;

  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'human', ?, ?, ?)`
  ).run(randomUUID(), req.params.id, req.params.shotId, note, resolved, Date.now());

  res.status(201).json({ ok: true });
});
