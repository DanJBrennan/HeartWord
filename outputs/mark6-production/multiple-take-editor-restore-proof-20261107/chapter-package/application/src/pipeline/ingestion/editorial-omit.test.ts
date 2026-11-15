import { expect, it } from "vitest";
import { crossReferenceOmitDecision } from "./editorial-omit.js";
const title={startMs:0,endMs:1,status:"matched",sourceKind:"paragraph_title",verseRef:null,text:"Title",score:1,note:""} as any;
const verse={startMs:1,endMs:2,status:"matched",sourceKind:"scripture",verseRef:"v20",text:"Verse",score:1,note:""} as any;
it("allows citation omission only when the next Scripture starts cleanly",()=>expect(crossReferenceOmitDecision([title,verse],0).status).toBe("safe_omit_cross_reference"));
it("holds unknown intervening speech and spoken citation evidence",()=>{expect(crossReferenceOmitDecision([title,{...verse,status:"unresolved",sourceKind:undefined},verse],0).status).toBe("review_hold");expect(crossReferenceOmitDecision([title,{...verse,sourceKind:"cross_reference",verseRef:null},verse],0).status).toBe("review_hold");});
it("never auto-skips without a clean next Scripture span",()=>expect(crossReferenceOmitDecision([title],0).status).toBe("review_hold"));
