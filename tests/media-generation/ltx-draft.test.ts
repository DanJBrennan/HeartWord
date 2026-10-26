import { describe, expect, it, vi } from "vitest";
import { LtxDraftVideoProvider } from "../../src/providers/ltx/draft.js";
import { LtxVideoProvider } from "../../src/providers/ltx/index.js";
import { createVideoProviders } from "../../src/providers/video-selection.js";

describe("local LTX draft routing",()=>{
  it("uses a silent 720p five-second preview and keeps the full render separate",async()=>{
    const generateFinal=vi.fn(async()=>({media:{path:"preview.mp4"}}));
    const draft=new LtxDraftVideoProvider({generateFinal} as unknown as LtxVideoProvider);
    const frame={path:"approved.png"};
    await draft.generateDraft({shotId:"shot",prompt:"short approved motion",characters:[]},{startFrame:frame});
    expect(generateFinal).toHaveBeenCalledWith(expect.objectContaining({shotId:"shot"}),{
      startFrame:frame,resolution:"720p",durationSeconds:5,fps:24,audioMode:"none"});
    expect(createVideoProviders("ltx").draft).toBeInstanceOf(LtxDraftVideoProvider);
    expect(createVideoProviders("veo").draft).not.toBeInstanceOf(LtxDraftVideoProvider);
  });
});
