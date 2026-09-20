import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { saveDeliberationExport } from "./deliberation-export.js";
import type { CrewBrief } from "./crew-types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let dataDir = "";
afterEach(() => { if (dataDir) rmSync(dataDir, { recursive: true, force: true }); });

function brief(): CrewBrief {
  return {
    project: { id: "p", language: "hatam", book: "mark", chapter: 3 },
    source: { text: [], reference: [], hashes: [] },
    audio: [], canon: [],
    shots: [
      { id: "s2", sceneId: "scene", sceneSequence: 1, sequence: 2, verseRef: "Mark 3:2", action: "Second shot", framing: null, cameraMovement: null, continuity: null, lighting: null, needsLipSync: false, characterIds: [], dialogueCharacterId: null, beats: [], clip: null },
      { id: "s1", sceneId: "scene", sceneSequence: 1, sequence: 1, verseRef: "Mark 3:1", action: "First shot", framing: null, cameraMovement: null, continuity: null, lighting: null, needsLipSync: false, characterIds: [], dialogueCharacterId: null, beats: [], clip: null }
    ],
    producerNotes: [], spentUsd: 0, audioAssets: [], render: null
  };
}

function setup() {
  dataDir = mkdtempSync(join(tmpdir(), "hw-deliberation-export-"));
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,language TEXT,book TEXT,chapter INTEGER);
    CREATE TABLE production_events(id TEXT,run_id TEXT,sequence INTEGER,role TEXT,round INTEGER,prompt TEXT,output_json TEXT,error TEXT,model TEXT,cost_usd REAL,created_at INTEGER);
    INSERT INTO projects VALUES ('p','hatam','mark',3);
  `);
  return db;
}

it("shapes a run's events into a shot-ordered, visualization-ready export and saves it to disk", () => {
  const db = setup();
  db.exec(`INSERT INTO production_events VALUES
    ('e1','run1',1,'creative_director',1,'prompt1','${JSON.stringify({ summary: "Sets the tone.", directions: [{ shotId: "s1", instruction: "Frame wide." }, { shotId: "s2", instruction: "Push in." }] }).replace(/'/g, "''")}',NULL,'gemini-3.6-flash',NULL,1000),
    ('e2','run1',2,'production_director',1,'prompt2','${JSON.stringify({ summary: "Approved.", findings: [], decision: "approve", directions: [] }).replace(/'/g, "''")}',NULL,'gemini-3.6-flash',NULL,2000)
  `);
  const result = saveDeliberationExport(db, dataDir, "p", "planning", "run1", brief(), "approved");
  expect(result).toMatchObject({ language: "hatam", book: "mark", chapter: 3, phase: "planning", runId: "run1", status: "approved" });
  expect(result!.shotLookup).toEqual({
    s1: { globalSeq: 1, sceneSequence: 1, verseRef: "Mark 3:1", action: "First shot" },
    s2: { globalSeq: 2, sceneSequence: 1, verseRef: "Mark 3:2", action: "Second shot" }
  });
  expect(result!.roleData).toHaveLength(2);
  expect(result!.roleData[0]).toMatchObject({ role: "creative_director", summary: "Sets the tone.", directionsByShot: { s1: "Frame wide.", s2: "Push in." } });
  expect(result!.roleData[1]).toMatchObject({ role: "production_director", decision: "approve" });

  const path = join(dataDir, "exports", "production-crew", "hatam-mark-3-planning.json");
  expect(existsSync(path)).toBe(true);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(result);
});

it("overwrites the same chapter/phase's export with the latest run rather than accumulating files", () => {
  const db = setup();
  db.exec(`INSERT INTO production_events VALUES ('e1','run1',1,'creative_director',1,'p','${JSON.stringify({ summary: "First run.", directions: [] }).replace(/'/g, "''")}',NULL,'m',NULL,1000)`);
  saveDeliberationExport(db, dataDir, "p", "planning", "run1", brief(), "held");
  db.exec(`INSERT INTO production_events VALUES ('e2','run2',1,'creative_director',1,'p','${JSON.stringify({ summary: "Second run.", directions: [] }).replace(/'/g, "''")}',NULL,'m',NULL,2000)`);
  saveDeliberationExport(db, dataDir, "p", "planning", "run2", brief(), "approved");

  const path = join(dataDir, "exports", "production-crew", "hatam-mark-3-planning.json");
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved.runId).toBe("run2");
  expect(saved.roleData[0].summary).toBe("Second run.");
});

it("does not save an export when a run produced no events yet", () => {
  const db = setup();
  const result = saveDeliberationExport(db, dataDir, "p", "planning", "run1", brief(), "incomplete");
  expect(result).toBeNull();
  expect(existsSync(join(dataDir, "exports", "production-crew"))).toBe(false);
});

it("returns null for an unknown project rather than throwing", () => {
  const db = setup();
  const result = saveDeliberationExport(db, dataDir, "missing-project", "planning", "run1", brief(), "approved");
  expect(result).toBeNull();
});
