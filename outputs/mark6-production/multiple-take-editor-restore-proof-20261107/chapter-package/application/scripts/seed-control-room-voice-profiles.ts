import { getDb } from "../src/db/client.js";
import { seedControlRoomVoiceProfiles } from "../src/server/control-room-voice-profiles.js";

const inserted = seedControlRoomVoiceProfiles(getDb());
console.log(`Control-room voice profiles saved: ${inserted} new, ${19 - inserted} already present.`);
