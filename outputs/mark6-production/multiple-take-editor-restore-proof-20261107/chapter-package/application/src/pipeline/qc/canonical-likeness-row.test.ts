import { describe, expect, it } from "vitest";
import { findFailedShotCharacterRow, type ShotCharacterCheckRow } from "./canonical-likeness-row.js";

describe("findFailedShotCharacterRow", () => {
  it("re-finds a failed character using the SQL row's snake_case character_name", () => {
    const row: ShotCharacterCheckRow = {
      shot_id: "shot-1",
      character_name: "Jesus",
      reference_path: "characters/jesus/headshot.png",
      generation_attempt_id: "attempt-1",
      generated_path: "generated/shot-1.png"
    };

    expect(findFailedShotCharacterRow([row], { shotId: "shot-1", characterName: "Jesus" })).toBe(row);
  });
});
