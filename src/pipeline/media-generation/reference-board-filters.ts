import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

function imageHeight(path:string):number{
 const bytes=readFileSync(path);
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString("ascii",12,16)==="IHDR")return bytes.readUInt32BE(20);
 const height=Number(execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=height","-of","csv=p=0",path],{encoding:"utf8"}).trim());
 if(!Number.isInteger(height)||height<=0)throw new Error(`Could not read reference height: ${path}`);
 return height;
}
export function referenceBoardFilter(paths:string[]):string{
 if(paths.length<2)throw new Error("A reference board needs at least two images.");
 const height=Math.min(...paths.map(imageHeight));
 return paths.map((_,i)=>`[${i}:v]scale=-2:${height}[r${i}]`).join(";")+`;${paths.map((_,i)=>`[r${i}]`).join("")}hstack=inputs=${paths.length}`;
}
/** Package existing pixels without inventing designs. Cells are letterboxed,
 * never cropped; the caller records source order and provenance. */
export function referenceGridFilter(paths:string[]):string{
 if(paths.length<2)throw new Error("A reference grid needs at least two images.");
 // Chroma-subsampled inputs can round an odd scaled dimension upward; an odd
 // pad cell would then be smaller than the image. Even cells preserve the
 // full letterboxed source and work across PNG/JPEG pixel formats.
 const size=2*Math.floor(Math.min(1024,...paths.map(imageHeight))/2),columns=Math.ceil(Math.sqrt(paths.length));
 if(size<2)throw new Error('Reference grid images must be at least two pixels high.');
 return paths.map((_,i)=>`[${i}:v]scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[r${i}]`).join(";")+
 `;${paths.map((_,i)=>`[r${i}]`).join("")}xstack=inputs=${paths.length}:layout=${paths.map((_,i)=>`${i%columns*size}_${Math.floor(i/columns)*size}`).join("|")}:fill=white`;
}
