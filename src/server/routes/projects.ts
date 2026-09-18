import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Router } from "express";
import { getDataDir, getDb } from "../../db/client.js";
import { adoptRecoveredPipeline, runPipeline } from "../../pipeline/orchestrator.js";
import { runVoicing } from "../../pipeline/voicing/index.js";
import { runCasting, resolveEnglishReferencePath } from "../../pipeline/casting/index.js";
import { runMediaGeneration } from "../../pipeline/media-generation/index.js";
import { parseSourceTextByVerse } from "../../pipeline/ingestion/parse-source-text.js";
import { alignmentDisplay } from "../../pipeline/ingestion/alignment-display.js";
import { parseVerseRange } from "../../pipeline/scene-breakdown/build-scenes.js";
import { buildProductionCrewView, type NegotiationLogEntry } from "../production-crew.js";
import { createReuseCandidate, extractLibraryFrame, registerGeneratedMediaLibraryItems } from "../../pipeline/media-generation/media-library.js";
import { bindShotUtterance } from "../../pipeline/voice-lipsync/utterance-binding.js";
import { acceptLipSyncCandidate } from "../../pipeline/voice-lipsync/candidate-selection.js";
import { acceptFinalVideoCandidate, generateNonSpeakingVideoCandidate } from "../../pipeline/media-generation/final-video.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../../providers/gemini/index.js";
import { KlingVideoProvider } from "../../providers/kling/index.js";
import { attestSourceAlignment } from "../../pipeline/ingestion/source-review.js";
import { recordSourceAlignmentCorrection } from "../../pipeline/ingestion/source-alignment-corrections.js";
import { editorialAlignmentDisplay, recordSourceAlignmentEditorialClassification } from "../../pipeline/ingestion/source-alignment-editorial-classifications.js";

export const projectsRouter = Router();

projectsRouter.get("/", (_req, res) => {
  const db = getDb();
  const projects = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
  res.json({ projects });
});

// Global, read-only discovery projection over retained generation attempts.
// It does not make a selected library item approved for any new shot.
projectsRouter.get("/media-library", (req, res) => {
  const db = getDb();
  // registration is metadata-only and idempotent; it never moves or regenerates a file.
  registerGeneratedMediaLibraryItems(db, getDataDir());
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const selection = typeof req.query.selection === "string" ? req.query.selection : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const rows = db.prepare(`SELECT li.*,ga.provider,ga.model,ga.operation,ga.prompt,ga.status AS review_status,p.language,p.book,p.chapter,s.action,s.verse_ref,
      CASE WHEN EXISTS(SELECT 1 FROM clips c WHERE c.generation_attempt_id=li.generation_attempt_id) THEN 'selected_in_origin' ELSE 'not_selected_in_origin' END AS origin_selection,
      (SELECT GROUP_CONCAT(rn.note, '\n') FROM review_notes rn WHERE rn.subject_type='shot' AND rn.subject_id=li.shot_id AND rn.resolved=0) AS unresolved_review_notes
    FROM media_library_items li LEFT JOIN generation_attempts ga ON ga.id=li.generation_attempt_id JOIN projects p ON p.id=li.project_id JOIN shots s ON s.id=li.shot_id
    WHERE (? IS NULL OR li.kind=?) AND (? IS NULL OR ga.status=?) AND (? IS NULL OR (CASE WHEN EXISTS(SELECT 1 FROM clips c WHERE c.generation_attempt_id=li.generation_attempt_id) THEN 'selected_in_origin' ELSE 'not_selected_in_origin' END)=?) AND (''=? OR lower(coalesce(p.book,'') || ' ' || p.chapter || ' ' || coalesce(s.action,'') || ' ' || coalesce(s.verse_ref,'') || ' ' || coalesce(ga.prompt,'')) LIKE '%' || ? || '%') ORDER BY li.created_at DESC`).all(kind,kind,status,status,selection,selection,search,search);
  res.json({ items: rows, note:"Library records retain original review context. A reuse selection is only a target-shot candidate until the normal reviewed generation workflow approves a result." });
});

