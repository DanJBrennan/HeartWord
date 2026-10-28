import { beforeEach, expect, it, vi } from "vitest";
import { runQualityControl } from "../../src/pipeline/qc/index.js";
import { reviewChapter, applyFinishing, finishingRecipe } from "../../src/pipeline/assembly/finishing.js";
import { generateRequestedSoundtrack } from "../../src/pipeline/assembly/soundtrack.js";
vi.mock("../../src/pipeline/assembly/finishing.js", () => ({ reviewChapter: vi.fn(), applyFinishing: vi.fn(), finishingRecipe: vi.fn() }));
vi.mock("../../src/pipeline/assembly/soundtrack.js", () => ({ generateRequestedSoundtrack: vi.fn() }));
vi.mock("../../src/db/client.js", () => ({ getDb: () => ({}), getDataDir: () => "test" }));
vi.mock("../../src/pipeline/creative-direction/crew-context.js", () => ({ loadCrewBrief: () => ({ render: {} }) }));
const review = (status: "approved" | "awaiting_assets" | "held") => ({ status, runId: "run", calls: 7, summary: status, contributions: {} });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(finishingRecipe).mockReturnValue({ inputs: ["music"], filter: "reviewed", videoLabel: "v", audioLabel: "a" });
  vi.mocked(applyFinishing).mockReturnValue({ path: "finished", renderId: "finished" });
});
it("never generates or mixes over a review hold", async () => {
  vi.mocked(reviewChapter).mockResolvedValue(review("held"));
  expect((await runQualityControl("p")).ok).toBe(false);
  expect(generateRequestedSoundtrack).not.toHaveBeenCalled(); expect(applyFinishing).not.toHaveBeenCalled();
});
it("generates once, mixes once and watches the resulting film before completion", async () => {
  vi.mocked(reviewChapter).mockResolvedValueOnce(review("awaiting_assets")).mockResolvedValueOnce(review("approved")).mockResolvedValueOnce(review("approved"));
  vi.mocked(generateRequestedSoundtrack).mockResolvedValue({ accepted: 1, failures: [] });
  expect((await runQualityControl("p")).ok).toBe(true);
  expect(generateRequestedSoundtrack).toHaveBeenCalledTimes(1); expect(applyFinishing).toHaveBeenCalledTimes(1); expect(reviewChapter).toHaveBeenCalledTimes(3);
});
it("rechecks a failed optional audio attempt with accepted assets only", async () => {
  vi.mocked(reviewChapter).mockResolvedValue(review("awaiting_assets")); vi.mocked(generateRequestedSoundtrack).mockResolvedValue({ accepted: 0, failures: ["Uncertain provider request"] });
  expect((await runQualityControl("p")).reasoning).toContain("Uncertain");
  expect(reviewChapter).toHaveBeenCalledTimes(2);
  expect(reviewChapter).toHaveBeenLastCalledWith("p", 17, { existingSoundtrackOnly: true });
  expect(generateRequestedSoundtrack).toHaveBeenCalledTimes(1); expect(applyFinishing).not.toHaveBeenCalled();
});
it("retains further requested changes after the single mix instead of claiming completion", async () => {
  vi.mocked(reviewChapter).mockResolvedValue(review("approved"));
  vi.mocked(finishingRecipe).mockReturnValueOnce({ inputs: ["m"], filter: "first", videoLabel: "v", audioLabel: "a" }).mockReturnValueOnce({ inputs: ["m"], filter: "revised", videoLabel: "v", audioLabel: "a" });
  expect((await runQualityControl("p")).ok).toBe(false); expect(applyFinishing).toHaveBeenCalledTimes(1);
});
