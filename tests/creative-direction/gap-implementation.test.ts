import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeGapIdea } from "../../src/pipeline/creative-direction/implement.js";
import type { CrewBrief } from "../../src/pipeline/creative-direction/crew-types.js";
import type { GapFillIdea } from "../../src/pipeline/creative-direction/index.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>;
const idea: GapFillIdea = { id: "idea", operation: "new_shot", kind: "continuity", targetShotId: "anchor", targetShotVerseRef: "Mark 2:1", label: "A listener", description: "Listener attends to the speaker", setting: "Established room", framing: "close_up", cameraMovement: "static", estimatedDurationSec: 4, charactersInvolved: ["Witness"], decorumRationale: "Quiet reaction to the existing teaching" };
const brief = { project: { id: "p" }, shots: [{ id: "anchor", sceneId: "scene", verseRef: "Mark 2:1", continuity: "Roof intact" }], canon: [{ id: "c", name: "Witness", versionId: "v" }] } as CrewBrief;
beforeEach(() => {
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 2:1','Mark 2:1',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,created_at) VALUES ('anchor','scene',1,'Original action','Mark 2:1',1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Witness','global','approved','Papuan',1,1);`);
});
afterEach(() => db.close());
describe("approved gap ideas", () => {
  it("joins new coverage to the chapter once without replacing existing shots", () => {
    expect(materializeGapIdea(db, brief, idea)).toBe("idea"); expect(materializeGapIdea(db, brief, idea)).toBe("idea");
    expect(db.prepare("SELECT COUNT(*) AS n FROM shots").get()!.n).toBe(2);
    expect(db.prepare("SELECT action FROM shots WHERE id='anchor'").get()!.action).toBe("Original action");
    expect(db.prepare("SELECT * FROM shot_characters").get()).toMatchObject({ shot_id: "idea", character_id: "c" });
  });
  it("rejects ambiguous anchors and unmatched characters before creating any media", () => {
    expect(() => materializeGapIdea(db, brief, { ...idea, targetShotId: null })).toThrow("specific shot");
    expect(() => materializeGapIdea(db, brief, { ...idea, charactersInvolved: ["Invented person"] })).toThrow("approved chapter character");
    expect(db.prepare("SELECT COUNT(*) AS n FROM shots").get()!.n).toBe(1);
  });
  it("requires separate coverage for long ideas and new IDs for changed ideas", () => {
    expect(() => materializeGapIdea(db, brief, { ...idea, estimatedDurationSec: 9 })).toThrow("eight seconds");
    materializeGapIdea(db, brief, idea);
    expect(() => materializeGapIdea(db, brief, { ...idea, description: "Different event" })).toThrow("changed");
  });
});
