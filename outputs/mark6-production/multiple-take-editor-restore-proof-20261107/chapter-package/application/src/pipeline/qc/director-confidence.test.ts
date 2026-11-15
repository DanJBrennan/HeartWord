import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const state = vi.hoisted(() => ({ db: undefined as InstanceType<typeof DatabaseSync> | undefined }));
vi.mock("../../db/client.js", () => ({ getDb: () => state.db!, getDataDir: () => "" }));

const { loadSuggestedFix } = await import("./director.js");

describe("QC confidence handoff", () => {
  beforeEach(() => {
    state.db?.close();
    state.db = new DatabaseSync(":memory:");
    state.db.exec(readFileSync("src/db/schema.sql", "utf8"));
    state.db.prepare("INSERT INTO projects (id, language, book, chapter, created_at, updated_at) VALUES ('p', 'hatam', 'mark', 2, 1, 1)").run();
  });

  it("persists per-finding confidence for the next generation recipient without turning it into a vote", () => {
    const findings = [{
      finding: "A copied background face is visible.", evidence: "Two figures share face, robe folds, and pose.", severity: "moderate",
      confidence: 70, limitations: "One background face is blurred.", requestedAction: "Regenerate distinct crowd members."
    }];
    state.db!.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES ('new', 'p', 'shot', 'new-shot', 'qc', ?, 0, 2)`).run(
      `NEXT ATTEMPT SUGGESTED FIX: vary the crowd\nNEXT ATTEMPT PRESERVE: Jesus's pose\nCRITIC_FINDINGS_JSON: ${JSON.stringify({ findings })}`
    );

    const handoff = loadSuggestedFix(state.db!, "new-shot");
    expect(handoff?.criticFindings).toEqual(findings);
    expect(handoff?.criticFindings[0]?.confidence).toBe(70);
  });

  it("keeps legacy persisted QC context explicitly unknown", () => {
    state.db!.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES ('old', 'p', 'shot', 'old-shot', 'qc', 'NEXT ATTEMPT SUGGESTED FIX: repair roof', 0, 1)`).run();

    const handoff = loadSuggestedFix(state.db!, "old-shot");
    expect(handoff?.criticFindings).toEqual([]);
  });
});
