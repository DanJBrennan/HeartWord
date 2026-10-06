import { expect, it } from "vitest";
import { alignmentDisplay } from "./alignment-display.js";
const row={start_ms:590,end_ms:2990};
it("labels matched text with its actual local match score",()=>expect(alignmentDisplay(row,{segments:[{startMs:590,endMs:2990,status:"matched",score:.87} as any]})).toEqual({alignmentStatus:"Matched source text",alignmentMethod:"gemini_text_match",textMatchScore:87}));
it("keeps non-Scripture and unresolved intervals out of a confidence scale",()=>{expect(alignmentDisplay(row,{segments:[{startMs:590,endMs:2990,status:"non_scripture",score:0} as any]}).alignmentStatus).toContain("non-Scripture");expect(alignmentDisplay(row,{segments:[{startMs:590,endMs:2990,status:"unresolved",score:0} as any]}).alignmentStatus).toContain("Unresolved");});
it("labels a matched chapter title as editorial rather than Scripture",()=>expect(alignmentDisplay(row,{segments:[{startMs:590,endMs:2990,status:"matched",sourceKind:"chapter_title",score:1} as any]}).alignmentStatus).toBe("Spoken chapter title"));
it("does not invent detailed scores for fallback or legacy records",()=>{expect(alignmentDisplay(row,{method:"estimated_timing"}).alignmentMethod).toBe("estimated_timing");expect(alignmentDisplay(row,undefined)).toEqual({alignmentStatus:"Legacy alignment — detailed evidence not recorded",alignmentMethod:"legacy",textMatchScore:null});});
