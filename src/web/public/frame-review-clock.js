/**
 * The single frame-addressing convention for browser review pages.
 *
 * Frame zero is the first decoded video frame. The clock is deliberately
 * derived from requestVideoFrameCallback's mediaTime, never currentTime:
 * currentTime is a seek/playback position and can be the end boundary of the
 * image currently painted.
 */
export const REVIEW_FRAME_INDEX_BASE = 0;

export function decodedFrameClock(mediaTime, frameRate) {
  if (!Number.isFinite(mediaTime) || mediaTime < 0) throw new Error("A non-negative decoded media time is required.");
  if (!Number.isFinite(frameRate) || frameRate <= 0) throw new Error("A positive frame rate is required.");
  const frameIndex = Math.round(mediaTime * frameRate);
  const seconds = frameIndex / frameRate;
  return { frameIndex, seconds, frameRate, indexBase: REVIEW_FRAME_INDEX_BASE };
}

export function formatReviewTimecode(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}
