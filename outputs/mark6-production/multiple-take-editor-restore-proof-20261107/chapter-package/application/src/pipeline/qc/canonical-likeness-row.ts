export interface ShotCharacterCheckRow {
  shot_id: string;
  character_name: string;
  reference_path: string | null;
  generation_attempt_id: string;
  generated_path: string;
}

export function findFailedShotCharacterRow(
  rows: readonly ShotCharacterCheckRow[],
  failure: { shotId: string; characterName: string }
): ShotCharacterCheckRow | undefined {
  return rows.find((row) => row.shot_id === failure.shotId && row.character_name === failure.characterName);
}
