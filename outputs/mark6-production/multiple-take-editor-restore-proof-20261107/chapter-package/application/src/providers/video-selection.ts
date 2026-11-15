import { GeminiDraftVideoProvider, GeminiVideoProvider } from "./gemini/index.js";
import { KlingVideoProvider } from "./kling/index.js";
import { LtxVideoProvider } from "./ltx/index.js";
import type { DraftVideoProvider, VideoProvider } from "./types.js";

export type VideoBackend = "ltx" | "veo" | "kling";
export interface VideoProviders {
  /** Absent only for older explicitly Veo-based production scripts. */
  primaryBackend?: VideoBackend;
  ltx?: VideoProvider;
  veo: VideoProvider;
  kling: VideoProvider;
  draft: DraftVideoProvider;
}
export function videoBackend(value: unknown = process.env.HEARTWORD_VIDEO_PROVIDER ?? "ltx"): VideoBackend {
  if (value !== "ltx" && value !== "veo" && value !== "kling") throw new Error("Video provider must be ltx, veo, or kling.");
  return value;
}
export function createVideoProviders(backend?: unknown): VideoProviders {
  return { primaryBackend: videoBackend(backend), ltx: new LtxVideoProvider(), veo: new GeminiVideoProvider(), kling: new KlingVideoProvider(), draft: new GeminiDraftVideoProvider() };
}
