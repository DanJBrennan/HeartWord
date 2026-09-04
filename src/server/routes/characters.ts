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
