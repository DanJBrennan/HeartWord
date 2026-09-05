import { Router } from "express";
import { getDb } from "../../db/client.js";

export const charactersRouter = Router();

charactersRouter.get("/", (_req, res) => {
  const db = getDb();
  const characters = db
    .prepare(
      `SELECT c.id, c.name, c.scope_kind, c.scope_book, c.scope_chapter, c.canon_status, c.region,
              cv.id AS latest_version_id, cv.version_label, cv.status AS version_status,
              cv.voice_provider, cv.voice_id
       FROM characters c
       LEFT JOIN character_versions cv ON cv.character_id = c.id
       GROUP BY c.id
       HAVING cv.created_at = MAX(cv.created_at) OR cv.created_at IS NULL
       ORDER BY c.name`
    )
    .all();
  res.json({ characters });
});

// Approve a voice-casting choice for a character -- writes onto that
// character's current (most recent) version row, same voice_provider/
// voice_id columns the seed data leaves NULL. See docs/design/
// character-tool.md ("Voice Mapping and Live Test") and CURRENT_GOAL.md's
// 2026-09-05 voice-provider decision (ElevenLabs voice-changer).
charactersRouter.patch("/:id/voice", (req, res) => {
  const { id } = req.params;
  const { voiceProvider, voiceId } = req.body as { voiceProvider?: string; voiceId?: string };

  if (!voiceProvider || !voiceId) {
    res.status(400).json({ error: "voiceProvider and voiceId are both required." });
    return;
  }

  const db = getDb();
  const version = db
    .prepare(`SELECT id FROM character_versions WHERE character_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(id) as { id: string } | undefined;

  if (!version) {
    res.status(404).json({ error: `No character_version found for character ${id}.` });
    return;
  }

  db.prepare(`UPDATE character_versions SET voice_provider = ?, voice_id = ? WHERE id = ?`).run(
    voiceProvider,
    voiceId,
    version.id
  );

  res.json({ ok: true });
});
