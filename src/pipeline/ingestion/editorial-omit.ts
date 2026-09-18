import type { AlignmentSegment } from "./gemini-alignment.js";
export type EditorialOmitDecision={status:"safe_omit_cross_reference"|"review_hold";reason:string};
/** A citation may be omitted from film only after title then Scripture resume
 * cleanly, with no speech evidence between. This is evidence, not a claim
 * that citations are universally unspoken. */
export function crossReferenceOmitDecision(segments:AlignmentSegment[],titleIndex:number):EditorialOmitDecision {
  const title=segments[titleIndex]; if(!title||title.sourceKind!=="paragraph_title"||title.status!=="matched")return {status:"review_hold",reason:"No matched narrated title establishes this editorial block."};
  const next=segments.slice(titleIndex+1).findIndex(segment=>segment.sourceKind==="scripture"&&segment.status==="matched");
  if(next<0)return {status:"review_hold",reason:"No clean next Scripture span is aligned after this title."};
  const between=segments.slice(titleIndex+1,titleIndex+1+next);
  if(between.some(segment=>segment.sourceKind==="cross_reference"&&segment.status==="matched"))return {status:"review_hold",reason:"Cross-reference speech was matched; a human must resolve its film treatment."};
  if(between.some(segment=>segment.status!=="non_scripture"))return {status:"review_hold",reason:"Intervening speech is unresolved or otherwise not proven editorially omittable."};
  return {status:"safe_omit_cross_reference",reason:"Matched Scripture resumes cleanly after the narrated title with no intervening speech evidence."};
}
