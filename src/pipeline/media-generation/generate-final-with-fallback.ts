/**
 * Retry-then-fallback wrapper around VideoProvider.generateFinal (Veo) --
 * built 2026-09-09 after a real finding while piloting Scene 1 Shot 7's
 * master beat: Veo's RAI safety filter rejected a keyframe showing the
 * paralytic lying prone in a crowd (likely read as a collapsed/medical-
 * emergency scene), consistently on the original keyframe (2/2 failures,
 * both the lite and full Veo model), but the SAME edited keyframe (head
 * propped, eyes open and alert -- a targeted ImageEditor.editRegion fix)
 * succeeded once and then failed once on retry. That's a real, load-
 * bearing empirical finding: the filter has a probabilistic component,
 * not a hard deterministic trigger -- an edit can improve the odds
 * without guaranteeing a pass, so a single failed attempt must not be
 * treated as a final verdict.
 *
 * Three tiers, in order, per Dan's explicit direction (2026-09-09):
 * 1. Retry Veo a few times (cheap -- a filtered attempt isn't charged).
 * 2. Fall back to Kling's plain scene image2video (a DIFFERENT endpoint
 *    from its Avatar lip-sync one -- see providers/kling/index.ts).
 *    Confirmed empirically to succeed at a real 1280x720 on the EXACT
 *    keyframe that tripped Veo's filter twice -- Kling and Veo evidently
 *    don't share a content-filter threshold, so this recovers real 720p
 *    quality in exactly the case Veo can't handle, instead of dropping
 *    straight to a draft.
 * 3. Only if BOTH Veo and Kling fail does this fall back to Omni's 360p
 *    draft tier (DraftVideoProvider.generateDraft) -- last resort, per
 *    Dan: "let's avoid the 360p quality whenever we can."
 *
 * Deliberately NOT a method on any one provider: retry/fallback
 * orchestration across three different provider interfaces is pipeline-
 * layer policy, not a single provider's concern -- same separation this
 * codebase already keeps between provider adapters and the pipeline
 * stages that combine them.
 */
import type { AssetRef, DraftVideoProvider, GenerationResult, ShotRequest, VideoProvider } from "../../providers/types.js";

export const MAX_VEO_ATTEMPTS = 3;

/** Veo's RAI content filter surfaces as a "no video sample" error from
 *  GeminiVideoProvider.generateFinal (see its own error message), not as
 *  a thrown exception with a distinct type -- matching on that message is
 *  the only way to tell "the filter rejected this" apart from a real
 *  failure (bad auth, network error, malformed request) that retrying
 *  identically would never fix and should propagate immediately instead. */
export function isRaiFilterFailure(err: unknown): boolean {
  return err instanceof Error && /finished with no video sample|raiMediaFilteredReasons/.test(err.message);
}

export type FallbackTier = "veo" | "kling_scene" | "omni_draft";

export interface FallbackResult extends GenerationResult {
  /** Which tier actually produced the accepted result -- callers should
   *  treat "omni_draft" as a real quality downgrade (360p) worth
   *  surfacing, and "kling_scene" as a provider-of-record change worth
   *  recording even though it's still 720p. */
  tier: FallbackTier;
  veoAttempts: number;
}

export async function generateFinalVideoWithFallback(
  videoProvider: VideoProvider,
  klingSceneProvider: VideoProvider,
  draftProvider: DraftVideoProvider,
  request: ShotRequest,
  opts: { resolution?: "720p" | "1080p"; startFrame?: AssetRef; durationSeconds?: number }
): Promise<FallbackResult> {
  let veoAttempts = 0;
  for (let attempt = 1; attempt <= MAX_VEO_ATTEMPTS; attempt++) {
    veoAttempts = attempt;
    try {
      const result = await videoProvider.generateFinal(request, opts);
      return { ...result, tier: "veo", veoAttempts };
    } catch (err) {
      if (!isRaiFilterFailure(err)) throw err;
    }
  }

  // Kling's own failure messages have a different shape than Veo's RAI
  // filter (isRaiFilterFailure doesn't apply here) -- by this point Veo
  // has already exhausted its retries, so ANY Kling failure (content
  // filter, transient API error, or otherwise) falls through to the
  // Omni draft as the true last resort, rather than trying to
  // distinguish Kling's specific failure reasons before deciding to
  // degrade further.
  try {
    const klingResult = await klingSceneProvider.generateFinal(request, opts);
    return { ...klingResult, tier: "kling_scene", veoAttempts };
  } catch {
    // fall through to Omni
  }

  const draftResult = await draftProvider.generateDraft(request, { startFrame: opts.startFrame });
  return { ...draftResult, tier: "omni_draft", veoAttempts };
}
