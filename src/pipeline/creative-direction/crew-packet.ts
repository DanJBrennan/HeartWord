import { recordHash, type ProductionRecord } from "./production-record.js";
import type { CrewBrief, CrewResult } from "./crew-types.js";
import {historicalSettingDecisions} from "../historical-setting.js";

/** Targeted repair is advisory until normal production acceptance. It supplies
 * current facts once, shared scene rules and changed-shot exceptions. Original
 * exchanges remain retrievable; this does not synthesize or replay their prose. */
export function targetedRepairPacket(input: {
  revision: {runId:string;briefHash:string}; role:string; task:string;
  project:CrewBrief["project"]; source:CrewBrief["source"];
  constraints:readonly string[];
  sceneRules:readonly {sceneSequence:number;rules:readonly string[]}[];
  shotExceptions:readonly {shotId:string;change: string}[];
  issues:readonly {id:string;owner:string;scope:string;severity:string;status:string}[];
  changesSinceRevision:readonly string[];
  evidence:readonly {id:string;version:string;location:string;facts:readonly string[]}[];
}) {
  const allowed=new Set(["revision","role","task","project","source","constraints","sceneRules","shotExceptions","issues","changesSinceRevision","evidence"]);
  if(Object.keys(input).some(key=>!allowed.has(key)))throw Error("Unexpected repair field; historical envelopes must stay outside the prompt.");
  if(!input.revision.runId||!input.revision.briefHash||!input.task.trim()||!input.constraints.length||!input.evidence.length)
    throw Error("Targeted repair requires a named baseline, task, constraints and exact evidence references.");
  if(new Set(input.shotExceptions.map(s=>s.shotId)).size!==input.shotExceptions.length)
    throw Error("Duplicate repair shot exception.");
  return structuredClone({...input,schemaVersion:1,
    historicalDecisions:historicalSettingDecisions(input.project,input.sceneRules.map(s=>s.sceneSequence)),
    authority:"Advisory targeted repair only. Unchanged accepted work remains exact. Resolve full evidence by ID before relying on omitted detail; never infer history was reviewed. No source, canon or plan approval is granted by this packet."});
}

/** A projection for inference, never a replacement for durable production state.
 * All current proposals, open objections and their linked evidence survive.
 * Historical alternatives are included when a retained contribution links them.
 * The full record remains in production_runs/result_json and event outputs. */
export function crewPacket(brief: CrewBrief, contributions: CrewResult["contributions"], record?: ProductionRecord) {
  const historicalDecisions=historicalSettingDecisions(brief.project,[...new Set(brief.shots.map(s=>s.sceneSequence))]);
  const team = Object.fromEntries(Object.entries(contributions).map(([role, output]) => {
    const { exchange: _duplicate, ...current } = output!;
    return [role, current];
  }));
  if (!record) return { brief, contributions: team, historicalDecisions };
  const byId = new Map(record.history.map(entry => [entry.id, entry]));
  const needed = new Set(record.acceptedContributionIds);
  for (const objection of record.objections) if (objection.status === "open") needed.add(objection.id);
  for (const output of Object.values(contributions)) for (const entry of output?.exchange ?? []) needed.add(entry.id);
  const superseded = new Set(record.history.flatMap(entry => entry.supersedes ? [entry.supersedes] : []));
  for (const entry of record.history) {
    if (entry.id.startsWith(`${record.revision}:`) && entry.inputBriefSha256 === record.briefHash && entry.inputRevision === record.inputRevision &&
        !superseded.has(entry.id)) needed.add(entry.id);
  }
  // Follow substantive evidence links recursively. Include the immediately
  // replaced alternative, but do not recursively replay its entire supersession
  // ancestry. Any still-open objection is independently seeded above.
  const queue = [...needed];
  const expandable = new Set(needed), expanded = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const entry = byId.get(queue[i]!);
    if (!entry) throw new Error(`Crew context has a missing linked contribution: ${queue[i]}`);
    if (!expandable.has(entry.id) || expanded.has(entry.id)) continue;
    expanded.add(entry.id);
    const links = [...entry.relatedContributions, ...entry.objections,
      ...(entry.supersedes ? [entry.supersedes] : []), ...(entry.resolution?.contributions ?? []),
      ...(entry.resolution?.objectionDispositions.map(o => o.objectionId) ?? [])];
    for (const id of links) {
      if (!byId.has(id)) throw new Error(`Crew context has a missing linked contribution: ${id}`);
      if (!needed.has(id)) { needed.add(id); queue.push(id); }
      if (id !== entry.supersedes && !expandable.has(id)) { expandable.add(id); queue.push(id); }
    }
  }
  const history = record.history.filter(entry => needed.has(entry.id));
  const archivedAncestryLinks = [...new Set(history.flatMap(h => [h.supersedes, ...h.relatedContributions])
    .filter((id): id is string => Boolean(id) && !needed.has(id!)))];
  return {
    brief, contributions: team, historicalDecisions,
    productionRecord: { ...record, history,
      objections: record.objections.filter(o => o.status === "open" || needed.has(o.id)) },
    audit: { fullRecordSha256: recordHash(record), retainedContributionIds: history.map(h => h.id),
      archivedContributionCount: record.history.length - history.length, archivedAncestryLinks,
      archive: "Saved production_runs.result_json and production_events.output_json; archived entries were not supplied or reviewed by this call." }
  };
}

