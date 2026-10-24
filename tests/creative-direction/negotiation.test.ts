import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { negotiateGapProposal } from "../../src/pipeline/creative-direction/production-director.js";
import { generateJsonMetered } from "../../src/providers/gemini-text.js";
import type { CreativeDirectorProposal, GapFillIdea } from "../../src/pipeline/creative-direction/index.js";
vi.mock("../../src/providers/gemini-text.js", () => ({ generateJson: vi.fn(), generateJsonMetered: vi.fn(), generateJsonWithImages: vi.fn(), generateJsonWithImagesMetered: vi.fn(), GEMINI_TEXT_MODEL: "test" }));
/** The negotiation path is metered, so every stubbed call returns the
 *  {result, usage, costUsd} envelope a real call does. */
const metered = (result: unknown, costUsd = 0.01) => ({ result, usage: { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0 }, costUsd });
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>;
const idea: GapFillIdea = { id: "idea", operation: "new_shot", kind: "continuity", targetShotId: "shot", targetShotVerseRef: "Mark 2:1", label: "Listener", description: "A listener", framing: "close_up", cameraMovement: "static", setting: "Established room", estimatedDurationSec: 4, charactersInvolved: [], decorumRationale: "A restrained reaction" };
const proposal: CreativeDirectorProposal = { id: "proposal", projectId: "p", narrationSpanVerseRef: "Mark 2:1", gapMs: 4000, ideas: [idea], context: "EXACT SOURCE AND CANON", createdAt: 1 };
beforeEach(() => { vi.resetAllMocks(); db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)"); });
afterEach(() => db.close());
describe("Creative/Production Director negotiation", () => {
  it("lets the Director inspect a corrected anchor and current staging without another false revision", async () => {
    const corrected = { ...idea, targetShotId: "corrected-anchor", framing: "medium_wide", cameraMovement: "static", charactersInvolved: ["Peter"], narrativeRationale: "The crowd stays outside while Peter follows Jesus." };
    vi.mocked(generateJsonMetered).mockImplementation(async (prompt, schema) => metered((schema.properties as Record<string, unknown>).verdicts
      ? { verdicts: [{ ideaId: "idea", verdict: prompt.includes('"targetShotId":"corrected-anchor"') ? "approve" : "request_changes", feedback: "The new shot needs its exact chapter anchor and staging.", confidence: 90, limitations: "Text-only direction; footage still needs normal review." }] }
      : { ideas: [corrected] }) as never);
    const result = await negotiateGapProposal(db, "p", { ...proposal, ideas: [{ ...idea, targetShotId: "" }] });
    expect(result.approvedIdeas).toEqual([corrected]);
    expect(result.rejectedIdeas).toEqual([]);
    expect(result.roundsUsed).toBe(1);
    expect(generateJsonMetered).toHaveBeenCalledTimes(3);
    const lastPrompt = vi.mocked(generateJsonMetered).mock.calls[2]![0];
    expect(lastPrompt).toContain('"framing":"medium_wide"');
    expect(lastPrompt).toContain('"charactersInvolved":["Peter"]');
    expect(db.prepare("SELECT COUNT(*) n FROM director_negotiation_log WHERE role='production_director'").get()!.n).toBe(2);
    expect(db.prepare("SELECT COUNT(*) n FROM cost_ledger_entries").get()!.n).toBe(3);
  });
  it("rejects an unresolved conflict at the revision cap and retains context throughout", async () => {
    vi.mocked(generateJsonMetered).mockImplementation(async (_prompt, schema) => metered((schema.properties as Record<string, unknown>).verdicts
      ? { verdicts: [{ ideaId: "idea", verdict: "request_changes", feedback: "Resolve continuity", confidence: 70, limitations: "Needs producer visual review." }] }
      : { ideas: [idea] }) as never);
    const result = await negotiateGapProposal(db, "p", proposal);
    expect(result.approvedIdeas).toEqual([]); expect(result.rejectedIdeas).toEqual([idea]); expect(result.forcedFinalCount).toBe(1);
    expect(generateJsonMetered).toHaveBeenCalledTimes(21);
    for (const [prompt] of vi.mocked(generateJsonMetered).mock.calls) expect(prompt).toContain("EXACT SOURCE AND CANON");
  });
  it("records every negotiation call's real cost against the project", async () => {
    vi.mocked(generateJsonMetered).mockImplementation(async (_prompt, schema) => metered((schema.properties as Record<string, unknown>).verdicts
      ? { verdicts: [{ ideaId: "idea", verdict: "approve", feedback: "Useful coverage", confidence: 70, limitations: "Needs producer visual review." }] }
      : { ideas: [idea] }, 0.02) as never);
    const result = await negotiateGapProposal(db, "p", proposal);
    expect(result.modelCostUsd).toBeCloseTo(0.02, 10);
    const ledger = db.prepare("SELECT COUNT(*) AS n, SUM(amount_usd) AS total FROM cost_ledger_entries WHERE project_id='p'").get() as { n: number; total: number };
    expect(ledger.n).toBe(1);
    expect(ledger.total).toBeCloseTo(0.02, 10);
  });
  it("fails closed when the Director omits a verdict", async () => {
    vi.mocked(generateJsonMetered).mockResolvedValue(metered({ verdicts: [] }) as never);
    await expect(negotiateGapProposal(db, "p", proposal)).rejects.toThrow("incomplete");
    expect(db.prepare("SELECT COUNT(*) AS n FROM director_resolutions").get()!.n).toBe(0);
  });
  it("counts all approved ideas against the same measured gap", async () => {
    const ideas = [idea, { ...idea, id: "other" }];
    vi.mocked(generateJsonMetered).mockResolvedValue(metered({ verdicts: ideas.map(i => ({ ideaId: i.id, verdict: "approve", feedback: "Useful coverage", confidence: 70, limitations: "Needs producer visual review." })) }) as never);
    const result = await negotiateGapProposal(db, "p", { ...proposal, ideas });
    expect(result.approvedIdeas).toHaveLength(1); expect(result.rejectedIdeas).toHaveLength(1);
  });
});
