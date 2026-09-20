import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { canonReferenceMedia } from "./visual-reference-media.js";
import type { CrewBrief } from "./crew-types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let dataDir = "";
afterEach(() => { if (dataDir) rmSync(dataDir, { recursive: true, force: true }); });

function brief(canon: CrewBrief["canon"]): CrewBrief {
  return { project: { id: "p", language: "hatam", book: "mark", chapter: 3 },
    source: { text: [], reference: [], hashes: [] }, audio: [], canon, shots: [],
    producerNotes: [], spentUsd: 0, audioAssets: [], render: null };
}

function setup() {
  dataDir = mkdtempSync(join(tmpdir(), "hw-visual-media-"));
  const assetDir = join(dataDir, "assets", "characters", "jesus");
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "headshot.png"), Buffer.from("fake-png-bytes"));
  writeFileSync(join(assetDir, "turnaround.png"), Buffer.from("fake-turnaround-bytes"));
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE character_assets(character_version_id TEXT, category TEXT, path TEXT)`);
  return db;
}

it("prefers a headshot over a turnaround, and captions it with the character's name", () => {
  const db = setup();
  db.exec(`INSERT INTO character_assets VALUES
    ('v1','turnaround','characters/jesus/turnaround.png'),
    ('v1','headshot','characters/jesus/headshot.png')`);
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Jesus", region: "Papuan", versionId: "v1", notes: null, joinedAt: null }]));
  expect(media).toHaveLength(1);
  expect(media[0]).toMatchObject({ mimeType: "image/png", caption: "Canon reference image for \"Jesus\":" });
  expect(media[0]!.data).toBe(Buffer.from("fake-png-bytes").toString("base64"));
});

it("falls back to a turnaround when no headshot exists", () => {
  const db = setup();
  db.exec(`INSERT INTO character_assets VALUES ('v1','turnaround','characters/jesus/turnaround.png')`);
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Jesus", region: "Papuan", versionId: "v1", notes: null, joinedAt: null }]));
  expect(media[0]!.data).toBe(Buffer.from("fake-turnaround-bytes").toString("base64"));
});

it("skips a character with no asset row instead of failing the whole brief", () => {
  const db = setup();
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Nobody", region: "Papuan", versionId: "missing-version", notes: null, joinedAt: null }]));
  expect(media).toEqual([]);
});

it("skips a character whose asset file is missing on disk rather than throwing", () => {
  const db = setup();
  db.exec(`INSERT INTO character_assets VALUES ('v1','headshot','characters/jesus/does-not-exist.png')`);
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Jesus", region: "Papuan", versionId: "v1", notes: null, joinedAt: null }]));
  expect(media).toEqual([]);
});

it("returns no media when the database has no character_assets table (pre-migration/minimal test db)", () => {
  dataDir = mkdtempSync(join(tmpdir(), "hw-visual-media-"));
  const db = new DatabaseSync(":memory:");
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Jesus", region: "Papuan", versionId: "v1", notes: null, joinedAt: null }]));
  expect(media).toEqual([]);
});
