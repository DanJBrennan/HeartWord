import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import {execFileSync} from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { canonReferenceMedia } from "./visual-reference-media.js";
import {createHash} from 'node:crypto';
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
it("packages an oversized chapter into captioned immutable boards without dropping identities or altering originals",()=>{
 const db=setup(),source=join(dataDir,"assets","characters","jesus","headshot.png");
 execFileSync("ffmpeg",["-v","error","-nostdin","-y","-f","lavfi","-i","testsrc2=size=64x64:rate=1","-frames:v","1",source],{windowsHide:true,stdio:"pipe"});
 const original=readFileSync(source),canon=Array.from({length:17},(_,i)=>({id:`c${i}`,name:i===0?"Jesus":`Synthetic person${i}`,region:"Papuan",versionId:`v${i}`,notes:null,joinedAt:null}));
 for(const c of canon)db.prepare("INSERT INTO character_assets VALUES (?,'headshot','characters/jesus/headshot.png')").run(c.versionId);
 const raw=canonReferenceMedia(db,dataDir,brief(canon));expect(raw).toHaveLength(17);
 const compact=canonReferenceMedia(db,dataDir,brief(canon),{compact:true});
 expect(compact).toHaveLength(5);expect(compact.flatMap(m=>m.characterIds).sort()).toEqual(canon.map(c=>c.id).sort());
 expect(compact.find(m=>m.characterIds?.includes('c0'))!.characterIds).toEqual(['c0']);
 expect(compact.filter(m=>m.characterIds!.length>1).every(m=>m.caption?.includes('row-major')&&m.caption.includes('original SHA256'))).toBe(true);
 expect(compact.reduce((n,m)=>n+Buffer.byteLength(m.data,'base64'),0)).toBeLessThan(16*1024*1024);
 expect(readFileSync(source)).toEqual(original);
 const directory=join(dataDir,'assets','preparation','crew-reference-boards'),files=readdirSync(directory);
 expect(canonReferenceMedia(db,dataDir,brief(canon),{compact:true})).toEqual(compact);expect(readdirSync(directory)).toEqual(files);
 for(const c of canon)db.prepare("INSERT INTO character_assets VALUES (?,'body_pose','characters/jesus/headshot.png')").run(c.versionId);
 const complete=canonReferenceMedia(db,dataDir,brief(canon),{compact:true,includeBody:true});
 expect(complete).toHaveLength(10);expect(complete.filter(m=>m.characterIds?.includes('c0')).every(m=>m.characterIds!.length===1)).toBe(true);
 expect(complete.filter(m=>m.characterIds?.includes('c0'))).toHaveLength(2);
 expect(complete.some(m=>m.caption?.includes('IDENTITY HEADSHOT'))).toBe(true);expect(complete.some(m=>m.caption?.includes('BODY / WARDROBE VIEW'))).toBe(true);
 expect(readFileSync(source)).toEqual(original);
 const board=files.find(f=>f.endsWith('.jpg'))!;writeFileSync(join(directory,board),'tampered derivative');
 expect(()=>canonReferenceMedia(db,dataDir,brief(canon),{compact:true})).toThrow('board/provenance changed');
 expect(readFileSync(source)).toEqual(original);
 db.close();
},15000);

it("falls back to a turnaround when no headshot exists", () => {
  const db = setup();
  db.exec(`INSERT INTO character_assets VALUES ('v1','turnaround','characters/jesus/turnaround.png')`);
  const media = canonReferenceMedia(db, dataDir, brief([{ id: "c1", name: "Jesus", region: "Papuan", versionId: "v1", notes: null, joinedAt: null }]));
  expect(media[0]!.data).toBe(Buffer.from("fake-turnaround-bytes").toString("base64"));
});

it('includes approved identity and current body views, favors corrected poses and rejects altered reference bytes',()=>{
 const db=setup();
 db.exec('ALTER TABLE character_assets ADD COLUMN imported_from TEXT; ALTER TABLE character_assets ADD COLUMN content_hash TEXT; ALTER TABLE character_assets ADD COLUMN asset_role TEXT; ALTER TABLE character_assets ADD COLUMN story_state TEXT; ALTER TABLE character_assets ADD COLUMN available_from_verse TEXT; ALTER TABLE character_assets ADD COLUMN available_through_verse TEXT');
 const dir=join(dataDir,'assets','characters','jesus'),hash=(v:string)=>createHash('sha256').update(v).digest('hex');
 writeFileSync(join(dir,'a-old-body.png'),'old body');writeFileSync(join(dir,'z-corrected-body.png'),'corrected body');writeFileSync(join(dir,'proof.png'),'comparison proof');
 db.prepare('INSERT INTO character_assets(character_version_id,category,path,imported_from,content_hash)VALUES(?,?,?,?,?)').run('v1','headshot','characters/jesus/headshot.png','carried forward unchanged',hash('fake-png-bytes'));
 db.prepare('INSERT INTO character_assets(character_version_id,category,path,imported_from)VALUES(?,?,?,?)').run('v1','body_pose','characters/jesus/a-old-body.png','carried forward unchanged');
 db.prepare('INSERT INTO character_assets(character_version_id,category,path,content_hash)VALUES(?,?,?,?)').run('v1','body_pose','characters/jesus/z-corrected-body.png',hash('corrected body'));
 db.prepare('INSERT INTO character_assets(character_version_id,category,path,asset_role)VALUES(?,?,?,?)').run('v1','body_pose','characters/jesus/proof.png','comparison_proof');
 const b=brief([{id:'c1',name:'Jesus',region:'Papuan',versionId:'v1',notes:'Corrected approved clothing',joinedAt:null}]);
 const media=canonReferenceMedia(db,dataDir,b,{includeBody:true,compact:true});
 expect(media).toHaveLength(2);expect(media[0]!.caption).toContain('IDENTITY HEADSHOT');expect(media[0]!.caption).toContain('Carried-forward');
 expect(media[1]!.data).toBe(Buffer.from('corrected body').toString('base64'));expect(media[1]!.caption).toContain('BODY / WARDROBE VIEW');
 expect(media.every(m=>m.characterIds?.[0]==='c1')).toBe(true);
 writeFileSync(join(dir,'z-corrected-body.png'),'tampered body');expect(()=>canonReferenceMedia(db,dataDir,b,{includeBody:true})).toThrow('hash mismatch');db.close();
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
