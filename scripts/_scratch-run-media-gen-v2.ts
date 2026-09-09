import "dotenv/config";
import { runMediaGeneration } from "../src/pipeline/media-generation/index.js";

const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const result = await runMediaGeneration(projectId);
console.log(JSON.stringify(result, null, 2));
