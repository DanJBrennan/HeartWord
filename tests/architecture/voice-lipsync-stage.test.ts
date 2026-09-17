import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db}));
vi.mock("../../src/pipeline/voicing/index.js",()=>({runVoicing:vi.fn()}));
describe("voice lip-sync stage SQL",()=>{
  beforeEach(()=>{ db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)"); });
  it("executes its binding join before starting voicing",async()=>{ const {runVoiceLipSync}=await import("../../src/pipeline/voice-lipsync/index.js"); await expect(runVoiceLipSync("p")).resolves.toMatchObject({ok:true}); });
});
