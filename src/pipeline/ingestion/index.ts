import type { Stage } from "../types.js";

/**
 * Stage 1: Ingestion & alignment. Takes the chapter's source-language
 * audio and translated/latinized text, aligns text to audio timing.
 * See docs/ARCHITECTURE.md pipeline stage 1.
 *
 * NOT YET IMPLEMENTED — reads the project's source media (per
 * docs/plans/CURRENT_GOAL.md, already imported into
 * HEARTWORD_DATA_DIR/assets/source/hatam/mark-2/) and produces aligned
 * text/audio ranges. Needs an alignment approach chosen before real work
 * starts here — not decided yet.
 */
export const runIngestion: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Ingestion stage not yet implemented (project ${projectId}).`
  };
};
