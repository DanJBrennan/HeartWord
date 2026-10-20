import { Router } from "express";
import { getDb } from "../../db/client.js";
import { getDataDir } from "../../db/client.js";
import {createWardrobeCandidate,addWardrobeReference,refinementDetail,reviewWardrobeCandidate,promoteWardrobeCandidate} from "../../characters/wardrobe-refinement.js";
import {renderWardrobeRefinementPage} from "../wardrobe-refinement-page.js";

export const charactersRouter = Router();

charactersRouter.get("/refinements/review", (_req,res)=>{
  res.setHeader("Cache-Control","no-store");res.type("html").send(renderWardrobeRefinementPage(getDb()));
});
charactersRouter.post("/:id/refinements",(req,res)=>{
  try {res.json(createWardrobeCandidate(getDb(),getDataDir(),req.params.id,req.body));}
  catch(e){res.status(400).json({error:(e as Error).message});}
});
charactersRouter.get("/:id/refinements/:versionId",(req,res)=>{
  try {const d=refinementDetail(getDb(),getDataDir(),req.params.versionId);
    if(d.version.character_id!==req.params.id)throw new Error("Character/version mismatch.");
    res.setHeader("Cache-Control","no-store");res.json(d);
  }catch(e){res.status(400).json({error:(e as Error).message});}
});
for(const action of ["reference","review","promote"] as const)charactersRouter.post(`/:id/refinements/:versionId/${action}`,(req,res)=>{
  try {const db=getDb(),root=getDataDir(),id=req.params.versionId!;
    if(refinementDetail(db,root,id).version.character_id!==req.params.id)throw new Error("Character/version mismatch.");
    const handler=action==="reference"?addWardrobeReference:action==="review"?reviewWardrobeCandidate:promoteWardrobeCandidate;
    res.json(handler(db,root,id,req.body));
  }catch(e){res.status(400).json({error:(e as Error).message});}
});

charactersRouter.get("/", (_req, res) => {
  const db = getDb();
  const characters = db
    .prepare(
      `SELECT c.id, c.name, c.scope_kind, c.scope_book, c.scope_chapter, c.canon_status, c.region,
              cv.id AS latest_version_id, cv.version_label, cv.status AS version_status,
              cv.voice_provider, cv.voice_id,
              (SELECT COUNT(*) FROM audio_segments a
                WHERE a.speaker_character_id = c.id AND a.layer = 'original_reading') AS spoken_segment_count
       FROM characters c
       LEFT JOIN character_versions cv ON cv.character_id = c.id AND cv.status='approved'
       GROUP BY c.id
       HAVING cv.created_at = MAX(cv.created_at) OR cv.created_at IS NULL
       ORDER BY c.name`
    )
    .all();
  res.json({ characters });
});

// Approve a voice-casting choice for a character -- writes onto that
// character's current approved version row, same voice_provider/
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
    .prepare(`SELECT id FROM character_versions WHERE character_id = ? AND status='approved' ORDER BY created_at DESC LIMIT 1`)
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
