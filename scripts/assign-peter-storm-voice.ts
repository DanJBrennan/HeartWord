/** Records Dan's approved ElevenLabs casting choice for Peter. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const db = getDb();
const peter = db.prepare("SELECT id FROM characters WHERE name='Peter' AND canon_status='approved'").get() as { id: string } | undefined;
if (!peter) throw new Error("Approved Peter canon record is missing.");
const version = db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").get(peter.id) as { id: string } | undefined;
if (!version) throw new Error("Approved Peter character version is missing.");

const voiceId = "ZthjuvLPty3kTMaNKVKb"; // ElevenLabs account voice named “Peter”
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE character_versions SET voice_provider='elevenlabs', voice_id=? WHERE id=?").run(voiceId, version.id);
  db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES (?,?,'character_version',?,'human',?,1,?)`).run(
      randomUUID(), "8a5659a4-b033-4d5f-80e2-904b217cf8a0", version.id,
      "Dan Brennan approved ElevenLabs voice ‘Peter’ for Peter’s source-bound Mark 4:38 plea after reviewing the available account voices.", Date.now()
    );
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }

console.log(JSON.stringify({ character: "Peter", voiceProvider: "elevenlabs", voice: "Peter" }, null, 2));
