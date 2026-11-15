import { createRequire } from "node:module";
import { resolve } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { exportChapterPackage, inspectChapterPackage, restoreChapterPackage, verifyChapterPackage } from "../src/pipeline/assembly/chapter-package.js";

const [command, first, second, ...extraFiles] = process.argv.slice(2);
try {
  if (command === "verify" && first) console.log(JSON.stringify(verifyChapterPackage(resolve(first)), null, 2));
  else if (command === "restore" && first && second) console.log(JSON.stringify(restoreChapterPackage(resolve(first), resolve(second)), null, 2));
  else if ((command === "inspect" || command === "export") && first) {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const dataDir = getDataDir();
    const db = new DatabaseSync(resolve(dataDir, "db", "heartword.sqlite"), { readOnly: true });
    try {
      const options = { extraFiles: command === "inspect" ? [second, ...extraFiles].filter((x): x is string => !!x) : extraFiles };
      const manifest = command === "inspect" ? inspectChapterPackage(db, dataDir, first, options).manifest
        : second ? exportChapterPackage(db, dataDir, first, resolve(second), options) : (() => { throw new Error("Export destination is required."); })();
      console.log(JSON.stringify(manifest, null, 2));
      if (manifest.problems.length) process.exitCode = 1;
    } finally { db.close(); }
  } else console.log("Usage: npm run chapter:package -- inspect <project-id> [extra-file...] | export <project-id> <new-package-dir> [extra-file...] | verify <package-dir> | restore <package-dir> <new-data-root>");
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
