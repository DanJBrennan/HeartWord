import express from "express";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {existsSync} from "node:fs";
import {getDataDir} from "../db/client.js";
import {projectsRouter} from "./routes/projects.js";
import {charactersRouter} from "./routes/characters.js";
import {voicesRouter} from "./routes/voices.js";
import {productionRouter} from "./routes/production.js";
import {controlRoomRouter} from "./routes/control-room.js";

const repositoryRoot=join(dirname(fileURLToPath(import.meta.url)),"../..");

/** The normal producer UI and all existing production/edit routes share one
 * database client. Constructing the app never dispatches production work. */
export function createHeartWordApp({webBuildDir=join(repositoryRoot,"dist/web")}: {webBuildDir?:string}={}) {
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{
    // Existing standalone presentation bridge; not production authorization.
    if(req.path.startsWith("/api/control-room/")) {
      res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:5173");
      res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers","Content-Type");
      res.setHeader("Access-Control-Expose-Headers","X-Control-Room-Research-Sources");
      if(req.method==="OPTIONS"){res.sendStatus(204);return;}
    }
    next();
  });
  app.get("/api/health",(_req,res)=>res.json({status:"ok"}));
  app.use("/api/projects",projectsRouter);
  app.use("/api/projects/:projectId/production",productionRouter);
  app.use("/api/characters",charactersRouter);
  app.use("/api/voices",voicesRouter);
  app.use("/api/control-room",controlRoomRouter);
  app.use("/api",(_req,res)=>res.status(404).json({error:"API route not found."}));
  app.use("/control-room-vosk",express.static(join(repositoryRoot,"node_modules/vosk-browser/dist"),{
    setHeaders:res=>res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:5173")
  }));
  app.use("/control-room-models",express.static(join(getDataDir(),"control-room/wake-word"),{
    setHeaders:res=>res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:5173")
  }));
  app.use("/media",express.static(join(getDataDir(),"assets")));
  if(existsSync(webBuildDir)) {
    app.use(express.static(webBuildDir,{setHeaders:(res,path)=>{if(path.endsWith("index.html"))res.setHeader("Cache-Control","no-store");}}));
    app.get("*",(_req,res)=>{res.setHeader("Cache-Control","no-store");res.sendFile(join(webBuildDir,"index.html"));});
  }
  return app;
}
