import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { acceptFinalVideoCandidate, generateNonSpeakingVideoCandidate } from "../../src/pipeline/media-generation/final-video.js";

vi.mock("../../src/pipeline/creative-direction/crew-store.js", async original => ({
  ...await original<object>(), ...(await import("../helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture
}));
vi.mock("../../src/pipeline/qc/video-review.js", async original => ({
  ...await original<object>(),
  reviewGeneratedVideo: vi.fn(async () => ({ verdict: { pass: true, confidence: 95, reason: "Synthetic reviewed candidate" }, costUsd: 0.01 }))
}));
vi.mock("../../src/pipeline/media-generation/video-job-status.js", () => ({
  beginVideoJob: () => ({ progress: vi.fn(), finish: vi.fn() })
}));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES('p','hatam','mark',5,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES('s','p',1,'Mark 5:27','Mark 5:27',1);
    INSERT INTO shots(id,scene_id,sequence,action,created_at) VALUES('sh','s',1,'empty landscape',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES
      ('key','sh','mock','mock','generate','accepted','key.png',0,1),
      ('raw','sh','mock','mock','generate_final_video','hold_for_review','raw.mp4',0,2),
      ('prefix','sh','local_edit','ffmpeg','generate_final_video','accepted','prefix.mp4',0,3);
    INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES('selected','sh','prefix',0,750,3);
    INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
      VALUES('director','p','shot','sh','qc','Production Director approved edit: extend_existing: precontact coverage; target sh',0,4);`);
  const generateFinal = vi.fn(async () => ({ status: "accepted" as const, media: { path: "new.mp4" }, cost: { usd: 0 }, provenance: { provider: "mock", model: "mock", prompt: "Retained source-phase direction" } }));
  const providers = { primaryBackend: "ltx" as const, ltx: { generateFinal }, veo: { generateFinal }, kling: { generateFinal }, draft: { generateDraft: vi.fn() } };
  const policy = { additionalCoverage: { acceptedAttemptId: "prefix", requestNoteId: "director", reason: "The accepted 750ms leaves 3.5s of verified precontact narration uncovered." } };
  return { db, generateFinal, providers, policy };
}

describe("additional non-speaking source coverage", () => {
  it("retains the accepted prefix and raw history, reviews one new take, and holds repeat submission", async () => {
    const { db, generateFinal, providers, policy } = fixture();
    try {
      const before = db.prepare("SELECT * FROM generation_attempts ORDER BY id").all();
      expect((await generateNonSpeakingVideoCandidate(db, "p", "sh", providers)).status).toBe("reused");
      expect(generateFinal).not.toHaveBeenCalled();
      const result = await generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy);
      expect(result.status).toBe("candidate");
      if (result.status !== "candidate") throw new Error("Expected a candidate");
      expect(result.reviewPassed).toBe(true);
      expect(db.prepare("SELECT * FROM generation_attempts WHERE id IN('key','raw','prefix') ORDER BY id").all()).toEqual(before);
      expect(db.prepare("SELECT COUNT(*) n FROM clips").get()?.n).toBe(1);
      expect(db.prepare("SELECT note FROM review_notes WHERE note LIKE 'Final-video candidate %'").get()?.note).toContain('"requestNoteId":"director"');
      expect((await generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy)).status).toBe("held");
      expect(generateFinal).toHaveBeenCalledTimes(1);
      acceptFinalVideoCandidate(db, "p", result.attemptId, 8000);
      expect(db.prepare("SELECT COUNT(*) n FROM clips").get()?.n).toBe(2);
      expect(db.prepare("SELECT status FROM generation_attempts WHERE id='prefix'").get()?.status).toBe("accepted");
      expect(db.prepare("SELECT status FROM generation_attempts WHERE id='raw'").get()?.status).toBe("hold_for_review");
    } finally { db.close(); }
  });

  it.each(["missing_basis", "keyframe_basis", "missing_request", "human_note", "empty_reason"])("rejects unsupported extension authority: %s", async change => {
    const { db, generateFinal, providers, policy } = fixture();
    try {
      if (change === "missing_basis") policy.additionalCoverage.acceptedAttemptId = "absent";
      if (change === "keyframe_basis") policy.additionalCoverage.acceptedAttemptId = "key";
      if (change === "missing_request") policy.additionalCoverage.requestNoteId = "absent";
      if (change === "human_note") db.prepare("UPDATE review_notes SET source='human' WHERE id='director'").run();
      if (change === "empty_reason") policy.additionalCoverage.reason = " ";
      await expect(generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy)).rejects.toThrow(/coverage/i);
      expect(generateFinal).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it.each(["active", "held"])("preserves the local %s job guard", async status => {
    const { db, generateFinal, providers, policy } = fixture();
    try {
      db.prepare("INSERT INTO video_generation_jobs(id,project_id,shot_id,backend,status,updated_at)VALUES('job','p','sh','ltx',?,4)").run(status);
      expect((await generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy)).status).toBe("held");
      expect(generateFinal).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it("keeps the risky-shot draft prerequisite", async () => {
    const { db, generateFinal, providers, policy } = fixture();
    try {
      db.exec("UPDATE shots SET crowd_density='packed',camera_movement='push_in' WHERE id='sh'");
      expect((await generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy)).status).toBe("needs_draft");
      expect(generateFinal).not.toHaveBeenCalled();
    } finally { db.close(); }
  });

  it("rejects a historical basis preceding the current restart even when another current take exists", async () => {
    const { db, generateFinal, providers, policy } = fixture();
    try {
      db.exec(`INSERT INTO project_restart_cutovers(project_id,started_at,approved_by,reason)VALUES('p',5,'producer','test');
        INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)
          VALUES('current','sh','mock','mock','generate_final_video','accepted','current.mp4',0,6);
        INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('current-clip','sh','current',0,1000,6);`);
      await expect(generateNonSpeakingVideoCandidate(db, "p", "sh", providers, policy)).rejects.toThrow(/selected accepted take/);
      expect(generateFinal).not.toHaveBeenCalled();
    } finally { db.close(); }
  });
});
