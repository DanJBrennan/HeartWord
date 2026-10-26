import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { MAX_HELD_DRAFTS, chooseShotDraft, generateShotDraft } from "./draft-room.js";
import type { DraftVideoProvider } from "../../providers/types.js";
import { LtxDraftVideoProvider } from "../../providers/ltx/draft.js";
vi.mock("../creative-direction/crew-store.js",async original=>({...await original<object>(),...(await import("../../../tests/helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture}));

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function setup(options: { keyframe?: boolean } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:1','Mark 3:6',1);
    INSERT INTO shots (id,scene_id,sequence,action,framing,camera_movement,crowd_density,needs_lip_sync,status,created_at)
      VALUES ('shot','sc',1,'The crowd presses in.','medium','static','sparse',0,'planned',1);
  `);
  if (options.keyframe !== false) {
    db.exec(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)
      VALUES ('kf','shot','gemini','nano-banana-pro','generate','accepted','generated/key.png',0.24,1)`);
  }
  return db;
}

function draftProvider(costUsd = 0.26): DraftVideoProvider {
  let n = 0;
  return {
    generateDraft: vi.fn(async () => ({
      status: "accepted" as const,
      media: { path: `generated/drafts/take-${++n}.mp4` },
      cost: { usd: costUsd },
      provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", prompt: "p" }
    })),
    generateGuided: vi.fn()
  } as unknown as DraftVideoProvider;
}

it("holds several drafts for the same shot instead of refusing the second", async () => {
  const db = setup();
  const provider: DraftVideoProvider = {
    generateDraft: vi.fn(async (request) => ({
      status: "accepted" as const,
      media: { path: `generated/drafts/${request.shotId}.mp4` },
      cost: { usd: 0.26 },
      provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", prompt: "p" }
    })),
    generateGuided: vi.fn()
  };
  const first = await generateShotDraft(db, "p", "shot", provider);
  const second = await generateShotDraft(db, "p", "shot", provider);
  expect(first).toMatchObject({ status: "draft", heldCount: 1 });
  expect(second).toMatchObject({ status: "draft", heldCount: 2 });
  const held = db.prepare("SELECT COUNT(*) AS n FROM generation_attempts WHERE operation='generate_draft' AND status='hold_for_review'").get() as { n: number };
  expect(held.n).toBe(2);
  const paths = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE operation='generate_draft' ORDER BY created_at").all() as Array<{ result_asset_path: string }>;
  expect(paths.map(row => row.result_asset_path)).toHaveLength(2);
  expect(new Set(paths.map(row => row.result_asset_path)).size).toBe(2);
  const prompts = vi.mocked(provider.generateDraft).mock.calls.map(([request]) => request.prompt);
  expect(prompts.every(prompt => prompt.includes("NON-SPEAKING VIDEO RULE"))).toBe(true);
  expect(prompts.every(prompt => prompt.includes("Papuan/Hatam casting"))).toBe(true);
  expect(prompts.every(prompt => prompt.includes("NATURAL CROWD MOTION RULE"))).toBe(true);
});

it("uses the concise local motion request for a real LTX draft adapter", async () => {
  const db=setup();let sent="";
  const provider=new LtxDraftVideoProvider({generateFinal:vi.fn(async request=>{
    sent=request.prompt;
    return {status:"accepted" as const,media:{path:"generated/drafts/local.mp4"},cost:{usd:0},
      provenance:{provider:"ltx_local",model:"ltx-2.5-fast",prompt:request.prompt},metadata:{resolution:"720p"}};
  })} as any);
  const result=await generateShotDraft(db,"p","shot",provider);
  expect(result.status).toBe("draft");
  expect(sent).toContain("The crowd presses in");
  expect(sent).toContain("Papuan clothing");
  expect(sent).toContain("no synchronized crowd gesture, visible speech, new person or invented action");
  expect(sent).not.toContain("NON-SPEAKING VIDEO RULE");
  expect(sent.length).toBeLessThan(500);
});

it("stops at the cap rather than letting a retry loop spend without limit", async () => {
  const db = setup();
  const provider = draftProvider();
  for (let i = 0; i < MAX_HELD_DRAFTS; i++) await generateShotDraft(db, "p", "shot", provider);
  const overflow = await generateShotDraft(db, "p", "shot", provider);
  expect(overflow.status).toBe("at_capacity");
  expect(overflow).toMatchObject({ heldAttemptIds: expect.any(Array) });
  // The refusal must not have cost anything.
  expect(vi.mocked(provider.generateDraft)).toHaveBeenCalledTimes(MAX_HELD_DRAFTS);
});

it("records every draft's real cost against the project", async () => {
  const db = setup();
  await generateShotDraft(db, "p", "shot", draftProvider(0.26));
  await generateShotDraft(db, "p", "shot", draftProvider(0.26));
  const ledger = db.prepare("SELECT COUNT(*) AS n, SUM(amount_usd) AS total FROM cost_ledger_entries WHERE project_id='p'").get() as { n: number; total: number };
  expect(ledger.n).toBe(2);
  expect(ledger.total).toBeCloseTo(0.52, 10);
});

it("keeps drafts out of the deliverable-footage record", async () => {
  const db = setup();
  await generateShotDraft(db, "p", "shot", draftProvider());
  // No clip row, and the attempt is not a final-video attempt -- so the
  // orchestrator's "does this shot have footage" check is unaffected.
  expect((db.prepare("SELECT COUNT(*) AS n FROM clips").get() as { n: number }).n).toBe(0);
  expect((db.prepare("SELECT COUNT(*) AS n FROM generation_attempts WHERE operation='generate_final_video'").get() as { n: number }).n).toBe(0);
});

it("chooses one draft and leaves the rest held as history", async () => {
  const db = setup();
  const provider = draftProvider();
  const first = await generateShotDraft(db, "p", "shot", provider) as { attemptId: string };
  await generateShotDraft(db, "p", "shot", provider);
  const chosen = chooseShotDraft(db, "p", first.attemptId);
  expect(chosen).toMatchObject({ shotId: "shot", remainingHeld: 1 });
  expect((db.prepare("SELECT status FROM generation_attempts WHERE id=?").get(first.attemptId) as { status: string }).status).toBe("accepted");
  // Choosing does not produce deliverable footage: a 360p draft is not the shot.
  expect((db.prepare("SELECT COUNT(*) AS n FROM clips").get() as { n: number }).n).toBe(0);
});

it("stops drafting once one is chosen, and refuses a second choice", async () => {
  const db = setup();
  const provider = draftProvider();
  const first = await generateShotDraft(db, "p", "shot", provider) as { attemptId: string };
  const second = await generateShotDraft(db, "p", "shot", provider) as { attemptId: string };
  chooseShotDraft(db, "p", first.attemptId);
  expect(await generateShotDraft(db, "p", "shot", provider)).toMatchObject({ status: "chosen", attemptId: first.attemptId });
  expect(() => chooseShotDraft(db, "p", second.attemptId)).toThrow("already has a chosen draft");
});

it("refuses to draft a speaking shot or one outside the project", async () => {
  const db = setup();
  db.exec("UPDATE shots SET needs_lip_sync=1 WHERE id='shot'");
  await expect(generateShotDraft(db, "p", "shot", draftProvider())).rejects.toThrow("non-speaking shot");
  await expect(generateShotDraft(db, "other", "shot", draftProvider())).rejects.toThrow("non-speaking shot");
});

it("refuses to draft before the shot has an accepted keyframe", async () => {
  const db = setup({ keyframe: false });
  await expect(generateShotDraft(db, "p", "shot", draftProvider())).rejects.toThrow("accepted reviewed keyframe");
});
