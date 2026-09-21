import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderCanonReviewPage, type AssetExists } from "./canon-review-page.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1)`);
  return db;
}
function character(db: InstanceType<typeof DatabaseSync>, id: string, name: string, status = "approved") {
  db.prepare("INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES (?,?,'global',?,'Papuan',1,1)").run(id, name, status);
  db.prepare("INSERT INTO character_versions (id,character_id,version_label,status,notes,created_at) VALUES (?,?,'v1','approved','Canon note.',1)").run(`${id}-v`, id);
  return `${id}-v`;
}
const asset = (db: InstanceType<typeof DatabaseSync>, versionId: string, category: string, path: string) =>
  db.prepare("INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES (?,?,?,?,1)").run(`${versionId}-${category}-${path}`, versionId, category, path);

/** These tests describe a canon without writing image files, so by default
 *  every recorded asset counts as present on disk. */
const render = (db: InstanceType<typeof DatabaseSync>, exists: AssetExists = () => true) =>
  renderCanonReviewPage(db, "p", exists);

/** The page embeds its data as a JSON string literal the browser parses,
 *  so assert on the parsed data rather than on that encoding. */
function payloadOf(html: string): any[] {
  const literal = html.match(/const DATA = JSON\.parse\((".*?")\);/s)?.[1];
  if (!literal) throw new Error("page has no embedded data payload");
  return JSON.parse(JSON.parse(literal));
}

it("renders a card per approved canon character with its severity", () => {
  const db = setup();
  const v = character(db, "peter", "Peter");
  asset(db, v, "body_pose", "characters/peter/motion/standing.png");
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES ('r','p','character_version',?,'qc',?,0,1)")
    .run(v, "Canon garment review (Peter), severity: severe:\nNo outer mantle, so no tassels.");
  const html = render(db);
  expect(html).toContain("Peter");
  expect(html).toContain("severe");
  expect(html).toContain("No outer mantle, so no tassels.");
});

it("excludes a character that is not approved canon", () => {
  const db = setup();
  character(db, "rejected", "Rejected sketch", "rejected");
  expect(render(db)).not.toContain("Rejected sketch");
});

it("marks a character with no body pose, since the critic's verdict is weaker there", () => {
  const db = setup();
  const thin = character(db, "thin", "Turnaround only");
  asset(db, thin, "turnaround", "characters/thin/turn.png");
  const full = character(db, "full", "Has body pose");
  asset(db, full, "body_pose", "characters/full/stand.png");
  const byName = Object.fromEntries(payloadOf(render(db)).map(c => [c.name, c]));
  expect(byName["Turnaround only"].hasBodyPose).toBe(false);
  expect(byName["Has body pose"].hasBodyPose).toBe(true);
});

it("records which categories the critic would have sampled, body poses first", () => {
  const db = setup();
  const v = character(db, "c", "Sampled");
  asset(db, v, "headshot", "characters/c/head.png");
  asset(db, v, "turnaround", "characters/c/turn.png");
  asset(db, v, "body_pose", "characters/c/stand.png");
  // Two at most, body_pose before turnaround before headshot.
  expect(payloadOf(render(db))[0].sampled).toEqual(["body_pose", "turnaround"]);
});

it("names the two specific images sampled, not every image of that category", () => {
  const db = setup();
  const v = character(db, "c", "Four poses");
  for (const n of ["a", "b", "c", "d"]) asset(db, v, "body_pose", `characters/c/pose-${n}.png`);
  // The critic reads two files, so only those two may carry the label --
  // marking all four would claim the verdict rests on evidence it never saw.
  expect(payloadOf(render(db))[0].sampledPaths).toEqual(["characters/c/pose-a.png", "characters/c/pose-b.png"]);
});

it("does not credit a body pose whose file is missing from disk", () => {
  const db = setup();
  const v = character(db, "gone", "Missing pose");
  asset(db, v, "body_pose", "characters/gone/stand.png");
  asset(db, v, "turnaround", "characters/gone/turn.png");
  const card = payloadOf(render(db, path => path !== "characters/gone/stand.png"))[0];
  expect(card.sampled).toEqual(["turnaround"]);
  expect(card.hasBodyPose).toBe(false);
});

it("renders an empty canon without failing", () => {
  const html = render(setup());
  expect(html).toContain("No approved canon characters yet.");
});

it("cannot be broken out of by a character name containing markup", () => {
  const db = setup();
  const v = character(db, "x", "</script><img src=x onerror=alert(1)>");
  asset(db, v, "body_pose", "characters/x/stand.png");
  const html = render(db);
  expect(html).not.toContain("</script><img");
  expect(html).toContain("\\u003c/script");
});
