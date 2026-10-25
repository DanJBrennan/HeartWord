import { describe, expect, it } from "vitest";
import { validateMark4PicturePlacements } from "../../src/pipeline/language-edition-legacy-donor.js";

const complete=[
  {kind:"replaceable_title" as const,startFrame:0 as const,endFrame:95 as const,reason:"Hatam title replaced by the target-language title"},
  {shotId:"a",startFrame:96,endFrame:3105,reason:"Reviewed clean lake and first section"},
  {shotId:"b",startFrame:3106,endFrame:6603,reason:"Reviewed second section"},
  {shotId:"c",startFrame:6604,endFrame:9989,reason:"Reviewed third section"},
  {shotId:"d",startFrame:9990,endFrame:11472,reason:"Reviewed fourth section"},
  {shotId:"e",startFrame:11473,endFrame:13483,reason:"Reviewed final section"}
];

describe("legacy Mark 4 final-picture normalization",()=>{
  it("requires all 13,484 exact frames in ordered silent-chunk intervals",()=>{
    expect(validateMark4PicturePlacements(complete).map(item=>item.chunk.frames)).toEqual([3106,3106,3498,3386,1483,2011]);
    expect(()=>validateMark4PicturePlacements(complete.map((item,index)=>index===2?{...item,startFrame:3107}:item))).toThrow(/gap, overlap/);
    expect(()=>validateMark4PicturePlacements(complete.slice(0,5))).toThrow(/before the final frame/);
    expect(()=>validateMark4PicturePlacements([complete[0]!,{...complete[1]!,endFrame:3106},...complete.slice(2)])).toThrow(/crosses a silent-chunk/);
  });
  it("requires shot identities and a review reason for every placement",()=>{
    expect(()=>validateMark4PicturePlacements([{...complete[0]!,reason:""},...complete.slice(1)])).toThrow(/missing shot identity/);
    expect(()=>validateMark4PicturePlacements([complete[0]!,{...complete[1]!,shotId:""},...complete.slice(2)])).toThrow(/missing shot identity/);
    expect(()=>validateMark4PicturePlacements([{shotId:"old-title",startFrame:0,endFrame:95,reason:"Wrong reuse"},...complete.slice(1)])).toThrow(/replaceable first 96 frames/);
    expect(()=>validateMark4PicturePlacements([{kind:"replaceable_title",startFrame:0,endFrame:94,reason:"Too short"} as typeof complete[0],...complete.slice(1)])).toThrow(/gap, overlap/);
  });
});
