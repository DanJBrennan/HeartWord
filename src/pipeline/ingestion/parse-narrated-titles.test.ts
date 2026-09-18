import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseNarratedParagraphTitles } from "./parse-source-text.js";
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));
function docx(lines:string[]){const name=Buffer.from("word/document.xml"),body=Buffer.from(`<w:document>${lines.map(line=>`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:document>`),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(body.length,20);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+body.length,16);return Buffer.concat([local,name,body,central,name,end])}
it("retains only structural narrated paragraph titles and their reference evidence",()=>{const dir=mkdtempSync(join(tmpdir(),"hw-title-"));dirs.push(dir);const path=join(dir,"mark.docx");writeFileSync(path,docx(["MARKUS 3","19Verse ending.","Yesus kin Beelzebul","(Mat. 12:22-32; Luk. 11:14-23, 12:10)","20Gima ngwig ...","Unstructured note","21Verse"]));expect(parseNarratedParagraphTitles(path)).toEqual([{text:"Yesus kin Beelzebul",parallelRefs:"Mat. 12:22-32; Luk. 11:14-23, 12:10",paragraphIndex:2,verseStart:20}]);});
