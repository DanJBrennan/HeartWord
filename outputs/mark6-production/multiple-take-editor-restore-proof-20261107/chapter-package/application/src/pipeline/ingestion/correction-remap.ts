export function correctionReplacementMap(oldSegments:Array<{id:string;start_ms:number;end_ms:number}>, replacements:Map<string,string>, corrections:Array<{id:string;audio_segment_id:string}>) {
  return corrections.map(correction=>{const old=oldSegments.find(segment=>segment.id===correction.audio_segment_id);const replacement=old&&replacements.get(`${old.start_ms}:${old.end_ms}`);if(!replacement)throw new Error(`Cannot safely re-ingest: human correction ${correction.id} has no exactly equivalent replacement interval.`);return {correctionId:correction.id,replacement};});
}
