// Read-only synthetic workflow preview. No runtime production data or calls.
import express from "express";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { getDataDir } from "../src/db/client.js";
import { projectsRouter } from "../src/server/routes/projects.js";
import { charactersRouter } from "../src/server/routes/characters.js";
import { productionRouter } from "../src/server/routes/production.js";
const app = express();
app.use((req, res, next) => req.method === "GET" ? next() : res.status(403).json({ error: "Synthetic fixture preview is read-only." }));
app.get("/api/voices", (_req, res) => res.json({ voices: [] }));
app.use("/api/projects", projectsRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/projects/:projectId/production", productionRouter);
app.use("/media", express.static(join(getDataDir(), "assets")));
app.get("/", (_req, res) => res.send(readFileSync("dist/web/index.html", "utf8").replace("<body>", '<body><p style="padding:8px;background:#ffeeba;color:#000">SYNTHETIC CONTINUOUS-SPEECH FIXTURE · read-only · no production calls</p>')));
app.use(express.static("dist/web"));
app.listen(4017, "127.0.0.1", () => process.stdout.write("Synthetic read-only preview: http://127.0.0.1:4017\n"));
