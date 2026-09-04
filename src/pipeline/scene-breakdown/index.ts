import type { Stage } from "../types.js";

/** Stage 2: Scene breakdown — split the aligned chapter into scenes and lines.
 *  See docs/ARCHITECTURE.md pipeline stage 2. NOT YET IMPLEMENTED. */
export const runSceneBreakdown: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Scene breakdown stage not yet implemented (project ${projectId}).`
  };
};
