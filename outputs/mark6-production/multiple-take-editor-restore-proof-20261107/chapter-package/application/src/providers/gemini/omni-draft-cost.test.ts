import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { omniDraftCostUsd } from "./index.js";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function clip(seconds: number): string {
  directory = mkdtempSync(join(tmpdir(), "hw-omni-cost-"));
  const path = join(directory, `draft-${seconds}s.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=blue:s=160x90:r=24:d=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
  return path;
}

it.skipIf(!ffmpeg)("prices a draft against the clip's real measured length, not a flat rate", () => {
  // Omni has no duration parameter -- it decides the length -- so a flat
  // per-draft rate mispriced every clip that wasn't the assumed length.
  expect(omniDraftCostUsd(clip(5))).toBeCloseTo(0.17, 10); // 5s * $0.033
});

it.skipIf(!ffmpeg)("scales with duration, so a longer draft costs proportionally more", () => {
  const short = omniDraftCostUsd(clip(2));
  rmSync(directory, { recursive: true, force: true });
  const long = omniDraftCostUsd(clip(8));
  expect(short).toBeCloseTo(0.07, 10); // 2s * $0.033
  expect(long).toBeCloseTo(0.26, 10);  // 8s * $0.033
  expect(long).toBeGreaterThan(short);
});

it("records zero rather than an invented duration when the clip cannot be probed", () => {
  // The clip is already generated and written by this point, so a pricing
  // lookup must never throw away real work.
  expect(omniDraftCostUsd(join(tmpdir(), "hw-omni-cost-does-not-exist.mp4"))).toBe(0);
});
