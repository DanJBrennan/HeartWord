import { expect, it } from "vitest";
import { correctionReplacementMap } from "./correction-remap.js";
it("remaps corrections only to an exact retained interval",()=>expect(correctionReplacementMap([{id:"old",start_ms:55733,end_ms:57990}],new Map([["55733:57990","new"]]),[{id:"correction",audio_segment_id:"old"}])).toEqual([{correctionId:"correction",replacement:"new"}]));
it("remaps an editorial classification by its original interval on re-ingest",()=>expect(correctionReplacementMap([{id:"old-editorial",start_ms:371645,end_ms:385645}],new Map([["371645:385645","new-editorial"]]),[{id:"editorial",audio_segment_id:"old-editorial"}])).toEqual([{correctionId:"editorial",replacement:"new-editorial"}]));
it("holds rather than orphaning a correction when timing changes",()=>expect(()=>correctionReplacementMap([{id:"old",start_ms:1,end_ms:2}],new Map(),[{id:"correction",audio_segment_id:"old"}])).toThrow("Cannot safely re-ingest"));
