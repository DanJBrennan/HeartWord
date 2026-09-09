import "dotenv/config";
import { getDb, getDataDir } from "../src/db/client.js";
import { getCoverageBeatContext } from "../src/pipeline/media-generation/external-coverage-keyframes.js";
const db=getDb(), data=getDataDir();
for (const id of ["3e585562-61b9-44f5-b3aa-928f70e1e720","709638cd-c084-4376-aef2-0d51aba44f93","adbb1ad9-0210-4275-8684-1570fbcd648e"]) console.log(JSON.stringify(getCoverageBeatContext(db,data,id),null,2));
