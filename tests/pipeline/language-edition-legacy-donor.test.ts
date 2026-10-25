import { describe, expect, it } from "vitest";
import { validateMark4PicturePlacements } from "../../src/pipeline/language-edition-legacy-donor.js";

const complete=[
  {shotId:"a",startFrame:0,endFrame:3105,reason:"Reviewed first section"},
  {shotId:"b",startFrame:3106,endFrame:6603,reason:"Reviewed second section"},
  {shotId:"c",startFrame:6604,endFrame:9989,reason:"Reviewed third section"},
  {shotId:"d",startFrame:9990,endFrame:11472,reason:"Reviewed fourth section"},
  {shotId:"e",startFrame:11473,endFrame:13483,reason:"Reviewed final section"}
];

describe("legacy Mark 4 final-picture normalization",()=>{
  it("requires all 13,484 exact frames in ordered silent-chunk intervals",()=>{
    expect(validateMark4PicturePlacements(complete).map(item=>item.chunk.frames)).toEqual([3106,3498,3386,1483,2011]);
    expect(()=>validateMark4PicturePlacements(complete.map((item,index)=>index===1?{...item,startFrame:3107}:item))).toThrow(/gap, overlap/);
    expect(()=>validateMark4PicturePlacements(complete.slice(0,4))).toThrow(/before the final frame/);
    expect(()=>validateMark4PicturePlacements([{...complete[0]!,endFrame:3106},...complete.slice(1)])).toThrow(/crosses a silent-chunk/);
  });
  it("requires shot identities and a review reason for every placement",()=>{
    expect(()=>validateMark4PicturePlacements([{...complete[0]!,reason:""},...complete.slice(1)])).toThrow(/missing shot identity/);
    expect(()=>validateMark4PicturePlacements([{...complete[0]!,shotId:""},...complete.slice(1)])).toThrow(/missing shot identity/);
  });
});
