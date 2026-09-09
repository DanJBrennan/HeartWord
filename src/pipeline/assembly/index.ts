import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { assembleChapter } from "./assemble-chapter.js";

/** Stage 6: Assembly & timeline — combine every shot's own already-
 *  assembled clip into one continuous chapter video. See
 *  docs/design/timeline.md and assemble-chapter.ts's header for the
 *  real v1 scope (hard cuts only -- no spaced_production editorial gaps
 *  yet, since that layer doesn't exist). */
export const runAssembly: Stage = async (projectId) => {
  const db = getDb();
  try {
    const result = assembleChapter(db, projectId);
    return {
      ok: true,
      reasoning:
        `Chapter assembly for project ${projectId}: concatenated ${result.shotCount} shot(s) into one ` +
        `${(result.totalDurationMs / 1000).toFixed(1)}s video at ${join(getDataDir(), "assets", result.assembledVideoPath)}. ` +
        `Hard cuts only -- no spaced_production editorial gaps between shots yet.`
    };
  } catch (err) {
    return { ok: false, reasoning: `Chapter assembly failed for project ${projectId}: ${(err as Error).message}` };
  }
};