projectsRouter.post("/media-library/:itemId/frame", (req,res) => {
  try { res.status(201).json(extractLibraryFrame(getDb(), getDataDir(), req.params.itemId, req.body?.timeMs)); }
  catch (error) { res.status(400).json({ error:(error as Error).message }); }
});

projectsRouter.post("/", (req, res) => {
  const raw = req.body ?? {};
  if (typeof raw.language !== "string" || typeof raw.book !== "string" || !Number.isInteger(raw.chapter)) {
    res.status(400).json({ error: "language, book, and chapter (integer) are required." });
    return;
  }
  const language = raw.language.trim().toLowerCase(), book = raw.book.trim().toLowerCase(), chapter = raw.chapter as number;
  const chapterCounts: Record<string, number> = { mark:16, acts:28, genesis:50 };
  if (!language || !book || !chapterCounts[book] || chapter < 1 || chapter > chapterCounts[book]) { res.status(400).json({error:"Use a supported book and a chapter within its canonical range."}); return; }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM projects WHERE lower(language)=lower(?) AND lower(book)=lower(?) AND chapter=?").get(language, book, chapter);
  if (existing) { res.json({ project: existing, created: false }); return; }
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
  res.status(201).json({ project, created: true });
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

projectsRouter.post("/:id/source-alignment-review", (req,res) => {
  const raw=req.body ?? {};
  if (typeof raw.reviewerName!=="string" || typeof raw.attestation!=="string" || typeof raw.evidence!=="string" || raw.attestation.trim().toLowerCase() !== "confirm") { res.status(400).json({error:"reviewerName, evidence, and explicit attestation 'confirm' are required."}); return; }
  if (!getDb().prepare("SELECT id FROM projects WHERE id=?").get(req.params.id)) { res.status(404).json({error:"Project not found."}); return; }
  try { res.status(201).json({reviewId:attestSourceAlignment(getDb(),{projectId:req.params.id,reviewerName:raw.reviewerName,attestation:raw.attestation,evidence:raw.evidence})}); }
  catch(error) { res.status(400).json({error:(error as Error).message}); }
});

// Recovery is deliberately a separate, named producer action. It validates
// persisted outputs and writes ledger evidence, but cannot make a candidate
// accepted or cause a provider request.
projectsRouter.post("/:id/adopt-recovered-pipeline", (req, res) => {
  const project = getDb().prepare("SELECT id FROM projects WHERE id=?").get(req.params.id);
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  try { res.json(adoptRecoveredPipeline(req.params.id, typeof req.body?.adoptedBy === "string" ? req.body.adoptedBy : "")); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});

// A read-only projection for the producer-facing crew map. The specialist
// network is declared in the UI; this endpoint only supplies actual project
// state and the interaction transcript that the current implementation
// persists (Creative Director <-> Production Director coverage negotiations).
projectsRouter.get("/:id/production-crew", (req, res) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, stage, status FROM projects WHERE id = ?`).get(req.params.id) as
    | { id: string; stage: string; status: string }
    | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const interactionLog = db
    .prepare(
      `SELECT id, narration_span_verse_ref, idea_id, round, role, verdict, content, created_at
       FROM director_negotiation_log WHERE project_id = ? ORDER BY created_at, round`
    )
    .all(req.params.id) as unknown as NegotiationLogEntry[];

  res.json(buildProductionCrewView(project, interactionLog));
});
projectsRouter.post("/:id/source-alignment-corrections", (req,res) => {
  const raw=req.body??{};
  if(!getDb().prepare("SELECT id FROM projects WHERE id=?").get(req.params.id)){res.status(404).json({error:"Project not found."});return;}
  try { res.status(201).json({correctionId:recordSourceAlignmentCorrection(getDb(),{projectId:req.params.id,audioSegmentId:String(raw.audioSegmentId??""),verseRef:String(raw.verseRef??""),assignedText:String(raw.assignedText??""),reviewerName:String(raw.reviewerName??""),evidence:String(raw.evidence??"")})}); }
  catch(error){res.status(400).json({error:(error as Error).message});}
});
projectsRouter.post("/:id/source-alignment-editorial-classifications", (req,res) => {
  const raw=req.body??{};
  if(!getDb().prepare("SELECT id FROM projects WHERE id=?").get(req.params.id)){res.status(404).json({error:"Project not found."});return;}
  try { res.status(201).json({classificationId:recordSourceAlignmentEditorialClassification(getDb(),{projectId:req.params.id,audioSegmentId:String(raw.audioSegmentId??""),classification:raw.classification,titleText:String(raw.titleText??""),crossReferenceText:String(raw.crossReferenceText??""),nextVerseRef:raw.nextVerseRef ? String(raw.nextVerseRef) : null,reviewerName:String(raw.reviewerName??""),evidence:String(raw.evidence??"")})}); }
  catch(error){res.status(400).json({error:(error as Error).message});}
});


projectsRouter.get("/:id/audio-segments", (req, res) => {
  const db = getDb();
  const layer = typeof req.query.layer === "string" ? req.query.layer : "composite_cast_master";

  const segments = db
    .prepare(
      `SELECT a.id, a.layer, a.source_path, a.start_ms, a.end_ms, a.verse_ref, a.confidence, a.speaker_character_id,
              c.name AS speaker_name
       FROM audio_segments a
       LEFT JOIN characters c ON c.id = a.speaker_character_id
       WHERE a.project_id = ? AND a.layer = ?
       ORDER BY a.start_ms`
    )
    .all(req.params.id, layer);

  let evidence: { method?: string; segments?: unknown[] } | undefined;
  if (layer === "original_reading") {
    const row = db.prepare("SELECT result_json FROM alignment_evidence WHERE project_id=? ORDER BY created_at DESC LIMIT 1").get(req.params.id) as { result_json: string } | undefined;
    try { evidence = row ? JSON.parse(row.result_json) : undefined; } catch { evidence = undefined; }
  }
  let corrections=new Map<string,{verse_ref:string;assigned_text:string;reviewer_name:string;created_at:number}>();
  if(layer==="original_reading")try{for(const correction of db.prepare("SELECT audio_segment_id,verse_ref,assigned_text,reviewer_name,created_at FROM source_alignment_corrections WHERE project_id=? ORDER BY created_at").all(req.params.id) as Array<{audio_segment_id:string;verse_ref:string;assigned_text:string;reviewer_name:string;created_at:number}>)corrections.set(correction.audio_segment_id,correction);}catch{/* pre-migration test database */}
  let editorials=new Map<string,{classification:Parameters<typeof editorialAlignmentDisplay>[0];title_text:string;cross_reference_text:string;next_verse_ref:string|null;reviewer_name:string;created_at:number}>();
  if(layer==="original_reading")try{for(const editorial of db.prepare("SELECT audio_segment_id,classification,title_text,cross_reference_text,next_verse_ref,reviewer_name,created_at FROM source_alignment_editorial_classifications WHERE project_id=? ORDER BY created_at").all(req.params.id) as Array<{audio_segment_id:string;classification:Parameters<typeof editorialAlignmentDisplay>[0];title_text:string;cross_reference_text:string;next_verse_ref:string|null;reviewer_name:string;created_at:number}>)editorials.set(editorial.audio_segment_id,editorial);}catch{/* pre-migration test database */}
  res.json({ segments: layer === "original_reading" ? (segments as Array<{ id:string;start_ms:number; end_ms:number;verse_ref?:string|null }>).map(segment => {const correction=corrections.get(segment.id), editorial=editorials.get(segment.id);return correction ? {...segment,automatedVerseRef:segment.verse_ref,verse_ref:correction.verse_ref,assignedText:correction.assigned_text,alignmentStatus:"Human-reviewed correction",alignmentMethod:"human_reviewed",textMatchScore:null,reviewerName:correction.reviewer_name,correctedAt:correction.created_at} : editorial ? {...segment,automatedVerseRef:segment.verse_ref,verse_ref:null,editorialTitle:editorial.title_text,crossReferenceText:editorial.cross_reference_text,editorialNextVerseRef:editorial.next_verse_ref,alignmentStatus:editorialAlignmentDisplay(editorial.classification),alignmentMethod:"human_reviewed_editorial",textMatchScore:null,reviewerName:editorial.reviewer_name,correctedAt:editorial.created_at} : {...segment,...alignmentDisplay(segment,evidence as Parameters<typeof alignmentDisplay>[1])};}) : segments });
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

// Explicit producer binding for a speaking shot; this is intentionally
// separate from casting because a verse can contain multiple utterances.
projectsRouter.post("/:id/shots/:shotId/utterance-binding", (req,res) => {
  try {
    const body=req.body ?? {};
    res.status(201).json(bindShotUtterance(getDb(),{projectId:req.params.id,shotId:req.params.shotId,sourceSegmentId:body.sourceSegmentId,startMs:body.startMs,endMs:body.endMs,characterVersionId:body.characterVersionId,approvedBy:typeof body.approvedBy === "string" ? body.approvedBy : ""}));
  } catch (error) { res.status(400).json({error:(error as Error).message}); }
});
projectsRouter.post("/:id/lip-sync-candidates/:attemptId/accept", (req,res) => {
  try { res.status(201).json(acceptLipSyncCandidate(getDb(),req.params.id,req.params.attemptId)); }
  catch (error) { res.status(400).json({error:(error as Error).message}); }
});
projectsRouter.post("/:id/shots/:shotId/final-video", async (req,res) => {
  try { res.status(201).json(await generateNonSpeakingVideoCandidate(getDb(),req.params.id,req.params.shotId,{veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()})); }
  catch (error) { res.status(400).json({error:(error as Error).message}); }
});
projectsRouter.post("/:id/final-video-candidates/:attemptId/accept", (req,res) => {
  try { res.status(201).json(acceptFinalVideoCandidate(getDb(),req.params.id,req.params.attemptId,req.body?.durationMs)); }
  catch (error) { res.status(400).json({error:(error as Error).message}); }
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
             WHERE ga.shot_id = s.id AND ga.operation = 'generate' AND ga.result_asset_path IS NOT NULL
             ORDER BY ga.created_at DESC LIMIT 1) AS keyframe_path,
            (SELECT rn.note FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'human'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_human_note,
            (SELECT rn.resolved FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'human'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_human_note_resolved,
            (SELECT rn.note FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'qc'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_qc_note,
            (SELECT rn.created_at FROM review_notes rn
             WHERE rn.subject_type = 'shot' AND rn.subject_id = s.id AND rn.source = 'qc'
             ORDER BY rn.created_at DESC LIMIT 1) AS latest_qc_created_at,
            (SELECT ga.status FROM generation_attempts ga
             WHERE ga.shot_id = s.id AND ga.operation = 'generate'
             ORDER BY ga.created_at DESC LIMIT 1) AS latest_generation_status
            ,(SELECT GROUP_CONCAT(mrc.note, '\n') FROM media_reuse_candidates mrc WHERE mrc.target_shot_id=s.id AND mrc.status='candidate') AS reuse_candidate_notes
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

projectsRouter.post("/:id/shots/:shotId/reuse-candidates", (req,res) => {
  const db=getDb(); const target = db.prepare(`SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=? AND sc.project_id=?`).get(req.params.shotId,req.params.id);
  if (!target) { res.status(404).json({error:"Target shot not found in this project."}); return; }
  if (typeof req.body?.libraryItemId !== "string") { res.status(400).json({error:"A library item is required."}); return; }
  try { res.status(201).json(createReuseCandidate(db,getDataDir(),req.body.libraryItemId,req.params.shotId,typeof req.body?.note === "string" ? req.body.note.trim() || null : null)); }
  catch (error) { res.status(409).json({error:(error as Error).message}); }
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
