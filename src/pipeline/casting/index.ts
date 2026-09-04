import type { Stage } from "../types.js";

/**
 * Stage 3: Casting & direction — for each scene, select which canon
 * characters appear and decide the action/blocking. v1 runs this as a
 * single AI planning pass (see the "v1 simplification" callout in
 * docs/ARCHITECTURE.md) rather than the full multi-agent negotiation in
 * docs/design/shot-planning.md. NOT YET IMPLEMENTED.
 */
export const runCasting: Stage = async (projectId) => {
  return {
    ok: false,
    reasoning: `Casting & direction stage not yet implemented (project ${projectId}).`
  };
};