/** Deduplicate repeated JSON values without lossy prose summarization. References
 * are packet-local; they do not imply that an external file/link was read. */
function sharedValuesPacket(value: unknown) {
  const counts = new Map<string, number>();
  const walk = (node: unknown, visit: (key: string) => void) => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "string" && node.length >= 24) visit(JSON.stringify(node));
      return;
    }
    const key = JSON.stringify(node);
    if (key.length >= 240) visit(key);
    for (const child of Object.values(node)) walk(child, visit);
  };
  walk(value, key => counts.set(key, (counts.get(key) ?? 0) + 1));
  const definitions: unknown[] = [], ids = new Map<string, number>();
  const encode = (node: unknown, allowReference = true): unknown => {
    const key = JSON.stringify(node);
    if (allowReference && key && (counts.get(key) ?? 0) > 1) {
      let id = ids.get(key);
      if (id === undefined) {
        id = definitions.length; ids.set(key, id); definitions.push(null);
        definitions[id] = encode(node, false);
      }
      return { $ref: `#/definitions/${id}` };
    }
    if (Array.isArray(node)) return node.map(child => encode(child));
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, encode(v)]));
    return node;
  };
  return { definitions, payload: encode(value) };
}

export function encodeCrewPacket(value: unknown): string {
  const plain=JSON.stringify(value),shared=JSON.stringify(sharedValuesPacket(value));
  let best=Buffer.byteLength(shared)<Buffer.byteLength(plain)?shared:plain;
  // Prefix-shaped rows preserve key order and missing trailing properties.
  // Normalize only as JSON itself does, so undefined never becomes a new null.
  const normalized=JSON.parse(plain);let used=false,ambiguous=false,idAmbiguous=false;
  const scan=(node:any):void=>{if(node&&typeof node==='object'){if(Object.hasOwn(node,'$columns')||Object.hasOwn(node,'$rows'))ambiguous=true;if(Object.hasOwn(node,'$crewId'))idAmbiguous=true;Object.values(node).forEach(scan);}};
  scan(normalized);
  if(ambiguous)return best;
  const rows=(node:any):any=>{
    if(Array.isArray(node)){
      if(node.length>=6&&node.every(v=>v&&typeof v==='object'&&!Array.isArray(v))){
        const columns=Object.keys(node.reduce((a,b)=>Object.keys(a).length>=Object.keys(b).length?a:b));
        if(columns.length&&node.every(v=>Object.keys(v).every((key,i)=>key===columns[i]))){
          used=true;return{$columns:columns,$rows:node.map(v=>Object.keys(v).map(key=>rows(v[key])))};
        }
      }
      return node.map(rows);
    }
    return node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([k,v])=>[k,rows(v)])):node;
  };
  const table=rows(normalized);
  if(used){
    const candidate=JSON.stringify({objectRowsEncoding:'prefix_columns_v1',...sharedValuesPacket(table)});
    if(Buffer.byteLength(candidate)<Buffer.byteLength(best))best=candidate;
  }
  // Durable finding IDs repeat a long run/owner prefix. Keep the ID's exact
  // string value, including its suffix spelling, rather than resending that
  // prefix hundreds of times. This is serialization, not issue renumbering.
  if(!idAmbiguous&&best!==plain){
    const envelope=JSON.parse(best),groups=new Map<string,number>();
    const split=(s:string)=>{const m=s.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z_]+:[12]:finding:)([0-9]+)$/i);return m&&m[0]===s?m:null;};
    const collect=(v:any):void=>{if(typeof v==='string'){const m=split(v);if(m)groups.set(m[1]!,1+(groups.get(m[1]!)??0));}else if(v&&typeof v==='object')Object.values(v).forEach(collect);};
    collect(envelope);const prefixes=[...groups].filter(([,count])=>count>=6).map(([prefix])=>prefix);
    if(prefixes.length){
      const indices=new Map(prefixes.map((prefix,i)=>[prefix,i]));
      const compact=(v:any):any=>{if(typeof v==='string'){const m=split(v),i=m?indices.get(m[1]!):undefined;return i===undefined?v:{$crewId:[i,m![2]]};}return Array.isArray(v)?v.map(compact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,compact(x)])):v;};
      const candidate=JSON.stringify({idPrefixEncoding:'crew_id_v1',idPrefixes:prefixes,...compact(envelope)});
      if(Buffer.byteLength(candidate)<Buffer.byteLength(best))best=candidate;
    }
  }
  return best;
}

export { crewInputBudget } from "../../providers/input-budget.js";

export const CREW_PACKET_INSTRUCTIONS = "Context is a bounded projection of saved state. If definitions/payload are supplied, resolve each packet-local $ref against definitions before reading its value. If the outer objectRowsEncoding is prefix_columns_v1, a {$columns:[keys],$rows:[value-arrays]} represents an array of objects: pair each row value with its corresponding column key; shorter rows omit trailing keys. If outer idPrefixEncoding is crew_id_v1, {$crewId:[i,suffix]} is the exact string idPrefixes[i]+suffix (concatenate verbatim, do not renumber). Resolve references, ID strings and nested tables recursively. This encoding preserves all values and order; it is not a summary or missing evidence. Current source, canon, producer decisions and unresolved objections remain controlling. Full historical exchanges remain archived; do not claim to have inspected omitted history. Missing relevant evidence requires a hold, never an invented resolution.\n";
