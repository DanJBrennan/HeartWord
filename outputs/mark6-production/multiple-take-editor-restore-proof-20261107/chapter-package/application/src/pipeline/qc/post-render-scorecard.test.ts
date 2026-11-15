import { expect, it } from "vitest";
import { postRenderPromotionHolds } from "./post-render-scorecard.js";

const clear = {
  flashes_le5frames: [], static_shots_ge3s: [], near_duplicate_pairs: [],
  unintended_sub_1p5s_shots: [], within_scene_large_colour_jumps: [], regression_failures: [],
  minimum_minute_p10_db: -42, breath_levels_db: [-40, -36], audio_sample_rate_hz: 48000
};
it("passes only a 48 kHz cut with audible breaths and no visual recurrence candidates", () => {
  expect(postRenderPromotionHolds(clear)).toEqual([]);
});
it("holds recurrence, colour and short-insert regressions, an inaudible program-minute floor, and delivery defects without changing the edit", () => {
  expect(postRenderPromotionHolds({
    ...clear, flashes_le5frames:[1], static_shots_ge3s:[1], near_duplicate_pairs:[1],
    unintended_sub_1p5s_shots:[1], within_scene_large_colour_jumps:[1], regression_failures:[1],
    minimum_minute_p10_db:-47, breath_levels_db:[-50], audio_sample_rate_hz:96000
  })).toHaveLength(9);
});
