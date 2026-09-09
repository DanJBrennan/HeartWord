import "dotenv/config";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { extractClip } from "../src/pipeline/voicing/extract-clip.js";
import { detectSilences, getAudioDurationMs } from "../src/pipeline/ingestion/detect-silences.js";

const dataDir = getDataDir();
const audioPath = join(dataDir, "assets", "generated/hatam/mark-2/composite_cast_master/04-mark-2-8-10-elevenlabs.mp3");
const tmpPath = join(process.env.TEMP || "/tmp", "master-beat-slice.mp3");
extractClip(audioPath, 0, 3500, tmpPath);
console.log("Slice duration:", getAudioDurationMs(tmpPath), "ms");
const gaps = detectSilences(tmpPath, { noiseFloorDb: -30, minDurationSec: 0.3 });
console.log("Silence gaps within the first 3.5s:", JSON.stringify(gaps, null, 2));
