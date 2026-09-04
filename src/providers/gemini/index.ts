/**
 * Google Gemini adapter: Nano Banana / Nano Banana Pro (ImageProvider),
 * Veo 3.1 Lite (VideoProvider), and Gemini Omni 1.1 (DraftVideoProvider +
 * ImageEditor) — one vendor family, one adapter module, per "Confirmed v1
 * providers" in docs/ARCHITECTURE.md. Authenticated with GEMINI_API_KEY
 * (see .env.example).
 *
 * NOT YET IMPLEMENTED: this is the interface wiring only. Each method's
 * actual HTTP call to the Gemini API is a separate, deliberately-scoped
 * follow-up (needs a real API key to develop and test against) — see
 * docs/plans/CURRENT_GOAL.md.
 */
import type {
  AssetRef,
  DraftVideoProvider,
  GenerationResult,
  ImageEditor,
  ImageProvider,
  ShotRequest,
  VideoProvider
} from "../types.js";

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set (see .env.example).");
  }
  return key;
}

function notImplemented(operation: string): never {
  throw new Error(`Gemini adapter: ${operation} is not implemented yet.`);
}

export class GeminiImageProvider implements ImageProvider {
  async generate(_request: ShotRequest, _opts?: { tier?: "standard" | "pro" }): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generate (Nano Banana / Nano Banana Pro)");
  }
}

export class GeminiImageEditor implements ImageEditor {
  async editRegion(_asset: AssetRef, _instruction: string): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("editRegion (Omni 1.1 targeted image editing)");
  }
}

export class GeminiVideoProvider implements VideoProvider {
  async generateFinal(_request: ShotRequest, _opts?: { resolution?: "720p" | "1080p" }): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generateFinal (Veo 3.1 Lite)");
  }
}

export class GeminiDraftVideoProvider implements DraftVideoProvider {
  async generateDraft(_request: ShotRequest): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generateDraft (Omni 1.1, 360p)");
  }

  async generateGuided(_startFrame: AssetRef, _endFrame: AssetRef, _request: ShotRequest): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generateGuided (Omni 1.1, start/end-keyframe)");
  }
}
