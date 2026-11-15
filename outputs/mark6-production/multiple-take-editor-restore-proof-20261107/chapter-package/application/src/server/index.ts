import "dotenv/config";
import { getDb } from "../db/client.js";
import { createHeartWordApp } from "./app.js";
import { seedControlRoomPresentationBriefs } from "./control-room-presentation-briefs.js";
import { seedControlRoomRedTeamFindings } from "./control-room-red-team-findings.js";

// Ensure the DB (and schema) is ready before the server accepts requests.
const db = getDb();
seedControlRoomPresentationBriefs(db);
seedControlRoomRedTeamFindings(db);

const app = createHeartWordApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, "127.0.0.1", () => {
  console.log(`HeartWord Studio: http://127.0.0.1:${port} (production and editing controls enabled)`);
});
