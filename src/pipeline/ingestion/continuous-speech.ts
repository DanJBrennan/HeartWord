import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { recordSourceAlignmentSpeakerAttribution } from "./source-alignment-speaker-attributions.js";
import { sourceReviewHashes } from "./source-review.js";
import { resolveAndBindSourcePaths } from "./source-catalog.js";
import { parseReferenceOnlyVerseMarkers, parseSourceTextByVerse } from "./parse-source-text.js";
import { approvedEditionCanon } from "../language-edition.js";

export interface SpeechRunMember {
  id: string; source_path: string; start_ms: number; end_ms: number;
  speaker_character_id: string | null; verse_ref: string | null;
}
export interface ConfirmedSpeechRun {
  id: string; characterId: string | null; verseRef: string;
  startMs: number; endMs: number; sourcePath: string; audioHash: string;
  internalVerseTiming: "approximate" | "unresolved";
  reviewerName: string; evidence: string; members: SpeechRunMember[];
}
export function verseNumbers(ref: string | null): number[] {
  const match = ref?.match(/:(\d+)(?:-(\d+))?$/);
  if (!match) return [];
  const start = Number(match[1]), end = Number(match[2] ?? match[1]);
  if (start < 1 || end < start || end - start > 200) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
const audioHash = (root: string, path: string) => createHash("sha256").update(readFileSync(join(root, "assets", path))).digest("hex");

/** One evidenced attribution over existing contiguous intervals. It is not a
 * segment merge, a verse aligner, a phrase boundary, or a soundtrack edit.
 * The typed history is the durable run record; per-segment attributions keep
 * existing stage contracts usable and all previous corrections remain intact. */
export function confirmContinuousSpeech(db: DatabaseSync, input: {
  projectId: string; audioSegmentIds: string[]; characterId: string | null;
  verseRef: string; internalVerseTiming: ConfirmedSpeechRun["internalVerseTiming"];
  reviewerName: string; evidence: string; idempotencyKey: string;
  supersedesRunId?: string;
}): ConfirmedSpeechRun {
  if (!input.reviewerName?.trim() || !input.evidence?.trim() || !input.idempotencyKey?.trim()) throw new Error("Named reviewer, continuity/outer-boundary evidence and idempotency key are required.");
  if (input.internalVerseTiming !== "approximate" && input.internalVerseTiming !== "unresolved") throw new Error("Internal verse timing must remain approximate or unresolved; attribution cannot certify phrase timing.");
  const prior = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=? AND command_type='confirm_continuous_speech'").get(input.projectId, input.idempotencyKey) as { payload: string } | undefined;
  if (prior) {
    const saved = JSON.parse(prior.payload) as { run: ConfirmedSpeechRun };
    if (saved.run.characterId !== input.characterId || saved.run.verseRef !== input.verseRef || JSON.stringify(saved.run.members.map(m => m.id)) !== JSON.stringify(input.audioSegmentIds)) throw new Error("Idempotency key already belongs to a different speech confirmation.");
    const active = readConfirmedSpeechRuns(db, input.projectId).find(run => run.id === saved.run.id);
    if (!active) throw new Error("The saved speech confirmation is no longer active.");
    return active;
  }
  const project = db.prepare("SELECT book,chapter,language FROM projects WHERE id=?").get(input.projectId) as { book: string; chapter: number; language: string } | undefined;
  const ref = input.verseRef.match(/^(.+?) (\d+):\d+(?:-\d+)?$/);
  if (!project || !ref || ref[1]!.toLowerCase() !== project.book.toLowerCase() || Number(ref[2]) !== project.chapter || !verseNumbers(input.verseRef).length) throw new Error("Speech verse range must belong to this chapter.");
  const paths = resolveAndBindSourcePaths(db, { id: input.projectId, ...project });
  const coveredVerses = verseNumbers(input.verseRef);
  for (const path of [paths.docxPath, paths.referencePath]) {
    // A printed cross-reference marker has no independent target words or
    // audio, but it may fall inside one heard multi-verse speech turn.
    const supplied = new Set([...parseSourceTextByVerse(path).map(v => v.verse),
      ...parseReferenceOnlyVerseMarkers(path).map(v => v.verse)]);
    if (coveredVerses.some(verse => !supplied.has(verse))) throw new Error("Speech range must be present in the verified source and reference Scripture.");
  }
  if (input.characterId !== null) {
    const character = db.prepare("SELECT id FROM characters WHERE id=? AND canon_status='approved' AND region='Papuan' AND (scope_kind='global' OR (lower(scope_book)=lower(?) AND (scope_kind='book' OR scope_chapter=?)))").get(input.characterId, project.book, project.chapter);
    if ((project.language.toLowerCase() !== "hatam" && !approvedEditionCanon(db,input.projectId)) || !character) throw new Error("Speaker needs an approved project-appropriate regional canon.");
  }
  const all = db.prepare("SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(input.projectId) as unknown as SpeechRunMember[];
  const ids = input.audioSegmentIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("Select each source interval once in source order.");
  const first = all.findIndex(m => m.id === ids[0]);
  const members = first < 0 ? [] : all.slice(first, first + ids.length);
  if (members.length !== ids.length || members.some((m, i) => m.id !== ids[i] || m.end_ms <= m.start_ms || (i > 0 && (m.start_ms !== members[i - 1]!.end_ms || m.source_path !== members[0]!.source_path)))) throw new Error("Speech run must use contiguous intervals from one recording, with precise outer bounds; interruptions and gaps need separate review.");
  const superseded = input.supersedesRunId ? db.prepare("SELECT payload FROM edit_commands WHERE id=? AND project_id=? AND command_type='confirm_continuous_speech' AND undone=0").get(input.supersedesRunId, input.projectId) as { payload: string } | undefined : undefined;
  if (input.supersedesRunId && !superseded) throw new Error("The explicitly superseded speech confirmation must belong to this chapter.");
  const existing = readConfirmedSpeechRuns(db, input.projectId, getDataDir(), input.supersedesRunId);
  if (existing.some(run => run.members.some(m => ids.includes(m.id)))) throw new Error("A confirmed run already covers these intervals; preserve it and review a separate boundary revision.");
  for (const member of members) {
    if (member.speaker_character_id !== null && member.speaker_character_id !== input.characterId) throw new Error("Speech run conflicts with an existing speaker decision; review the real speaker change separately.");
    const editorial = db.prepare("SELECT id FROM source_alignment_editorial_classifications WHERE audio_segment_id=?").get(member.id);
    if (editorial) throw new Error("Reviewed editorial material cannot be absorbed into a speech run.");
  }
  const run: ConfirmedSpeechRun = { id: randomUUID(), characterId: input.characterId, verseRef: input.verseRef,
    startMs: members[0]!.start_ms, endMs: members.at(-1)!.end_ms, sourcePath: members[0]!.source_path,
    audioHash: audioHash(getDataDir(), members[0]!.source_path), internalVerseTiming: input.internalVerseTiming,
    reviewerName: input.reviewerName.trim(), evidence: input.evidence.trim(), members };
  const hashes = sourceReviewHashes(db, input.projectId);
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN TRANSACTION");
  try {
    if (input.characterId) for (const member of members) recordSourceAlignmentSpeakerAttribution(db, {
      projectId: input.projectId, audioSegmentId: member.id, characterId: input.characterId,
      reviewerName: input.reviewerName, evidence: `Continuous speech ${run.id}, ${run.verseRef}; internal verse timing ${run.internalVerseTiming}. ${run.evidence}`
    });
    const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(input.projectId)!.n);
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'confirm_continuous_speech',?,?,?)")
      .run(run.id, input.projectId, sequence, JSON.stringify({ run, ...hashes, supersedesRunId: input.supersedesRunId,
        supersededRunSnapshot: superseded ? JSON.parse(superseded.payload) : undefined }), input.idempotencyKey, Date.now());
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) { if (ownsTransaction) db.exec("ROLLBACK"); throw error; }
  return run;
}

