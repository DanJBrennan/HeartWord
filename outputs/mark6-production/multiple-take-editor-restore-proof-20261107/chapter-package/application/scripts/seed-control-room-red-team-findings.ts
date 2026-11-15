import { getDb } from "../src/db/client.js";
import { seedControlRoomRedTeamFindings } from "../src/server/control-room-red-team-findings.js";

const inserted = seedControlRoomRedTeamFindings(getDb());
console.log(`Control-room Red Team findings saved: ${inserted} new.`);
