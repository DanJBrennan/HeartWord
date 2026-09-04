import type { Stage } from "../types.js";

/** Stage 4: Media generation — generate visual content per shot via the
 *  provider interfaces in src/providers/. See docs/design/media-generation.md.
 *  NOT YET IMPLEMENTED — providers are wired but their HTTP calls aren't. */
export const runMediaGeneration: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Media generation stage not yet implemented (project ${projectId}).`
  };
};
