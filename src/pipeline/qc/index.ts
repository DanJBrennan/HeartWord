import type { Stage } from "../types.js";
import { applyFinishing, finishingRecipe, reviewChapter } from "../assembly/finishing.js";
import { generateRequestedSoundtrack } from "../assembly/soundtrack.js";
import { getDataDir, getDb } from "../../db/client.js";
import { loadCrewBrief } from "../creative-direction/crew-context.js";
import { assertEditionInputsCurrent } from "../language-edition.js";

/**
 * Stage 7: structural checks and specialist viewing/listening of the actual cut.
 */
export const runQualityControl: Stage = projectId => observeWork(projectId, "qc", () => runQualityControlImpl(projectId));
const runQualityControlImpl: Stage = async (projectId) => {
  try {
    const context=getDb();
    if(typeof context.prepare==="function")assertEditionInputsCurrent(context,getDataDir(),projectId);
    // One bounded finishing cycle: review, obtain approved cues if needed,
    // mix once, then independently view/listen to the resulting film.
    let result = await reviewChapter(projectId, 17);
    if (result.status === "awaiting_assets") {
      const generated = await generateRequestedSoundtrack(projectId, result.runId);
      // A failed optional cue remains in history. Give the crew one final
      // chance to approve the actual cut with accepted assets only; a truly
      // indispensable missing sound becomes a blocking finding there.
      result = await reviewChapter(projectId, 17, { existingSoundtrackOnly: true });
      if (result.status !== "approved" && generated.failures.length)
        return { ok: false, reasoning: `${result.summary} Soundtrack holds: ${generated.failures.join(" ")}` };
    }
    if (result.status !== "approved") return { ok: false, reasoning: result.summary };
    const db = getDb(), dataDir = getDataDir(), brief = loadCrewBrief(db, dataDir, projectId, "finishing");
    const recipe = finishingRecipe(brief, result);
    if (!recipe.inputs.length && recipe.filter === "[0:v]null[picture];[0:a]anull[sound]" && !brief.render?.finishing) return { ok: true, reasoning: result.summary };
    applyFinishing(db, dataDir, projectId, result.runId);
    const finalReview = await reviewChapter(projectId, 17, { existingSoundtrackOnly: true });
    if (finalReview.status !== "approved") return { ok: false, reasoning: `Finished cut saved for review. ${finalReview.summary}` };
    const reviewed = finishingRecipe(loadCrewBrief(db, dataDir, projectId, "finishing"), finalReview);
    if (JSON.stringify(reviewed) !== JSON.stringify(recipe)) return { ok: false, reasoning: "The finished cut was reviewed and further changes were proposed. They are saved; this run stops after one mix to avoid an open-ended generation loop." };
    return { ok: true, reasoning: finalReview.summary };
  } catch (error) { return { ok: false, reasoning: `Chapter review incomplete: ${(error as Error).message}` }; }
};
import { observeWork } from "../observed-work.js";
