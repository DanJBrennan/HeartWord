import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { negotiateGapProposal } from "../../src/pipeline/creative-direction/production-director.js";
import { generateJson } from "../../src/server/providers/gemini.js";
import type { CreativeDirectorProposal, GapFillIdea } from "../../src/pipeline/creative-direction/index.js";
vi.mock("../../src/server/providers/gemini.js", () => ({ generateJson: vi.fn(), generateJsonWithImages: vi.fn(), GEMINI_TEXT_MODEL: "test" }));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>;
const idea: GapFillIdea = { id: "idea", operation: "new_shot", kind: "continuity", targetShotId: "shot", targetShotVerseRef: "Mark 2:1", label: "Listener", description: "A listener", framing: "close_up", cameraMovement: "static", setting: "Established room", estimatedDurationSec: 4, charactersInvolved: [], decorumRationale: "A restrained reaction" };
const proposal: CreativeDirectorProposal = { id: "proposal", projectId: "p", narrationSpanVerseRef: "Mark 2:1", gapMs: 4000, ideas: [idea], context: "EXACT SOURCE AND CANON", createdAt: 1 };
beforeEach(() => { vi.resetAllMocks(); db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)"); });
afterEach(() => db.close());
describe("Creative/Production Director negotiation", () => {
  it("rejects an unresolved conflict at the revision cap and retains context throughout", async () => {
    vi.mocked(generateJson).mockImplementation(async (_prompt, schema) => (schema.properties as Record<string, unknown>).verdicts
      ? { verdicts: [{ ideaId: "idea", verdict: "request_changes", feedback: "Resolve continuity", confidence: 70, limitations: "Needs producer visual review." }] }
      : { ideas: [idea] });
    const result = await negotiateGapProposal(db, "p", proposal);
    expect(result.approvedIdeas).toEqual([]); expect(result.rejectedIdeas).toEqual([idea]); expect(result.forcedFinalCount).toBe(1);
    expect(generateJson).toHaveBeenCalledTimes(21);
    for (const [prompt] of vi.mocked(generateJson).mock.calls) expect(prompt).toContain("EXACT SOURCE AND CANON");
  });
  it("fails closed when the Director omits a verdict", async () => {
    vi.mocked(generateJson).mockResolvedValue({ verdicts: [] });
    await expect(negotiateGapProposal(db, "p", proposal)).rejects.toThrow("incomplete");
    expect(db.prepare("SELECT COUNT(*) AS n FROM director_resolutions").get()!.n).toBe(0);
  });
  it("counts all approved ideas against the same measured gap", async () => {
    const ideas = [idea, { ...idea, id: "other" }];
    vi.mocked(generateJson).mockResolvedValue({ verdicts: ideas.map(i => ({ ideaId: i.id, verdict: "approve", feedback: "Useful coverage", confidence: 70, limitations: "Needs producer visual review." })) });
    const result = await negotiateGapProposal(db, "p", { ...proposal, ideas });
    expect(result.approvedIdeas).toHaveLength(1); expect(result.rejectedIdeas).toHaveLength(1);
  });
});
