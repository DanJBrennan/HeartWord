import type { DraftVideoProvider, ShotRequest, AssetRef } from "../types.js";
import { LtxVideoProvider } from "./index.js";

/** A local 720p motion preview in the existing draft room. It is still a
 * draft record, not deliverable final footage. */
export class LtxDraftVideoProvider implements DraftVideoProvider {
  constructor(private readonly video: LtxVideoProvider = new LtxVideoProvider()) {}

  generateDraft(request: ShotRequest, opts: {startFrame?:AssetRef} = {}) {
    return this.video.generateFinal(request,{startFrame:opts.startFrame,resolution:"720p",durationSeconds:5,fps:24,audioMode:"none"});
  }

  generateGuided(startFrame:AssetRef,endFrame:AssetRef,request:ShotRequest) {
    return this.video.generateFinal(request,{startFrame,endFrame,resolution:"720p",durationSeconds:5,fps:24,audioMode:"none"});
  }
}
