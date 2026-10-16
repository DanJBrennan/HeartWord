import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { runProductionCrew } from "../creative-direction/crew-store.js";
import { assertEditorialRebuildable, renderEditorialCut } from "./render-editorial-cut.js";

/** Stage 6: a reviewed Picture Editor cut with protected source performance. */
export const runAssembly: Stage = projectId => observeWork(projectId, "assembly", () => runAssemblyImpl(projectId));
const runAssemblyImpl: Stage = async (projectId) => {
  const db = getDb();
  try {
    assertEditorialRebuildable(db, projectId);
    const review = await runProductionCrew(projectId, "editing", { maxCalls: 12 });
    if (review.status !== "approved") return { ok: false, reasoning: review.summary };
    const result = renderEditorialCut(db, getDataDir(), projectId, review.runId);
    return {
      ok: true,
      reasoning:
        `Picture Editor cut saved at ${join(getDataDir(), "assets", result.path)}. Source performance is preserved with the planned editorial pauses.`
    };
  } catch (err) {
    return { ok: false, reasoning: `Chapter assembly failed for project ${projectId}: ${(err as Error).message}` };
  }
};
import { observeWork } from "../observed-work.js";
