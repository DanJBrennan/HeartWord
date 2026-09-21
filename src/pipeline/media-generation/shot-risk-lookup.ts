import type { DatabaseSync } from "node:sqlite";
import type { VideoTier } from "../../providers/types.js";
import { assessShotRisk, type ShotRiskAssessment } from "../casting/shot-risk.js";
import type { CameraMovement, CrowdDensity, Framing } from "../casting/coverage.js";

/** Reads one shot's own risk facts and assesses it -- the database half of
 *  casting/shot-risk.ts, kept out of that module so the rule itself stays
 *  pure and directly testable. */
export function shotRiskFor(db: DatabaseSync, shotId: string): ShotRiskAssessment {
  const shot = db.prepare(
    "SELECT framing, camera_movement, crowd_density FROM shots WHERE id = ?"
  ).get(shotId) as {
    framing: string | null; camera_movement: string | null; crowd_density: string | null;
  } | undefined;
  if (!shot) throw new Error("Cannot assess risk for a shot that is not in this project's plan.");
  const characterCount = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM shot_characters WHERE shot_id = ?").get(shotId) as { n: number }).n
  );
  return assessShotRisk({
    framing: shot.framing as Framing | null,
    cameraMovement: shot.camera_movement as CameraMovement | null,
    crowdDensity: shot.crowd_density as CrowdDensity | null,
    characterCount
  });
}

/** Render tier for a risk tier. Routine work takes the cheapest render;
 *  only a genuinely risky frame buys a better one. */
export function tierForRisk(assessment: ShotRiskAssessment): VideoTier {
  return assessment.tier === "critical" ? "premium" : assessment.tier === "elevated" ? "standard" : "economy";
}
