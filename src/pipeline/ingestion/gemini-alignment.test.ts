import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { alignWithGemini } from "./gemini-alignment.js";

const dirs:string[]=[]; afterEach(()=>dirs.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));
function fixture(){const dir=mkdtempSync(join(tmpdir(),"hw-align-"));dirs.push(dir);const path=join(dir,"audio.mp3");execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=d=1","-f","lavfi","-i","anullsrc=d=0.5","-f","lavfi","-i","sine=d=1","-f","lavfi","-i","anullsrc=d=0.5","-f","lavfi","-i","sine=d=1","-filter_complex","[0][1][2][3][4]concat=n=5:v=0:a=1","-c:a","libmp3lame",path]);return path}
it("uses ordered anchors then strong bounded fill without silently losing text",async()=>{const audioPath=fixture();let calls=0;const result=await alignWithGemini({audioPath,durationMs:4000,gaps:[{startMs:1000,endMs:1500,durationMs:500},{startMs:2500,endMs:3000,durationMs:500}],verses:[{verse:1,paragraphIndex:0,text:"one two three"},{verse:2,paragraphIndex:1,text:"four five six"},{verse:3,paragraphIndex:2,text:"seven eight nine"}],config:{fastModel:"fast",strongModel:"strong"},identify:async(_audio,_context,model)=>{calls++;if(model==="strong")return {isScripture:true,span:"four five six"};return calls===1?{isScripture:true,span:"one two three"}:calls===2?{isScripture:true,span:"zzzz"}:{isScripture:true,span:"seven eight nine"}}});expect(result.segments.map(x=>x.status)).toEqual(["matched","matched","matched"]);expect(result.segments.map(x=>x.verseRef)).toEqual(["v1","v2","v3"]);expect(result.coverage).toBe(1);});
it("treats malformed model output as unresolved evidence",async()=>{const result=await alignWithGemini({audioPath:fixture(),durationMs:1000,gaps:[],verses:[{verse:1,paragraphIndex:0,text:"one two three"}],identify:async()=>({span:"one two three"})});expect(result.segments[0]).toMatchObject({status:"unresolved",verseRef:null});});
it("accepts a structurally identified narrated title without assigning it to Scripture",async()=>{const result=await alignWithGemini({audioPath:fixture(),durationMs:1000,gaps:[],verses:[{verse:20,paragraphIndex:2,text:"one two three"}],titles:[{text:"Yesus kin Beelzebul",parallelRefs:"Mat. 12:22-32",paragraphIndex:1,verseStart:20}],identify:async()=>({isScripture:true,span:"Yesus kin Beelzebul"})});expect(result.segments[0]).toMatchObject({status:"matched",verseRef:null,sourceKind:"paragraph_title",parallelRefs:"Mat. 12:22-32"});expect(result.coverage).toBe(0);});
it("uses a spoken chapter title as editorial context before verse one",async()=>{const result=await alignWithGemini({audioPath:fixture(),durationMs:1000,gaps:[],chapterTitle:"MARKUS 4",verses:[{verse:1,paragraphIndex:1,text:"one two three"}],identify:async()=>({isScripture:true,span:"MARKUS 4"})});expect(result.segments[0]).toMatchObject({status:"matched",verseRef:null,sourceKind:"chapter_title"});expect(result.coverage).toBe(0);});
it("accepts an exact two-word chapter title on the first pass without a redundant strong call",async()=>{
 const identify=vi.fn(async()=>({isScripture:true,span:"MARKUS 5"}));
 const result=await alignWithGemini({audioPath:fixture(),durationMs:2300,gaps:[],chapterTitle:"MARKUS 5",verses:[{verse:1,paragraphIndex:1,text:"one two three"}],identify});
 expect(result.segments[0]).toMatchObject({status:"matched",sourceKind:"chapter_title",text:"MARKUS 5"});expect(identify).toHaveBeenCalledTimes(1);
});
it("does not count a supplied standalone parenthesis as an uncovered spoken word",async()=>{
 const result=await alignWithGemini({audioPath:fixture(),durationMs:1000,gaps:[],verses:[{verse:7,paragraphIndex:1,text:"one two three ("}],identify:async()=>({isScripture:true,span:"one two three"})});
 expect(result.coverage).toBe(1);expect(result.uncoveredVerses).toEqual([]);
});
