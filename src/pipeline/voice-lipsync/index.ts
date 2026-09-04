import type { Stage } from "../types.js";

/**
 * Stage 5: Voice & lip-sync — produce per-character speech audio and
 * lip-sync it via the Kling adapter. Only speaking characters need a
 * voice mapping (see docs/design/character-tool.md's Voice Mapping
 * section) — this stage should skip any character with no line in a
 * given shot rather than requiring one universally. NOT YET IMPLEMENTED.
 */
export const runVoiceLipSync: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Voice & lip-sync stage not yet implemented (project ${projectId}).`
  };
};
