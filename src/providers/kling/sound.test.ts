import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KlingFaceLipSyncProvider, KlingVideoProvider } from "./index.js";

let dataDir: string;
let originalKey: string | undefined;

vi.mock("../../db/client.js", () => ({ getDataDir: () => dataDir }));

beforeEach(() => {
  originalKey = process.env.KLING_API_KEY_1;
  process.env.KLING_API_KEY_1 = "offline-test-key";
  dataDir = mkdtempSync(join(tmpdir(), "heartword-kling-sound-"));
  mkdirSync(join(dataDir, "assets"));
  writeFileSync(join(dataDir, "assets", "start.png"), "fixture image");
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.KLING_API_KEY_1;
  else process.env.KLING_API_KEY_1 = originalKey;
  rmSync(dataDir, { recursive: true, force: true });
});

it("requests native sound for ordinary non-lip-sync image-to-video", async () => {
  let submitted: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    submitted = JSON.parse(init.body as string) as Record<string, unknown>;
    return { ok: false, status: 400, json: async () => ({ code: 400, message: "offline fixture" }) };
  }));

  await expect(new KlingVideoProvider().generateFinal(
    { shotId: "non-speaking", prompt: "A quiet exterior", characters: [] },
    { startFrame: { path: "start.png" } }
  )).rejects.toThrow("Kling image2video submit failed");
  expect(submitted?.sound).toBe("on");
});

it("keeps the face-sync preparation video silent before source speech is inserted", async () => {
  let submitted: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    submitted = JSON.parse(init.body as string) as Record<string, unknown>;
    return { ok: false, status: 400, json: async () => ({ code: 400, message: "offline fixture" }) };
  }));

  await expect(new KlingFaceLipSyncProvider().generateSceneVideo(
    { path: "start.png" }, "A speaking face", 5
  )).rejects.toThrow("Kling scene submit (for face lip-sync) failed");
  expect(submitted?.sound).toBe("off");
});
