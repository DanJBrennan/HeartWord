export const REVIEW_FRAME_INDEX_BASE: 0;
export function decodedFrameClock(mediaTime: number, frameRate: number): {
  frameIndex: number;
  seconds: number;
  frameRate: number;
  indexBase: 0;
};
export function formatReviewTimecode(seconds: number): string;
