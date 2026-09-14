import { getDb } from "../src/db/client.js";
import { recastControlRoomVoiceProfiles } from "../src/server/control-room-voice-profiles.js";

const updated = recastControlRoomVoiceProfiles(getDb());
console.log(`Control-room voice profiles recast: ${updated} updated.`);
