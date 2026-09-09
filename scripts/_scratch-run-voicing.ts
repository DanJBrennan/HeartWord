import "dotenv/config";
import { runVoicing } from "../src/pipeline/voicing/index.js";
const result = await runVoicing("fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d");
console.log(JSON.stringify(result, null, 2));
