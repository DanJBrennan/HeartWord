import type { AlignmentSegment } from "./gemini-alignment.js";

export type AlignmentDisplay={alignmentStatus:string;alignmentMethod:"gemini_text_match"|"estimated_timing"|"legacy";textMatchScore:number|null};
export function alignmentDisplay(segment:{start_ms:number;end_ms:number}, evidence:{method?:string;segments?:AlignmentSegment[]}|undefined):AlignmentDisplay {
  if(evidence?.method==="estimated_timing")return {alignmentStatus:"Estimated timing — no Gemini text-match evidence",alignmentMethod:"estimated_timing",textMatchScore:null};
  const match=evidence?.segments?.find(value=>value.startMs===segment.start_ms&&value.endMs===segment.end_ms);
  if(!match)return {alignmentStatus:"Legacy alignment — detailed evidence not recorded",alignmentMethod:"legacy",textMatchScore:null};
  if(match.status==="matched"&&match.sourceKind==="chapter_title")return {alignmentStatus:"Spoken chapter title",alignmentMethod:"gemini_text_match",textMatchScore:Math.round(match.score*100)};
  if(match.status==="matched"&&match.sourceKind==="paragraph_title")return {alignmentStatus:"Narrated paragraph/section title",alignmentMethod:"gemini_text_match",textMatchScore:Math.round(match.score*100)};
  if(match.status==="matched"&&match.sourceKind==="cross_reference")return {alignmentStatus:"Cross-reference speech matched — review film treatment",alignmentMethod:"gemini_text_match",textMatchScore:Math.round(match.score*100)};
  if(match.status==="matched")return {alignmentStatus:"Matched source text",alignmentMethod:"gemini_text_match",textMatchScore:Math.round(match.score*100)};
  if(match.status==="non_scripture")return {alignmentStatus:"Opening / other non-Scripture audio",alignmentMethod:"gemini_text_match",textMatchScore:null};
  return {alignmentStatus:"Unresolved — review required",alignmentMethod:"gemini_text_match",textMatchScore:null};
}
