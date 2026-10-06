import "dotenv/config";
import { runAssembly } from "../src/pipeline/assembly/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
console.log(JSON.stringify(await runAssembly(projectId), null, 2));
