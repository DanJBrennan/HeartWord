import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { crewPacket, encodeCrewPacket } from "../src/pipeline/creative-direction/crew-packet.js";
import type { CrewBrief, CrewResult } from "../src/pipeline/creative-direction/crew-types.js";
import type { ProductionRecord } from "../src/pipeline/creative-direction/production-record.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const [database, output] = process.argv.slice(2);
if (!database || !output) throw new Error("Usage: measure-crew-context.ts <database> <new-report.json>");
const db = new DatabaseSync(database, { readOnly: true });
try {
  const rows = db.prepare(`SELECT e.id,e.role,e.prompt FROM production_events e JOIN production_runs r ON r.id=e.run_id
    JOIN projects p ON p.id=r.project_id WHERE lower(p.language)='hatam' AND lower(p.book)='mark' AND p.chapter=5
    AND e.prompt LIKE '%SAVED PRODUCTION RECORD:%' ORDER BY length(e.prompt) DESC LIMIT 10`).all();
  const results = rows.map(row => {
    const prompt = String(row.prompt);
    const brief = JSON.parse(prompt.split("CHAPTER BRIEF:\n")[1]!.split("\nTEAM CONTRIBUTIONS")[0]!) as CrewBrief;
    const contributions = JSON.parse(prompt.split("TEAM CONTRIBUTIONS AND PREVIOUS DECISION:\n")[1]!.split("\nSAVED PRODUCTION RECORD:")[0]!) as CrewResult["contributions"];
    const record = JSON.parse(prompt.split("SAVED PRODUCTION RECORD:\n")[1]!.split("\nUse filmChanges")[0]!) as ProductionRecord;
    const packet = crewPacket(brief, contributions, record), encoded = encodeCrewPacket(packet);
    return { eventId: row.id, role: row.role, originalPromptUtf8Bytes: Buffer.byteLength(prompt),
      originalContextUtf8Bytes: Buffer.byteLength(JSON.stringify({ brief, contributions, productionRecord: record })),
      projectedContextUtf8Bytes: Buffer.byteLength(JSON.stringify(packet)), encodedContextUtf8Bytes: Buffer.byteLength(encoded),
      historyEntries: record.history.length, retainedHistoryEntries: packet.productionRecord!.history.length,
      fits100kSuppliedContextBytes: Buffer.byteLength(encoded) <= 100_000 };
  });
  writeFileSync(output, JSON.stringify({ readOnly: true, tokenSavingsMeasured: false, results }, null, 2), { flag: "wx" });
  console.log(JSON.stringify(results));
} finally { db.close(); }