/** Re-ingestion may change IDs, never the attested bounds or recording.
 * Exact equivalents can retain a confirmation. A split, changed speaker or
 * changed recording holds rather than silently resurrecting the old decision. */
export function readConfirmedSpeechRuns(db: DatabaseSync, projectId: string, root = getDataDir(), explicitlySupersededRunId?: string): ConfirmedSpeechRun[] {
  // Small historical test databases predate typed history. Production always
  // has the table, and malformed/stale records below are never ignored.
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='edit_commands'").get()) return [];
  const records = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='confirm_continuous_speech' AND undone=0 ORDER BY sequence").all(projectId) as Array<{ payload: string }>;
  if (!records.length) return [];
  const savedRuns = records.map(record => JSON.parse(record.payload) as { run: ConfirmedSpeechRun; sourceHash: string; supersedesRunId?: string });
  const supersededIds = new Set(savedRuns.flatMap(saved => saved.supersedesRunId ? [saved.supersedesRunId] : []));
  if (explicitlySupersededRunId) supersededIds.add(explicitlySupersededRunId);
  const all = db.prepare("SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId) as unknown as SpeechRunMember[];
  const currentSourceHash = sourceReviewHashes(db, projectId, root).sourceHash;
  return savedRuns.filter(saved => !supersededIds.has(saved.run.id)).map(saved => {
    const run = saved.run;
    const first = all.findIndex(m => m.source_path === run.sourcePath && m.start_ms === run.startMs);
    const members = all.slice(first, first + run.members.length);
    if (saved.sourceHash !== currentSourceHash || first < 0 || members.length !== run.members.length || members.some((m, i) => m.start_ms !== run.members[i]!.start_ms || m.end_ms !== run.members[i]!.end_ms || m.source_path !== run.sourcePath || m.speaker_character_id !== run.characterId) || audioHash(root, run.sourcePath) !== run.audioHash) throw new Error(`Confirmed speech ${run.id} needs source-boundary/speaker reconciliation; its retained evidence cannot be applied to changed audio or Scripture.`);
    return { ...run, members };
  });
}

export function speechCoverageSegments(db: DatabaseSync, projectId: string) {
  const runs = readConfirmedSpeechRuns(db, projectId);
  const segments = db.prepare("SELECT id,verse_ref AS verseRef,speaker_character_id AS speakerId,start_ms AS startMs,end_ms AS endMs FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId) as Array<{ id: string; verseRef: string | null; speakerId: string | null; startMs: number; endMs: number }>;
  const exists = (table: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  const superseded = new Set<string>();
  for (const table of ["source_alignment_segment_splits", "source_alignment_segment_merges"]) if (exists(table)) {
    for (const record of db.prepare(`SELECT superseded_speaker_attribution_ids,superseded_correction_ids FROM ${table} WHERE project_id=?`).all(projectId)) {
      for (const value of Object.values(record)) if (value) for (const id of JSON.parse(String(value)) as string[]) superseded.add(id);
    }
  }
  const corrections = new Map<string, string>();
  if (exists("source_alignment_corrections")) for (const row of db.prepare("SELECT id,audio_segment_id,verse_ref FROM source_alignment_corrections WHERE project_id=? ORDER BY created_at,rowid").all(projectId)) {
    if (!superseded.has(String(row.id))) corrections.set(String(row.audio_segment_id), String(row.verse_ref));
  }
  const attributions = new Map<string, { characterId: string; verseRef: string | null }>();
  if (exists("source_alignment_speaker_attributions")) for (const row of db.prepare("SELECT id,audio_segment_id,character_id,verse_ref FROM source_alignment_speaker_attributions WHERE project_id=? ORDER BY created_at,rowid").all(projectId)) {
    if (!superseded.has(String(row.id))) attributions.set(String(row.audio_segment_id), { characterId: String(row.character_id), verseRef: row.verse_ref === null ? null : String(row.verse_ref) });
  }
  return segments.map(segment => {
    const run = runs.find(r => r.members.some(m => m.id === segment.id));
    const attribution = attributions.get(segment.id);
    return { ...segment, verseRef: run?.verseRef ?? (attribution?.characterId === segment.speakerId ? attribution.verseRef : null) ?? corrections.get(segment.id) ?? segment.verseRef, speechRunId: run?.id, reviewedNarration: run?.characterId === null };
  });
}

/** A safe pause is a separate reviewed fact, never inferred from a generic
 * timing correction or the speaker attribution. No samples/timings change. */
export function confirmSpeechRunPauseBoundary(db: DatabaseSync, input: {
  projectId: string; speechRunId: string; boundaryMs: number;
  reviewerName: string; evidence: string; idempotencyKey: string;
}) {
  const run = readConfirmedSpeechRuns(db, input.projectId).find(r => r.id === input.speechRunId);
  if (!run || !Number.isInteger(input.boundaryMs) || !run.members.some(m => m.end_ms === input.boundaryMs) || !input.reviewerName.trim() || !input.evidence.trim() || !input.idempotencyKey.trim()) throw new Error("A safe speech pause needs an exact retained boundary and independent named phrase/silence evidence.");
  const prior = db.prepare("SELECT id,payload FROM edit_commands WHERE idempotency_key=?").get(input.idempotencyKey) as { id: string; payload: string } | undefined;
  const payload = { speechRunId: run.id, boundaryMs: input.boundaryMs, audioHash: run.audioHash, reviewerName: input.reviewerName.trim(), evidence: input.evidence.trim() };
  if (prior) { if (JSON.stringify(JSON.parse(prior.payload)) !== JSON.stringify(payload)) throw new Error("Pause idempotency key already belongs to another decision."); return prior.id; }
  const id = randomUUID();
  db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) SELECT ?,?,COALESCE(MAX(sequence),0)+1,'confirm_speech_pause_boundary',?,?,? FROM edit_commands WHERE project_id=?")
    .run(id, input.projectId, JSON.stringify(payload), input.idempotencyKey, Date.now(), input.projectId);
  return id;
}
export function speechRunPauseIsSafe(db: DatabaseSync, projectId: string, run: ConfirmedSpeechRun, boundaryMs: number): boolean {
  return !!db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='confirm_speech_pause_boundary' AND undone=0 AND json_extract(payload,'$.speechRunId')=? AND json_extract(payload,'$.boundaryMs')=? AND json_extract(payload,'$.audioHash')=?")
    .get(projectId, run.id, boundaryMs, run.audioHash);
}
