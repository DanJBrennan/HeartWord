import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {seedControlRoomPresentationBriefs} from "./control-room-presentation-briefs.js";
import {seedControlRoomVoiceProfiles} from "./control-room-voice-profiles.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
it("opens chapter-only databases without inventing missing presentation voice profiles",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(readFileSync("src/db/schema.sql","utf8"));db.exec("PRAGMA foreign_keys=ON");
    expect(seedControlRoomPresentationBriefs(db)).toBe(0);
    expect(db.prepare("SELECT COUNT(*)n FROM control_room_voice_profiles").get()).toEqual({n:0});
    expect(db.prepare("SELECT COUNT(*)n FROM projects").get()).toEqual({n:0});
    seedControlRoomVoiceProfiles(db);
    expect(seedControlRoomPresentationBriefs(db)).toBeGreaterThan(0);
    expect(seedControlRoomPresentationBriefs(db)).toBe(0);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT COUNT(*)n FROM characters").get()).toEqual({n:0});
  }finally{db.close();}
});
