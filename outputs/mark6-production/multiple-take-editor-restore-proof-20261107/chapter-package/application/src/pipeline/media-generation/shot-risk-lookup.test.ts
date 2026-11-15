import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { shotRiskFor, tierForRisk } from "./shot-risk-lookup.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:1','Mark 3:6',1);
  `);
  return db;
}
function shot(db: InstanceType<typeof DatabaseSync>, id: string, sequence: number, fields: {
  framing?: string; cameraMovement?: string; crowdDensity?: string;
}) {
  db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,framing,camera_movement,crowd_density,status,created_at)
    VALUES (?,'sc',?,'Some action.',?,?,?, 'planned',1)`)
    .run(id, sequence, fields.framing ?? "medium_close", fields.cameraMovement ?? "static",
      fields.crowdDensity ?? "empty");
}
function addCharacters(db: InstanceType<typeof DatabaseSync>, shotId: string, count: number) {
  for (let i = 0; i < count; i++) {
    db.prepare("INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES (?,?,'global','approved','Papuan',1,1)")
      .run(`${shotId}-c${i}`, `${shotId} character ${i}`);
    db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(shotId, `${shotId}-c${i}`);
  }
}

it("reads a shot's own facts, including how many canon characters are actually in it", () => {
  const db = setup();
  shot(db, "crowded", 1, { crowdDensity: "moderate", framing: "wide" });
  addCharacters(db, "crowded", 7);
  const risk = shotRiskFor(db, "crowded");
  expect(risk.tier).toBe("critical");
  expect(risk.reasons).toContain("7 named characters in frame");
});

it("counts a shot with no linked characters as zero rather than failing", () => {
  const db = setup();
  shot(db, "empty", 1, {});
  expect(shotRiskFor(db, "empty")).toMatchObject({ tier: "routine", draftFirst: false });
});

it("maps risk onto render tiers so only genuinely risky frames buy a better render", () => {
  const db = setup();
  shot(db, "routine", 1, {});
  shot(db, "elevated", 2, { crowdDensity: "packed", framing: "wide" });
  shot(db, "critical", 3, {});
  addCharacters(db, "critical", 7);
  expect(tierForRisk(shotRiskFor(db, "routine"))).toBe("economy");
  expect(tierForRisk(shotRiskFor(db, "elevated"))).toBe("standard");
  expect(tierForRisk(shotRiskFor(db, "critical"))).toBe("premium");
});

it("refuses to assess a shot that is not in the plan", () => {
  const db = setup();
  expect(() => shotRiskFor(db, "missing")).toThrow("not in this project's plan");
});
