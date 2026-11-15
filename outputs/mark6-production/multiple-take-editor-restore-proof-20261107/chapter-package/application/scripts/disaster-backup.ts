import "dotenv/config";
import { resolve } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { backupStatus, inventoryDisasterData, publishDisasterBackup, restoreDisasterBackup, stageDisasterBackup, verifyDisasterBackup } from "../src/pipeline/assembly/disaster-backup.js";
const [command, first, second] = process.argv.slice(2);
try {
  let result: unknown;
  if (command === "inventory") result = inventoryDisasterData(getDataDir());
  else if (command === "status") { result = backupStatus(getDataDir()); if ((result as { stale: boolean }).stale || ["failed", "running"].includes((result as { latest?: { state?: string } }).latest?.state ?? "")) process.exitCode = 1; }
  else if (command === "stage" && first) result = await stageDisasterBackup(getDataDir(), resolve(first));
  else if (command === "publish" && first && second) result = await publishDisasterBackup(resolve(first), resolve(second), getDataDir());
  else if (command === "verify" && first) result = await verifyDisasterBackup(resolve(first));
  else if (command === "restore" && first && second) result = await restoreDisasterBackup(resolve(first), resolve(second));
  else throw new Error("Usage: npm run data:backup -- inventory | status | stage NEW_UNSYNCED_DIR | publish COMPLETED_DIR NEW_SYNC_DIR | verify BACKUP_DIR | restore BACKUP_DIR NEW_UNSYNCED_DATA_ROOT");
  if (command === "stage" || command === "verify") { const m = result as Awaited<ReturnType<typeof verifyDisasterBackup>>; result = { id: m.id, files: m.files.length, bytes: m.files.reduce((n, f) => n + f.bytes, 0), chapters: m.chapters, protection: m.protection, limitations: m.limitations }; }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
