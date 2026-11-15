/**
 * Crops a keyframe to a fixed pixel box -- built 2026-09-09 after Dan
 * caught a real Kling Avatar problem in the Scene 1 Shot 7 pilot: the
 * lip-sync inserts used a medium-close keyframe with BOTH Jesus and the
 * scribe's face clearly visible, and Kling's Avatar API lip-synced both
 * faces to Jesus's audio rather than only the intended speaker. Cropping
 * tight enough that only the speaking character's face is visible fixes
 * this at the source, cheaper and more reliably than trying to instruct
 * Kling to pick one face.
 *
 * Deliberately a manual, per-image pixel box rather than automatic face
 * detection -- there's no face-detection dependency in this codebase yet,
 * and guessing crop coordinates from an LLM's own spatial reasoning about
 * an image is unreliable. This is a real, known limitation: every
 * lip-sync keyframe with more than one visible face needs someone (human
 * or Claude, looking at the actual image) to pick a crop box, not
 * something this function does on its own.
 *
 * Enforces a 16:9-ish crop box -- a second real finding from that same
 * pilot: Kling's Avatar API preserves the INPUT image's own aspect ratio
 * in its output (confirmed empirically: a 480x700 crop came back as a
 * 784x1152 video, a 850x750 crop as 1008x896), so a crop box picked
 * without attention to aspect ratio produces a non-16:9 clip that then
 * needs rescaling in assembly -- and a naive rescale there can crop the
 * speaker's own face out of frame (also confirmed: see
 * assemble-covered-shot.ts's header). Keeping every crop close to 16:9
 * from the start avoids that whole class of problem rather than fighting
 * it downstream.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TARGET_ASPECT_RATIO = 16 / 9;
// How far off 16:9 a crop box may be before this refuses to use it.
// +/-8% comfortably covers integer-pixel rounding (a 780x439 box is
// 1.7767 vs 16:9's 1.7778, well inside this) while still catching a
// genuinely wrong box (480x700 is 0.686 -- more than 3x off).
export const MAX_ASPECT_RATIO_DEVIATION = 0.08;

export interface AspectRatioCheck {
  aspectRatio: number;
  deviation: number;
  ok: boolean;
}

/** Pure check, split out from cropKeyframe so it's testable without
 *  invoking ffmpeg. */
export function checkAspectRatio(box: Pick<CropBox, "width" | "height">): AspectRatioCheck {
  const aspectRatio = box.width / box.height;
  const deviation = Math.abs(aspectRatio - TARGET_ASPECT_RATIO) / TARGET_ASPECT_RATIO;
  return { aspectRatio, deviation, ok: deviation <= MAX_ASPECT_RATIO_DEVIATION };
}

export function cropKeyframe(sourcePath: string, box: CropBox, outPath: string): void {
  const check = checkAspectRatio(box);
  if (!check.ok) {
    throw new Error(
      `cropKeyframe: box ${box.width}x${box.height} is ${check.aspectRatio.toFixed(3)}:1, too far from 16:9 ` +
        `(${TARGET_ASPECT_RATIO.toFixed(3)}:1) -- Kling's Avatar API preserves this ratio in its output, so a ` +
        `crop this far off 16:9 will produce a clip that's hard to fit back into the timeline without cropping ` +
        `the speaker's face out. Pick a box with width/height closer to 16:9 (e.g. width = height * 16/9).`
    );
  }
  mkdirSync(dirname(outPath), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-n",
      "-i",
      sourcePath,
      "-vf",
      `crop=${box.width}:${box.height}:${box.x}:${box.y}`,
      "-frames:v",
      "1",
      "-update",
      "1",
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}
