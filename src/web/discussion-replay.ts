import type {DiscussionEntry} from "../server/chapter-discussion";
export interface ReplayStep {entry:DiscussionEntry;startMs:number;endMs:number}
/** Presentation pacing, never invented recorded timestamps or speaking audio. */
export function discussionReplay(entries:DiscussionEntry[]) {
  let cursor=0;
  const steps=entries.map(entry=> {const startMs=cursor;cursor+=Math.min(12000,Math.max(4000,4000+entry.summary.length*12));return {entry,startMs,endMs:cursor};});
  return {steps,durationMs:cursor};
}
export function replayStep(steps:ReplayStep[],position:number) {
  return steps.find(step=>step.startMs<=position&&step.endMs>position)??(position>=0?steps.at(-1):undefined);
}
export function replayHistoryAppended(before:string[],after:string[]) {return before.length<=after.length&&before.every((item,index)=>item===after[index]);}
export const replayTime=(ms:number)=>`${Math.floor(Math.max(0,ms)/60000).toString().padStart(2,"0")}:${Math.floor(Math.max(0,ms)%60000/1000).toString().padStart(2,"0")}`;
