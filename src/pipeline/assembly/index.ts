import type { Stage } from "../types.js";

/** Stage 6: Assembly & timeline — combine scenes, audio, and lip-synced
 *  video into one continuous chapter video. See docs/design/timeline.md.
 *  NOT YET IMPLEMENTED. */
export const runAssembly: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Assembly stage not yet implemented (project ${projectId}).`
  };
};
