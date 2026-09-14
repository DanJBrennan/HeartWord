import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CONTROL_ROOM_VOICE_PROFILES, recastControlRoomVoiceProfiles, seedControlRoomVoiceProfiles } from "./control-room-voice-profiles.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE control_room_voice_profiles (
    agent_name TEXT PRIMARY KEY, role TEXT NOT NULL, tier_status TEXT NOT NULL,
    voice_provider TEXT NOT NULL, voice_id TEXT NOT NULL, delivery_instructions TEXT NOT NULL,
    presentation_only INTEGER NOT NULL DEFAULT 1 CHECK (presentation_only = 1),
    source_reference TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  return db;
}

describe("control-room voice profiles", () => {
  it("preserves one presentation-only profile for every named control-room agent", () => {
    const db = database();
    expect(CONTROL_ROOM_VOICE_PROFILES).toHaveLength(21);
    expect(CONTROL_ROOM_VOICE_PROFILES.find(profile => profile.agentName === "Gene Siskel")?.deliveryInstructions).toContain("not an imitation");
    expect(CONTROL_ROOM_VOICE_PROFILES.find(profile => profile.agentName === "Roger Ebert")?.deliveryInstructions).toContain("not an imitation");
    expect(seedControlRoomVoiceProfiles(db, 1)).toBe(21);
    expect(db.prepare("SELECT COUNT(*) AS n FROM control_room_voice_profiles WHERE presentation_only = 1").get()).toEqual({ n: 21 });
    expect(seedControlRoomVoiceProfiles(db, 2)).toBe(0);
    db.prepare("UPDATE control_room_voice_profiles SET voice_id = 'cedar' WHERE agent_name = 'Mabel'").run();
    expect(recastControlRoomVoiceProfiles(db, 3)).toBe(21);
    expect(db.prepare("SELECT voice_id, voice_provider FROM control_room_voice_profiles WHERE agent_name = 'Mabel'").get()).toEqual({ voice_id: CONTROL_ROOM_VOICE_PROFILES.find(profile => profile.agentName === "Mabel")?.voiceId, voice_provider: "elevenlabs" });
  });
});
