import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CrewBrief } from "../creative-direction/crew-types.js";

/** Observed history of an imperfect film. This is never an approved render manifest. */
export interface CutTimingAudit {
  kind: "observed_cut_timing";
  renderId: string; renderSha256: string; durationMs: number;
  summary: string; findings: string[]; evidenceDirectory: string;
  picture: Array<{ shotId: string | null; label: string; path: string | null;
    startMs: number; endMs: number; uncertaintyMs: number;
    evidence: "pixel_match" | "visual_identification" | "unresolved" }>;
  audio: Array<{ segmentId: string; referencePath: string; voice: "original" | "dubbed";
    observations: Array<{ referenceStartMs: number; durationMs: number; startMs: number; correlation: number }> }>;
  unverifiedAudio: Array<{ segmentId: string; reason: string }>;
}
export interface SavedCutTimingAudit extends CutTimingAudit { sourceHashes: string[] }
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function readCutTimingAudit(db: DatabaseSync, projectId: string, renderId: string): SavedCutTimingAudit | null {
  const row = db.prepare(`SELECT payload FROM edit_commands WHERE project_id=? AND command_type='audit_cut_timing'
    AND undone=0 AND json_extract(payload,'$.renderId')=? ORDER BY sequence DESC LIMIT 1`).get(projectId, renderId);
  return row ? JSON.parse(String(row.payload)) as SavedCutTimingAudit : null;
}

export function recordCutTimingAudit(db: DatabaseSync, brief: CrewBrief, value: unknown): void {
  const audit = value as CutTimingAudit | null;
  if (!audit || audit.kind !== "observed_cut_timing" || !brief.render ||
      audit.renderId !== brief.render.id || audit.renderSha256 !== brief.render.sha256) throw new Error("Audit must describe the current, unchanged film.");
  const text = (v: unknown, max = 4000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
  if (!number(audit.durationMs) || Math.abs(audit.durationMs - brief.render.durationMs) > 100 ||
      !text(audit.summary) || !text(audit.evidenceDirectory) || !list(audit.findings, 100) || !audit.findings.every(f => text(f)) ||
      !list(audit.picture, 2000) || !audit.picture.length || !list(audit.audio, 2000) || !list(audit.unverifiedAudio, 2000)) throw new Error("Invalid observed timing audit.");
  let end = 0;
  for (const item of audit.picture) {
    if (!item || !text(item.label) || (item.path !== null && !text(item.path)) ||
        (item.shotId !== null && !brief.shots.some(s => s.id === item.shotId)) ||
        !number(item.startMs) || !number(item.endMs) || item.startMs < end || item.endMs <= item.startMs || item.endMs > audit.durationMs + 50 ||
        !number(item.uncertaintyMs) || item.uncertaintyMs > 1000 || !["pixel_match", "visual_identification", "unresolved"].includes(item.evidence)) throw new Error("Invalid observed picture interval.");
    end = item.endMs;
  }
  const sourceIds = new Set(brief.audio.map(a => a.id));
  for (const item of audit.audio) {
    if (!item || !sourceIds.has(item.segmentId) || !text(item.referencePath) || !["original", "dubbed"].includes(item.voice) ||
        !list(item.observations, 2000) || item.observations.some(o => !o || !number(o.referenceStartMs) || !number(o.durationMs) || o.durationMs <= 0 ||
          !number(o.startMs) || o.startMs + o.durationMs > audit.durationMs + 50 || !number(o.correlation) || o.correlation > 1)) throw new Error("Invalid observed audio interval.");
  }
  if (audit.unverifiedAudio.some(a => !a || !sourceIds.has(a.segmentId) || !text(a.reason))) throw new Error("Unknown or unexplained source-audio interval.");
  const saved: SavedCutTimingAudit = { ...audit, sourceHashes: brief.source.hashes };
  const payload = JSON.stringify(saved), idempotency = `cut-audit:${brief.project.id}:${hash(payload)}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT id FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(brief.project.id);
    if (current?.id !== audit.renderId) throw new Error("The current film changed before the audit could be saved.");
    if (!db.prepare("SELECT id FROM edit_commands WHERE idempotency_key=?").get(idempotency)) {
      const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(brief.project.id)!.n);
      db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'audit_cut_timing',?,?,?)")
        .run(randomUUID(), brief.project.id, sequence, payload, idempotency, Date.now());
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
