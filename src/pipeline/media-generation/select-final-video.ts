import type { ShotRequest, VideoGenerationOptions } from "../../providers/types.js";
import type { VideoProviders } from "../../providers/video-selection.js";
import { generateFinalVideoWithFallback, type FallbackResult } from "./generate-final-with-fallback.js";

export type SelectedVideoResult = Omit<FallbackResult, "tier"> & { tier: FallbackResult["tier"] | "ltx_local" };
export async function generateSelectedFinalVideo(providers: VideoProviders, request: ShotRequest, opts: VideoGenerationOptions & { allowKlingSceneFallback?: boolean; allowDraftFallback?: boolean }): Promise<SelectedVideoResult> {
  const backend = providers.primaryBackend ?? "veo";
  if (backend === "ltx") {
    if (!providers.ltx) throw new Error("LTX video provider was selected but is unavailable.");
    const result = await providers.ltx.generateFinal(request, opts);
    return { ...result, tier: "ltx_local", veoAttempts: 0, fallbackReason: "Local LTX Fast selected; no paid video fallback used." };
  }
  if (opts.resolution === "540p") throw new Error("540p is currently available only through local LTX Fast.");
  if (backend === "kling") {
    const result = await providers.kling.generateFinal(request, opts);
    return { ...result, tier: "kling_scene", veoAttempts: 0, fallbackReason: "Kling scene generation explicitly selected for comparison." };
  }
  return generateFinalVideoWithFallback(providers.veo, providers.kling, providers.draft, request, { ...opts, resolution: opts.resolution });
}
