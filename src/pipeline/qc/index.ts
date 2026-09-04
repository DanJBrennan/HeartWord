import type { Stage } from "../types.js";

/**
 * Stage 7: Quality control. v1 runs only the structural checks (sync
 * drift, coverage, lip-sync confidence) rather than the full evolving
 * media-review rubric in docs/design/automated-quality-control.md.
 * NOT YET IMPLEMENTED.
 */
export const runQualityControl: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `QC stage not yet implemented (project ${projectId}).`
  };
};
