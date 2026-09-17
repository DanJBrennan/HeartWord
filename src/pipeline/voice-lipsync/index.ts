/** Stage 5 owns the complete cast master and speaking-picture treatment.
 * Narration is never sent to lip-sync: only an on-camera, cast speaker with
 * an approved voice, accepted keyframe, and aligned source segment is eligible. */
import { randomUUID } from "node:crypto";
import { getDb } from "../../db/client.js";
import { KlingLipSyncProvider } from "../../providers/kling/index.js";
import { runVoicing } from "../voicing/index.js";
import type { Stage } from "../types.js";

type ReadyShot = { id: string; verse_ref: string | null; dialogue_character_id: string; keyframe: string | null; voice_id: string | null; version_id: string | null; };
export const runVoiceLipSync: Stage = async (projectId) => {
  const db = getDb();
  // Source performance and composite master stay explicit, immutable layers.
  const master = await runVoicing(projectId);
  if (!master.ok) return master;
  const shots = db.prepare(`SELECT sh.id,sh.verse_ref,sh.dialogue_character_id,
    (SELECT result_asset_path FROM generation_attempts WHERE shot_id=sh.id AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1) keyframe,
    (SELECT cv.voice_id FROM character_versions cv WHERE cv.character_id=sh.dialogue_character_id AND cv.status='approved' LIMIT 1) voice_id,
    (SELECT cv.id FROM character_versions cv WHERE cv.character_id=sh.dialogue_character_id AND cv.status='approved' LIMIT 1) version_id
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sh.needs_lip_sync=1`).all(projectId) as unknown as ReadyShot[];
  if (!shots.length) return { ok: true, reasoning: `${master.reasoning} No on-camera speech is planned; narration remains unsynchronised as required.` };
  const missing = shots.filter(s => !s.keyframe || !s.voice_id || !s.version_id || !s.verse_ref);
  if (missing.length) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held for ${missing.length} speaking shot(s): each needs an accepted keyframe and an approved speaking voice. No provider request was sent.` };
  const segments = db.prepare(`SELECT source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? AND layer='composite_cast_master' AND speaker_character_id IS NOT NULL ORDER BY created_at`).all(projectId) as Array<{source_path:string;start_ms:number;end_ms:number;speaker_character_id:string;verse_ref:string | null}>;
  const sync = new KlingLipSyncProvider(); let made = 0;
  for (const shot of shots) {
    const visible = (db.prepare(`SELECT COUNT(*) count FROM shot_characters WHERE shot_id=?`).get(shot.id) as { count: number }).count;
    if (visible !== 1) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held for ${shot.id}: the generic Kling Avatar treatment can animate every detected face and is unsafe for an ensemble. Use the reviewed face-targeted treatment before submission.` };
    // Do not let the first line by a recurring speaker stand in for a later
    // one. Stage 3's verse binding is the stable cross-stage identity.
    const matching = segments.filter(s => s.speaker_character_id === shot.dialogue_character_id && s.verse_ref === shot.verse_ref);
    // A verse may contain several utterances by one character.  A verse
    // reference alone is not an utterance identity, so choosing the first
    // one would put real speech on the wrong mouth.  Hold until casting has
    // persisted a narrower interval/utterance binding.
    if (matching.length !== 1) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held: speaking shot ${shot.id} has ${matching.length} aligned composite-master segments for its cast speaker and verse; persist an exact utterance interval before submission.` };
    const audio = matching[0]!;
    const prior = db.prepare(`SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' ORDER BY created_at DESC LIMIT 1`).get(shot.id) as { id:string; status:string } | undefined;
    if (prior) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held: shot ${shot.id} already has retained lip-sync candidate ${prior.id} (${prior.status}); review or explicitly supersede it before another paid request.` };
    const result = await sync.sync({ characterId: shot.dialogue_character_id, characterVersionId: shot.version_id! }, { path: audio.source_path, startMs: audio.start_ms, endMs: audio.end_ms }, { path: shot.keyframe! });
    if (!result.media) return { ok: false, reasoning: `Lip-sync provider returned no media for ${shot.id}; no clip was selected.` };
    const now = Date.now(), attempt = randomUUID();
    // A provider completion is evidence, never producer approval.  Keep the
    // candidate and cost, but do not create a timeline clip until the
    // producer accepts this particular attempt.
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'hold_for_review',?,?,?)`).run(attempt, shot.id, result.provenance.provider, result.provenance.model, "lip_sync", result.media.path, result.cost.usd, now);
    db.prepare(`INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)`).run(randomUUID(), projectId, attempt, result.cost.usd, now);
    db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)`).run(randomUUID(), projectId, shot.id, `Lip-sync candidate ${attempt} returned by ${result.provenance.provider}; producer review is required before it can become a clip.`, now);
    made++;
  }
  return { ok: false, reasoning: `${master.reasoning} Recorded ${made} speaking lip-sync candidate(s), all held for producer review; narration was not lip-synced.` };
};
