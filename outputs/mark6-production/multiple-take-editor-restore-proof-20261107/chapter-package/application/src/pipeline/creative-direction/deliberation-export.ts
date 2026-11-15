import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { CrewBrief, CrewPhase } from "./crew-types.js";

/**
 * A production-crew run's role-by-role exchange, reshaped for visualization
 * rather than left as raw production_events rows -- see
 * docs/plans/CURRENT_GOAL.md, 2026-09-19 (built for Mark 3's deliberation
 * viewer, then generalized here so every chapter gets one automatically).
 */
export interface DeliberationShot { globalSeq: number; sceneSequence: number; verseRef: string; action: string }
export interface DeliberationRole {
  role: string; sequence: number; round: number; model: string; createdAt: number;
  summary: string; findings: unknown[]; decision: string | null;
  directionsByShot: Record<string, string>;
}
export interface DeliberationExport {
  projectId: string; language: string; book: string; chapter: number; phase: CrewPhase;
  runId: string; status: string; exportedAt: number;
  shotLookup: Record<string, DeliberationShot>;
  roleData: DeliberationRole[];
}

function deliberationExportPath(dataDir: string, language: string, book: string, chapter: number, phase: CrewPhase): string {
  return join(dataDir, "exports", "production-crew", `${language}-${book}-${chapter}-${phase}.json`);
}

/**
 * Builds and saves the visualization-ready export for one completed run.
 * Never throws: a failure here must not take down the actual crew run it's
 * recording evidence for -- callers should treat this as best-effort and
 * swallow/log any error themselves, same as other non-critical persistence
 * in this codebase.
 */
export function saveDeliberationExport(db: DatabaseSync, dataDir: string, projectId: string, phase: CrewPhase, runId: string, brief: CrewBrief, status: string): DeliberationExport | null {
  const project = db.prepare("SELECT language, book, chapter FROM projects WHERE id=?").get(projectId) as { language: string; book: string; chapter: number } | undefined;
  if (!project) return null;

  const shotLookup: Record<string, DeliberationShot> = {};
  brief.shots
    .slice()
    .sort((a, b) => a.sceneSequence - b.sceneSequence || a.sequence - b.sequence)
    .forEach((shot, index) => {
      shotLookup[shot.id] = { globalSeq: index + 1, sceneSequence: shot.sceneSequence, verseRef: shot.verseRef, action: shot.action };
    });

  const events = db.prepare("SELECT role, sequence, round, model, created_at, output_json FROM production_events WHERE run_id=? ORDER BY sequence")
    .all(runId) as Array<{ role: string; sequence: number; round: number; model: string; created_at: number; output_json: string | null }>;
  const roleData: DeliberationRole[] = events
    .filter(e => e.output_json)
    .map(e => {
      const out = JSON.parse(e.output_json!) as { summary?: string; findings?: unknown[]; decision?: string; directions?: Array<{ shotId: string; instruction: string }> };
      return {
        role: e.role, sequence: e.sequence, round: e.round, model: e.model, createdAt: e.created_at,
        summary: out.summary ?? "", findings: out.findings ?? [], decision: out.decision ?? null,
        directionsByShot: Object.fromEntries((out.directions ?? []).map(d => [d.shotId, d.instruction]))
      };
    });
  if (!roleData.length) return null; // Nothing was actually exchanged yet -- no export worth saving.

  const record: DeliberationExport = {
    projectId, language: project.language, book: project.book, chapter: project.chapter, phase,
    runId, status, exportedAt: Date.now(), shotLookup, roleData
  };
  const path = deliberationExportPath(dataDir, project.language, project.book, project.chapter, phase);
  mkdirSync(join(dataDir, "exports", "production-crew"), { recursive: true });
  writeFileSync(path, JSON.stringify(record));
  return record;
}
