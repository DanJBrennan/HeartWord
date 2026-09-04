/**
 * Kling.ai Avatar API adapter (LipSyncProvider) — authenticated with
 * KLING_API_KEY_1 (see .env.example). Whether the "_1" suffix implies a
 * multi-key pool is still an open question — see "Open implementation
 * questions" in docs/ARCHITECTURE.md; this adapter takes a single key for
 * now and can grow key-pool logic later without changing its interface.
 *
 * NOT YET IMPLEMENTED: interface wiring only — see gemini/index.ts's note.
 */
import type { AssetRef, AudioSegmentRef, CharacterRef, GenerationResult, LipSyncProvider } from "../types.js";

function requireApiKey(): string {
  const key = process.env.KLING_API_KEY_1;
  if (!key) {
    throw new Error("KLING_API_KEY_1 is not set (see .env.example).");
  }
  return key;
}

export class KlingLipSyncProvider implements LipSyncProvider {
  async sync(_character: CharacterRef, _audio: AudioSegmentRef, _referenceFrame: AssetRef): Promise<GenerationResult> {
    requireApiKey();
    throw new Error("Kling adapter: sync (Avatar API lip-sync) is not implemented yet.");
  }
}
