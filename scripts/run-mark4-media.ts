import "dotenv/config";
import { runMediaGeneration } from "../src/pipeline/media-generation/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
console.log(JSON.stringify(await runMediaGeneration(projectId), null, 2));
