import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { getDataDir, getDb } from "../db/client.js";
import { projectsRouter } from "./routes/projects.js";
import { charactersRouter } from "./routes/characters.js";
import { voicesRouter } from "./routes/voices.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure the DB (and schema) is ready before the server accepts requests.
getDb();

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/projects", projectsRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/voices", voicesRouter);

// Serve generated/source media (audio clips, character art) so the web
// app can play them directly -- e.g. audio_segments.source_path values
// like "generated/hatam/mark-2/composite_cast_master/01-....mp3" become
// /media/generated/hatam/mark-2/composite_cast_master/01-....mp3.
app.use("/media", express.static(join(getDataDir(), "assets")));

// Production: serve the Vite build directly (single local web app — see
// "Application shape" in docs/ARCHITECTURE.md). In dev, Vite's own server
// handles the frontend and proxies /api here instead (see vite.config.ts).
const webBuildDir = join(__dirname, "../../dist/web");
if (existsSync(webBuildDir)) {
  app.use(express.static(webBuildDir));
  app.get("*", (_req, res) => {
    res.sendFile(join(webBuildDir, "index.html"));
  });
}

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`HeartWord server listening on http://localhost:${port}`);
});
