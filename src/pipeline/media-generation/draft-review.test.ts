import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { DraftVideoProvider } from "../../providers/types.js";
vi.mock("../creative-direction/crew-store.js",async original=>({...await original<object>(),...(await import("../../../tests/helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture}));

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

let dataDir = "";
vi.mock("../../db/client.js", () => ({ getDb: () => { throw new Error("unused"); }, getDataDir: () => dataDir }));
const generateJsonWithImagesMetered = vi.fn();
vi.mock("../../providers/gemini-text.js", () => ({
  generateJsonWithImagesMetered: (...args: unknown[]) => generateJsonWithImagesMetered(...args),
  generateJsonWithImages: vi.fn(), generateJson: vi.fn(), generateJsonMetered: vi.fn(), GEMINI_TEXT_MODEL: "test"
}));

afterEach(() => { if (dataDir) rmSync(dataDir, { recursive: true, force: true }); vi.clearAllMocks(); });

function setup() {
  dataDir = mkdtempSync(join(tmpdir(), "hw-draft-review-"));
  for (const rel of ["generated/key.png", "generated/drafts/take.mp4"]) {
    const abs = join(dataDir, "assets", rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from("bytes"));
  }
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:1','Mark 3:6',1);
    INSERT INTO shots (id,scene_id,sequence,action,framing,camera_movement,crowd_density,needs_lip_sync,status,created_at)
      VALUES ('shot','sc',1,'The crowd presses in.','medium','static','sparse',0,'planned',1);
    INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)
      VALUES ('kf','shot','gemini','nano-banana-pro','generate','accepted','generated/key.png',0.24,1);
  `);
  return db;
}
const provider = () => ({
  generateDraft: vi.fn(async () => ({
    status: "accepted" as const, media: { path: "generated/drafts/take.mp4" },
    cost: { usd: 0.26 }, provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", prompt: "p" }
  })),
  generateGuided: vi.fn()
}) as unknown as DraftVideoProvider;

const verdict = (v: unknown, costUsd = 0.02) => ({ result: v, usage: {}, costUsd });

it("attaches a passing verdict and its confidence to the draft's review note", async () => {
  const db = setup();
  generateJsonWithImagesMetered.mockResolvedValue(verdict({ pass: true, confidence: 92, reason: "Motion matches the direction." }));
  const { generateShotDraft } = await import("./draft-room.js");
  const out = await generateShotDraft(db, "p", "shot", provider()) as { review: string };
  expect(out.review).toContain("passed automated review (confidence 92)");
  const note = db.prepare("SELECT note FROM review_notes ORDER BY created_at DESC LIMIT 1").get() as { note: string };
  expect(note.note).toContain("Motion matches the direction.");
});

it("records a failing verdict but still leaves the draft choosable", async () => {
  const db = setup();
  generateJsonWithImagesMetered.mockResolvedValue(verdict({ pass: false, confidence: 95, reason: "The hand never moves." }));
  const { chooseShotDraft, generateShotDraft } = await import("./draft-room.js");
  const out = await generateShotDraft(db, "p", "shot", provider()) as { attemptId: string; review: string };
  expect(out.review).toContain("FAILED automated review");
  // Advisory, not a veto: the producer is comparing takes.
  expect(() => chooseShotDraft(db, "p", out.attemptId)).not.toThrow();
});

it("records the review's own cost against the project alongside the draft's", async () => {
  const db = setup();
  generateJsonWithImagesMetered.mockResolvedValue(verdict({ pass: true, confidence: 90, reason: "Fine." }, 0.02));
  const { generateShotDraft } = await import("./draft-room.js");
  await generateShotDraft(db, "p", "shot", provider());
  const ledger = db.prepare("SELECT COUNT(*) AS n, SUM(amount_usd) AS total FROM cost_ledger_entries").get() as { n: number; total: number };
  expect(ledger.n).toBe(2); // the draft render and its review
  expect(ledger.total).toBeCloseTo(0.28, 10);
});

it("keeps a draft that was already paid for when the review itself cannot run", async () => {
  const db = setup();
  generateJsonWithImagesMetered.mockRejectedValue(new Error("model unavailable"));
  const { generateShotDraft } = await import("./draft-room.js");
  const out = await generateShotDraft(db, "p", "shot", provider()) as { status: string; review: string };
  expect(out.status).toBe("draft");
  expect(out.review).toContain("could not run: model unavailable");
  expect((db.prepare("SELECT COUNT(*) AS n FROM generation_attempts WHERE operation='generate_draft'").get() as { n: number }).n).toBe(1);
});
