import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const projCols = db.prepare(`PRAGMA table_info(projects)`).all();
console.log("PROJECT COLUMNS:", JSON.stringify(projCols.map((c: any) => c.name)));
const projects = db.prepare(`SELECT * FROM projects`).all();
console.log("PROJECTS:", JSON.stringify(projects, null, 2).slice(0, 2000));

const perProject = db.prepare(`
  SELECT p.id as project_id, s.status, COUNT(*) as n
  FROM shots s
  JOIN scenes sc ON sc.id = s.scene_id
  JOIN projects p ON p.id = sc.project_id
  GROUP BY p.id, s.status
`).all();
console.log("\nPER PROJECT STATUS:", JSON.stringify(perProject, null, 2));

const gaCols = db.prepare(`PRAGMA table_info(generation_attempts)`).all();
console.log("\nGEN_ATTEMPTS COLUMNS:", JSON.stringify(gaCols.map((c: any) => c.name)));
