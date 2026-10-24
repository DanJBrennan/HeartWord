import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateShotDraft } from "../../src/pipeline/media-generation/draft-room.js";
import { generateNonSpeakingVideoCandidate } from "../../src/pipeline/media-generation/final-video.js";
import { reviewGeneratedVideo } from "../../src/pipeline/qc/video-review.js";
import type { ShotRequest } from "../../src/providers/types.js";

vi.mock("../../src/pipeline/creative-direction/crew-store.js", async original => ({
  ...await original<object>(), ...(await import("../helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture,
}));
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));
vi.mock("../../src/pipeline/qc/video-review.js", () => ({
  reviewGeneratedVideo: vi.fn(async () => ({ verdict: { confidence: 70, reason: "synthetic retained finding" }, costUsd: 0.01 })),
  videoReviewPassed: vi.fn(() => false),
}));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root: string;
beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), "hw-motion-instruction-")); mkdirSync(join(root, "assets"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES('s','p',1,'Mark 5:11','Mark 5:11',1);
    INSERT INTO shots(id,scene_id,sequence,action,created_at) VALUES('shot','s',1,'The grazing herd starts to move.',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,prompt,cost_usd,created_at)
    VALUES('key','shot','fixture','fixture','generate','accepted','key.png','Edit the gate hardware; preserve this still composition.',0,1)`);
});
afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }); });

it.each(["draft", "final"] as const)("reviews the actual %s provider motion request and preserves its held result", async operation => {
  const actualPrompt = "Compiled motion: the herd turns on the upper slope; remain on land. Provider non-speaking rule.";
  const generate = vi.fn(async (_request: ShotRequest) => ({ status: "accepted" as const, media: { path: "motion.mp4" },
    cost: { usd: 0.33 }, provenance: { provider: "fixture", model: "fixture", prompt: actualPrompt }, metadata: { resolution: "720p" } }));
  const result = operation === "draft"
    ? await generateShotDraft(db, "p", "shot", { generateDraft: generate, generateGuided: vi.fn() })
    : await generateNonSpeakingVideoCandidate(db, "p", "shot", { primaryBackend: "veo", veo: { generateFinal: generate },
      kling: { generateFinal: vi.fn() }, draft: { generateDraft: vi.fn(), generateGuided: vi.fn() } });
  expect(result.status).toBe(operation === "draft" ? "draft" : "candidate");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(reviewGeneratedVideo).toHaveBeenCalledTimes(1);
  expect(reviewGeneratedVideo).toHaveBeenCalledWith({ videoPath: join(root, "assets", "motion.mp4"),
    keyframePath: join(root, "assets", "key.png"), instruction: actualPrompt });
  expect(db.prepare("SELECT status,prompt,resolution FROM generation_attempts WHERE operation=?").get(operation === "draft" ? "generate_draft" : "generate_final_video"))
    .toMatchObject({ status: "hold_for_review", prompt: actualPrompt, resolution: "720p" });
  expect(db.prepare("SELECT COUNT(*) AS n FROM clips").get()!.n).toBe(0);
  expect(db.prepare("SELECT COUNT(*) AS n FROM production_audio_assets").get()!.n).toBe(0);
});

it("uses the submitted motion request when an older draft adapter omits prompt provenance", async () => {
  const generateDraft = vi.fn(async (_request: ShotRequest) => ({ status: "accepted" as const, media: { path: "motion.mp4" },
    cost: { usd: 0.33 }, provenance: { provider: "fixture", model: "legacy", prompt: "" } }));
  await generateShotDraft(db, "p", "shot", { generateDraft, generateGuided: vi.fn() });
  const instruction = vi.mocked(reviewGeneratedVideo).mock.calls[0]![0].instruction;
  expect(instruction).toBe(generateDraft.mock.calls[0]![0].prompt);
  expect(instruction).toContain("The grazing herd starts to move.");
  expect(instruction).not.toContain("gate hardware");
  expect(db.prepare("SELECT resolution FROM generation_attempts WHERE operation='generate_draft'").get()!.resolution).toBe("360p");
});
it("requests ten seconds of new local coverage and retains the verified review-input proof without selecting held picture or audio", async () => {
  const proof = { originalPath: "motion.mp4", originalSha256: "fixture-original", path: "motion.mp4.picture-review-proxy.mp4", sha256: "fixture-proxy", provenancePath: "motion.mp4.picture-review-proxy.mp4.json" };
  vi.mocked(reviewGeneratedVideo).mockResolvedValueOnce({ verdict: { pass: true,confidence: 70,reason: "Synthetic visible picture; uncalibrated low score retained" },costUsd: .01,reviewInput: proof });
  const generate = vi.fn(async()=>({ status: "accepted" as const,media: { path: "motion.mp4" },cost: { usd: 0 },provenance: { provider: "ltx_local",model: "fixture",prompt: "Actual ten-second motion" } }));
  const result = await generateNonSpeakingVideoCandidate(db,"p","shot",{ primaryBackend: "ltx",ltx: { generateFinal: generate } } as any,{ durationSeconds: 10,allowDraftFallback: false });
  expect(generate).toHaveBeenCalledTimes(1); expect(generate.mock.calls[0]![1]).toMatchObject({ durationSeconds: 10,resolution: "720p" });
  expect(result).toMatchObject({ status: "candidate",reviewPassed: false,reviewInput: proof });
  const saved = db.prepare("SELECT payload FROM edit_commands WHERE command_type='retain_review_media_input'").get()!;
  expect(JSON.parse(String(saved.payload))).toMatchObject({ projectId: "p",shotId: "shot",reviewInput: proof });
  expect(db.prepare("SELECT COUNT(*) n FROM clips").get()!.n).toBe(0); expect(db.prepare("SELECT COUNT(*) n FROM production_audio_assets").get()!.n).toBe(0);
});
it("holds an unsupported ten-second backend request before any provider submission", async()=>{
  const generate = vi.fn();
  await expect(generateNonSpeakingVideoCandidate(db,"p","shot",{ primaryBackend: "veo",veo: { generateFinal: generate } } as any,{ durationSeconds: 10 })).rejects.toThrow("configured local LTX");
  expect(generate).not.toHaveBeenCalled(); expect(db.prepare("SELECT COUNT(*) n FROM video_generation_jobs").get()!.n).toBe(0);
});
it("forwards and retains the provider-pinned ending reference without inventing an endpoint",async()=>{
  const sha256="a".repeat(64),reference={path:join(root,"assets","end.png"),sha256};
  vi.mocked(reviewGeneratedVideo).mockResolvedValueOnce({verdict:{pass:true,confidence:70,reason:"Synthetic endpoint evidence retained"},costUsd:.01,endFrameReference:reference});
  const generate=vi.fn(async()=>({status:"accepted" as const,media:{path:"motion.mp4"},cost:{usd:0},provenance:{provider:"ltx_local",model:"fixture",prompt:"Run from START to END"},metadata:{sourceEndKeyframe:"end.png",sourceEndKeyframeSha256:sha256}}));
  const result=await generateNonSpeakingVideoCandidate(db,"p","shot",{primaryBackend:"ltx",ltx:{generateFinal:generate}} as any);
  expect(reviewGeneratedVideo).toHaveBeenCalledWith(expect.objectContaining({endFrameReference:reference}));
  expect(result).toMatchObject({reviewPassed:false,endFrameReference:reference});
  expect(JSON.parse(String(db.prepare("SELECT payload FROM edit_commands WHERE command_type='retain_review_media_input'").get()!.payload))).toMatchObject({endFrameReference:reference});
  expect(db.prepare("SELECT COUNT(*) n FROM clips").get()!.n).toBe(0);
});
it.each(["../outside.png","C:/outside.png"])("holds unsafe provider endpoint %s before a review submission while retaining the returned take",async path=>{
  const generate=vi.fn(async()=>({status:"accepted" as const,media:{path:"motion.mp4"},cost:{usd:0},provenance:{provider:"ltx_local",model:"fixture",prompt:"Actual returned motion"},metadata:{sourceEndKeyframe:path,sourceEndKeyframeSha256:"a".repeat(64)}}));
  const result=await generateNonSpeakingVideoCandidate(db,"p","shot",{primaryBackend:"ltx",ltx:{generateFinal:generate}} as any);
  expect(generate).toHaveBeenCalledTimes(1);expect(reviewGeneratedVideo).not.toHaveBeenCalled();expect(result).toMatchObject({status:"candidate",reviewPassed:false});
  expect(db.prepare("SELECT status FROM generation_attempts WHERE operation='generate_final_video'").get()!.status).toBe("hold_for_review");
  expect(String(db.prepare("SELECT note FROM review_notes ORDER BY created_at DESC LIMIT 1").get()!.note)).toContain("outside project assets");
});
