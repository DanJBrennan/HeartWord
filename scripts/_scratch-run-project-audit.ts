import "dotenv/config";
import { runProjectReview } from "../src/pipeline/qc/director.js";

const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const summary = await runProjectReview(projectId);
console.log(JSON.stringify(summary, null, 2));
