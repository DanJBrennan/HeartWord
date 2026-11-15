import { describe, expect, it } from "vitest";
import { crewInputBudget, crewPacket, encodeCrewPacket } from "../../src/pipeline/creative-direction/crew-packet.js";
import { newProductionRecord, type SavedContribution } from "../../src/pipeline/creative-direction/production-record.js";
import type { CrewBrief } from "../../src/pipeline/creative-direction/crew-types.js";

const brief: CrewBrief = { project: { id: "p", language: "hatam", book: "mark", chapter: 6 },
  source: { text: [{ verse: 1, text: "Exact source words" }], reference: [], hashes: ["source"] },
  audio: [], canon: [], shots: [], producerNotes: [{ id: "dan", subjectId: "p", note: "Preserve the chapter announcement." }],
  spentUsd: 0, audioAssets: [], render: null };
function entry(id: string, current = true): SavedContribution {
  return { id, kind: "proposal", inputRevision: current ? "brief:hash" : "old", inputBriefSha256: current ? "hash" : "old",
    owner: "cinematographer", scope: { projectId: "p", sceneIds: [], shotIds: [], verseRefs: [], audioBindingRefs: [] },
    proposedChanges: [], rationale: "Keep evidenced framing", evidence: [], objections: [],
    destination: { roles: ["production_director"], stage: "planning", subjectId: "p" }, relatedContributions: [],
    supersedes: null, finding: null, resolution: null };
}
function decodePacket(text:string):any{
 const p=JSON.parse(text),read=(v:any):any=>{
  if(v&&typeof v==='object'&&v.$ref)return read(p.definitions[Number(v.$ref.split('/').at(-1))]);
  if(p.idPrefixEncoding==='crew_id_v1'&&v&&typeof v==='object'&&v.$crewId)return p.idPrefixes[v.$crewId[0]]+v.$crewId[1];if(p.objectRowsEncoding==='prefix_columns_v1'&&v&&typeof v==='object'&&v.$columns&&v.$rows){const columns=read(v.$columns);return read(v.$rows).map((row:any[])=>Object.fromEntries(row.map((value,i)=>[columns[i],value])));}
  return Array.isArray(v)?v.map(read):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,read(x)])):v;
 };return read(p.payload??p);
}
describe("bounded crew context", () => {
 it('losslessly shares durable finding-ID prefixes without renumbering or changing referenced evidence',()=>{
  const run='11111111-2222-4333-8444-555555555555',value={source:'Exact Hatam — “words” 🐟',issues:Array.from({length:200},(_,i)=>({id:`${run}:${i%2?'cinematographer':'staging_designer'}:1:finding:${String(i).padStart(4,'0')}`,owner:i%2?'cinematographer':'staging_designer',status:i%3?'open':'resolved',request:'Keep source action '+i,literal:`${run}:${i%2?'cinematographer':'staging_designer'}:1:finding:${String(i).padStart(4,'0')}\n`})),lookups:[] as string[]};value.lookups=value.issues.map(o=>'contribution:'+o.id);const before=JSON.stringify(value),encoded=encodeCrewPacket(value);expect(JSON.parse(encoded).idPrefixEncoding).toBe('crew_id_v1');expect(JSON.stringify(decodePacket(encoded))).toBe(before);expect(JSON.stringify(value)).toBe(before);expect(encoded.length).toBeLessThan(before.length);expect(decodePacket(encoded).issues[0].id).toMatch(/finding:0000$/);expect(decodePacket(encoded).lookups).toEqual(value.lookups);
 });
 it('never reinterprets a literal reserved ID token',()=>{const value={literal:{$crewId:[0,'0001']},rows:Array.from({length:30},(_,i)=>({id:`11111111-2222-4333-8444-555555555555:cinematographer:1:finding:${i}`,note:'Full original evidence'}))},encoded=encodeCrewPacket(value);expect(JSON.parse(encoded).idPrefixEncoding).toBeUndefined();expect(decodePacket(encoded)).toEqual(value);});
 it('leaves ordinary identifiers and too-small prefix groups on the legacy encoding',()=>{const value={rows:Array.from({length:5},(_,i)=>({id:`11111111-2222-4333-8444-555555555555:cinematographer:1:finding:${i}`,other:'not-a-crew-finding:000'+i}))};const encoded=encodeCrewPacket(value);expect(JSON.parse(encoded).idPrefixEncoding).toBeUndefined();expect(decodePacket(encoded)).toEqual(value);});
 it('losslessly shares repeated row keys, retaining Unicode, order, nested values and missing trailing fields',()=>{
  const value={source:'Hatam — exact “words” 🐟',issues:Array.from({length:100},(_,i)=>({id:'issue-'+i,owner:'script_supervisor',shotId:i%2?'s0':null,severity:'advisory',status:'open',...(i%3?{}:{globalAdvisoryRequest:'Retain all source words and quiet.'})})),nested:Array.from({length:8},(_,i)=>({id:i,values:[false,null,0,'é']}))};const before=JSON.stringify(value),encoded=encodeCrewPacket(value);
  expect(JSON.parse(encoded).objectRowsEncoding).toBe('prefix_columns_v1');expect(JSON.stringify(decodePacket(encoded))).toBe(before);expect(JSON.stringify(value)).toBe(before);expect(Buffer.byteLength(encoded)).toBeLessThan(Buffer.byteLength(before));expect(decodePacket(encoded).issues[1]).not.toHaveProperty('globalAdvisoryRequest');
 });
 it('does not fill absent intermediate keys or reorder irregular object rows',()=>{
  const value={rows:Array.from({length:20},(_,i)=>i%2?{id:i,last:null}:{first:false,id:i,last:undefined}),empty:[],zero:0};expect(JSON.stringify(decodePacket(encodeCrewPacket(value)))).toBe(JSON.stringify(value));
 });
 it('does not reinterpret literal reserved table properties as encoded rows',()=>{
  const value={literal:{$columns:['first','second'],$rows:[[1,2]]},rows:Array.from({length:20},(_,i)=>({id:i,name:'Known'}))},encoded=encodeCrewPacket(value);expect(JSON.parse(encoded).objectRowsEncoding).toBeUndefined();expect(decodePacket(encoded)).toEqual(value);
 });
  it("retains open cross-run objections and recursively linked alternatives while archiving unrelated history", () => {
    const record = newProductionRecord(brief, "run", "hash");
    const old = entry("old", false), current = entry("run:current"), objection = entry("objection", false);
    current.supersedes = old.id; objection.relatedContributions = [current.id];
    record.history = [entry("unrelated", false), old, current, objection];
    record.objections = [{ id: objection.id, owner: "script_supervisor", status: "open", shotId: null,
      severity: "blocking", evidence: "Wrong listener", requestedChange: "Restore correct listener", confidence: 90, limitations: "Fixture" }];
    const original = JSON.stringify(record);
    const packet = crewPacket(brief, {}, record);
    expect(packet.productionRecord!.history.map(h => h.id)).toEqual(["old", "run:current", "objection"]);
    expect(packet.productionRecord!.objections).toHaveLength(1);
    expect(packet.audit!.archivedContributionCount).toBe(1);
    expect(packet.brief.producerNotes).toEqual(brief.producerNotes);
    expect(JSON.stringify(record)).toBe(original);
  });
  it("does not replay a long retired supersession chain or revive same-input proposals from older runs", () => {
    const record = newProductionRecord(brief, "run", "hash");
    const old = Array.from({length:100},(_,i)=>({...entry(`older:${i}`),supersedes:i?`older:${i-1}`:null,relatedContributions:i?[`older:${i-1}`]:[]}));
    const current={...entry("run:current"),supersedes:"older:99",relatedContributions:["older:99"]};
    record.history=[...old,current,entry("different-run:inactive")];
    const packet=crewPacket(brief,{},record);
    expect(packet.productionRecord!.history.map(h=>h.id)).toEqual(["older:99","run:current"]);
    expect(packet.audit!.archivedAncestryLinks).toEqual(["older:98"]);
    expect(record.history).toHaveLength(102);
  });
  it("holds incomplete evidence graphs rather than pretending an omitted link was read", () => {
    const record = newProductionRecord(brief, "run", "hash"), proposal = entry("run:proposal");
    proposal.relatedContributions = ["missing"]; record.history = [proposal];
    expect(() => crewPacket(brief, {}, record)).toThrow("missing linked contribution");
  });
  it("removes duplicated exchange envelopes, not the current role's decisions", () => {
    const result = crewPacket(brief, { composer: { summary: "Audible emotional cues", directions: [], findings: [],
      audioCues: [], exchange: [entry("already retained")] } });
    expect(result.contributions.composer).not.toHaveProperty("exchange");
    expect(result.contributions.composer!.summary).toBe("Audible emotional cues");
  });
  it("losslessly resolves packet-local references, including Unicode source and repeated nested facts", () => {
    const fact = { source: "Hatam — " + "exact words ".repeat(100), owner: "script_supervisor" };
    const value = { a: fact, b: fact, nested: [fact, { source: fact.source }] };
    const encoded = encodeCrewPacket(value), parsed = JSON.parse(encoded);
    const decode = (node: any): any => {
      if (node && typeof node === "object" && node.$ref) return decode(parsed.definitions[Number(node.$ref.split("/").at(-1))]);
      if(parsed.idPrefixEncoding==='crew_id_v1'&&node&&typeof node==='object'&&node.$crewId)return parsed.idPrefixes[node.$crewId[0]]+node.$crewId[1];
      if (parsed.objectRowsEncoding==='prefix_columns_v1' && node && typeof node==='object' && node.$columns && node.$rows) return decode(node.$rows).map((row:any[])=>Object.fromEntries(row.map((v,i)=>[decode(node.$columns)[i],v])));
      if (Array.isArray(node)) return node.map(decode);
      if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, decode(v)]));
      return node;
    };
    expect(decode(parsed.payload ?? parsed)).toEqual(value);
    expect(Buffer.byteLength(encoded)).toBeLessThan(Buffer.byteLength(JSON.stringify(value)));
  });
  it("counts UTF-8 schema and text bytes and holds oversized input before a provider can run", () => {
    expect(() => crewInputBudget("字".repeat(400), {}, 1000)).toThrow("before submission");
    expect(() => crewInputBudget("small", { description: "x".repeat(1100) }, 1000)).toThrow("no facts or objections were silently truncated");
    expect(crewInputBudget("é", {}, 1000).suppliedTextBytes).toBe(4);
  });
});
