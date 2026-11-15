import { getDb } from "../src/db/client.js";
import { seedControlRoomPresentationBriefs } from "../src/server/control-room-presentation-briefs.js";

const inserted = seedControlRoomPresentationBriefs(getDb());
console.log(`Control-room presentation briefs saved: ${inserted} new.`);
