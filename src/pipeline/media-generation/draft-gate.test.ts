import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { generateNonSpeakingVideoCandidate } from "./final-video.js";
import { chooseShotDraft, generateShotDraft } from "./draft-room.js";
import type { DraftVideoProvider, VideoProvider } from "../../providers/types.js";
vi.mock("../creative-direction/crew-store.js",async original=>({...await original<object>(),...(await import("../../../tests/helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture}));

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** A shot's risk comes from its own cast/crowd/camera facts, so a test
 *  makes a shot risky or routine by setting those, not by stubbing. */
function setup(options: { characters?: number; crowd?: string } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:1','Mark 3:6',1);
    INSERT INTO shots (id,scene_id,sequence,action,framing,camera_movement,crowd_density,needs_lip_sync,status,created_at)
      VALUES ('shot','sc',1,'The crowd presses in.','medium','static','${options.crowd ?? "sparse"}',0,'planned',1);
    INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)
      VALUES ('kf','shot','gemini','nano-banana-pro','generate','accepted','generated/key.png',0.24,1);
  `);
  for (let i = 0; i < (options.characters ?? 1); i++) {
    db.prepare("INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES (?,?,'global','approved','Papuan',1,1)").run(`c${i}`, `Character ${i}`);
    db.prepare("INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES (?,?,'v1','approved',1)").run(`v${i}`, `c${i}`);
    db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES ('shot',?)").run(`c${i}`);
  }
  return db;
}

const videoProvider = () => ({
  generateFinal: vi.fn(async () => ({
    status: "accepted" as const, media: { path: "generated/final.mp4" },
    cost: { usd: 1.6 }, provenance: { provider: "gemini", model: "veo-3.1-generate-preview", prompt: "p" }
  }))
}) as unknown as VideoProvider;

const draftProvider = () => ({
  generateDraft: vi.fn(async () => ({
    status: "accepted" as const, media: { path: "generated/drafts/d.mp4" },
    cost: { usd: 0.26 }, provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", prompt: "p" }
  })),
  generateGuided: vi.fn()
}) as unknown as DraftVideoProvider;

it("refuses to commit a render for a risky shot until a draft is chosen, without spending", async () => {
  const db = setup({ characters: 9 }); // critical: nine named likenesses
  const veo = videoProvider();
  const result = await generateNonSpeakingVideoCandidate(db, "p", "shot", { veo, kling: videoProvider(), draft: draftProvider() });
  expect(result.status).toBe("needs_draft");
  expect(vi.mocked(veo.generateFinal)).not.toHaveBeenCalled();
  expect((db.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get() as { n: number }).n).toBe(0);
});

it("lets the render proceed once a draft has been chosen", async () => {
  const db = setup({ characters: 9 });
  const draft = await generateShotDraft(db, "p", "shot", draftProvider()) as { attemptId: string };
  chooseShotDraft(db, "p", draft.attemptId);
  const veo = videoProvider();
  const result = await generateNonSpeakingVideoCandidate(db, "p", "shot", { veo, kling: videoProvider(), draft: draftProvider() });
  expect(result.status).toBe("candidate");
  expect(vi.mocked(veo.generateFinal)).toHaveBeenCalledTimes(1);
});

it("does not gate a routine shot, which goes straight to its cheap render", async () => {
  const db = setup({ characters: 1 });
  const veo = videoProvider();
  const result = await generateNonSpeakingVideoCandidate(db, "p", "shot", { veo, kling: videoProvider(), draft: draftProvider() });
  expect(result.status).toBe("candidate");
  expect(vi.mocked(veo.generateFinal)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tier: "economy" }));
});

it("buys the better render only for the risky shot that earned it", async () => {
  const db = setup({ characters: 9 });
  const draft = await generateShotDraft(db, "p", "shot", draftProvider()) as { attemptId: string };
  chooseShotDraft(db, "p", draft.attemptId);
  const veo = videoProvider();
  await generateNonSpeakingVideoCandidate(db, "p", "shot", { veo, kling: videoProvider(), draft: draftProvider() });
  expect(vi.mocked(veo.generateFinal)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tier: "premium" }));
});

it("holds a shot-specific LTX motion correction without its exact saved review", async () => {
  const db = setup({ characters: 0 });
  const ltx = videoProvider();
  const providers = { primaryBackend: "ltx" as const, ltx, veo: videoProvider(), kling: videoProvider(), draft: draftProvider() };
  const correction = { reviewNoteId: "correction", direction: "The farmer releases seed from his hand into the furrow." };
  await expect(generateNonSpeakingVideoCandidate(db, "p", "shot", providers, { localMotionCorrection: correction })).rejects.toThrow("exact reviewed correction");
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES ('correction','p','shot','shot','qc',?,1,1)")
    .run("Approved local LTX motion correction: A different motion instruction.");
  await expect(generateNonSpeakingVideoCandidate(db, "p", "shot", providers, { localMotionCorrection: correction })).rejects.toThrow("exact reviewed correction");
  expect(vi.mocked(ltx.generateFinal)).not.toHaveBeenCalled();
});

it("only disables local model audio when the shot's reviewed correction says so", async () => {
  const db = setup({ characters: 0 });
  const ltx = videoProvider();
  const providers = { primaryBackend: "ltx" as const, ltx, veo: videoProvider(), kling: videoProvider(), draft: draftProvider() };
  const correction = { reviewNoteId: "correction", direction: "Both listeners keep their lips closed and only shift their gaze.", audioMode: "none" as const };
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES ('correction','p','shot','shot','qc',?,1,1)")
    .run(`Approved local LTX motion correction: ${correction.direction}`);
  await expect(generateNonSpeakingVideoCandidate(db, "p", "shot", providers, { localMotionCorrection: correction })).rejects.toThrow("exact reviewed correction");
  expect(vi.mocked(ltx.generateFinal)).not.toHaveBeenCalled();
  db.prepare("UPDATE review_notes SET note=? WHERE id='correction'").run(`Approved local LTX motion correction: ${correction.direction}\naudioMode=none`);
  const result = await generateNonSpeakingVideoCandidate(db, "p", "shot", providers, { localMotionCorrection: correction });
  expect(result.status).toBe("candidate");
  expect(vi.mocked(ltx.generateFinal)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ audioMode: "none" }));
});
