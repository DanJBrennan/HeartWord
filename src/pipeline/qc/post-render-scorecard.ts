/** Deterministic promotion holds derived from the Mark 4 v45 scorecard.
 * This is deliberately a gate, never an automatic repair mechanism. */
export type PostRenderScorecard = {
  flashes_le5frames: Array<unknown>;
  static_shots_ge3s: Array<unknown>;
  near_duplicate_pairs: Array<unknown>;
  /** Short picture inserts after storm-impact exemptions have been applied. */
  unintended_sub_1p5s_shots: Array<unknown>;
  /** Colour discontinuities only within a declared scene, never scene changes. */
  within_scene_large_colour_jumps: Array<unknown>;
  /** Previously repaired, named defects that appeared again in this render. */
  regression_failures: Array<unknown>;
  /** Minimum of each program-minute's 10th-percentile short-term level. */
  minimum_minute_p10_db: number | null;
  breath_levels_db: number[];
  audio_sample_rate_hz: number;
};

export function postRenderPromotionHolds(report: PostRenderScorecard): string[] {
  const holds: string[] = [];
  if (report.audio_sample_rate_hz !== 48000) holds.push(`Delivery audio is ${report.audio_sample_rate_hz} Hz; 48 kHz is required.`);
  if (report.flashes_le5frames.length) holds.push(`${report.flashes_le5frames.length} discontinuous flash candidate(s) require review.`);
  if (report.static_shots_ge3s.length) holds.push(`${report.static_shots_ge3s.length} near-frozen shot(s) require review.`);
  if (report.near_duplicate_pairs.length) holds.push(`${report.near_duplicate_pairs.length} non-adjacent duplicate candidate(s) require review.`);
  if (report.unintended_sub_1p5s_shots.length) holds.push(`${report.unintended_sub_1p5s_shots.length} unintended sub-1.5-second picture insert(s) require review.`);
  if (report.within_scene_large_colour_jumps.length) holds.push(`${report.within_scene_large_colour_jumps.length} within-scene colour discontinuity candidate(s) require review.`);
  if (report.regression_failures.length) holds.push(`${report.regression_failures.length} previously repaired defect(s) recurred in this render.`);
  if (report.minimum_minute_p10_db === null || report.minimum_minute_p10_db < -46) {
    holds.push(`Ambience floor's quietest program minute is ${report.minimum_minute_p10_db ?? "unmeasured"} dB; -46 dB or louder is required.`);
  }
  const outside = report.breath_levels_db.filter(level => level < -42 || level > -30);
  if (outside.length) holds.push(`${outside.length} editorial breath ambience level(s) fall outside -42 to -30 dB.`);
  return holds;
}
