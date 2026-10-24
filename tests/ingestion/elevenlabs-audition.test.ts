import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,expect,it,vi} from "vitest";
import {reVoiceAudio} from "../../src/providers/elevenlabs.js";
let folder="";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(folder)rmSync(folder,{recursive:true,force:true});});
it("auditions real source audio with multilingual conversion, explicit speed and retained provider usage",async()=>{
 folder=mkdtempSync(join(tmpdir(),"hw-sts-"));const path=join(folder,"reviewed.wav");writeFileSync(path,"source bytes");vi.stubEnv("ELEVENLABS_API_KEY","fixture-key");
 const request=vi.fn(async()=>new Response("returned audio",{headers:{"content-type":"audio/mpeg","request-id":"fixture-request","history-item-id":"fixture-history","character-cost":"125"}}));vi.stubGlobal("fetch",request);
 const result=await reVoiceAudio("fixture-voice",path,{voiceSettings:{speed:1,stability:0.5}});
 const [url,init]=request.mock.calls[0] as unknown as [string,RequestInit],form=init.body as FormData;
 expect(url).toContain("/speech-to-speech/fixture-voice");expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");expect(form.get("text")).toBeNull();expect(JSON.parse(String(form.get("voice_settings")))).toEqual({speed:1,stability:0.5});
 expect(Buffer.from(await (form.get("audio") as Blob).arrayBuffer()).toString()).toBe("source bytes");
 expect(result.usage).toEqual({requestId:"fixture-request",historyItemId:"fixture-history",characterCost:"125"});expect(result.audioBuffer.toString()).toBe("returned audio");
});
it("does not retry a failed provider submission",async()=>{
 folder=mkdtempSync(join(tmpdir(),"hw-sts-failed-"));const path=join(folder,"reviewed.wav");writeFileSync(path,"source bytes");vi.stubEnv("ELEVENLABS_API_KEY","fixture-key");const request=vi.fn(async()=>{throw Error("fixture connection ended after dispatch");});vi.stubGlobal("fetch",request);
 await expect(reVoiceAudio("fixture-voice",path)).rejects.toThrow("fixture connection");expect(request).toHaveBeenCalledTimes(1);
});
