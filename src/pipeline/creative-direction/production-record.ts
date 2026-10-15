import { createHash } from "node:crypto";
import { resolveRoleId } from "./role-registry.js";
import type { CrewBrief, CrewContribution, CrewFinding, CrewPhase, CrewRole } from "./crew-types.js";

// The runtime deliberately starts with qualitative FDL v2 facts. This is a
// bounded projection of saved production data, not another film language or
// an arbitrary JSON-patch interpreter. Authority/transport live outside FDL.
export interface FilmFact {
  value: string | null; units: "none"; status: "unknown" | "open" | "observed" | "proposed" | "approved";
  owner: string; reason: string; evidence: Array<{ ref: string; limitations: string }>; approvalRecord: string | null;
}
interface FilmEntity { id: string; facts: Record<string, FilmFact>; [key: string]: unknown }
export interface FilmSnapshot {
  fdlVersion: 2; purpose: "production"; revision: string; parentRevision: string | null; inputRevision: string;
  context: { projectId: string; sceneId: string; briefSha256: string }; prose: string;
  world: FilmEntity[]; states: FilmEntity[]; shots: FilmEntity[]; keyframes: FilmEntity[]; clips: never[];
  extensions: { bibleRegional: Record<string, unknown> };
}
export interface FilmChange {
  target: { layer: "world" | "states" | "shots" | "keyframes"; entityId: string; fact: string };
  before: FilmFact; after: FilmFact;
}
export interface OwnerResponse { contributionId: string; outcome: "accepted" | "rejected"; rationale: string; evidence: string }
export interface ObjectionResponse { objectionId: string; outcome: "resolved" | "carried"; rationale: string; evidence: string }
export interface SavedContribution {
  id: string; kind: "proposal" | "revision" | "objection" | "resolution"; inputRevision: string; inputBriefSha256: string;
  owner: string; scope: { projectId: string; sceneIds: string[]; shotIds: string[]; verseRefs: string[]; audioBindingRefs: string[] };
  proposedChanges: FilmChange[]; rationale: string; evidence: Array<{ ref: string; limitations: string }>;
  objections: string[]; destination: { roles: string[]; stage: string; subjectId: string };
  relatedContributions: string[]; supersedes: string | null; finding: Pick<CrewFinding, "severity" | "confidence" | "limitations"> | null;
  resolution: { outcome: string; contributions: string[]; objectionDispositions: Array<{ objectionId: string; outcome: string; reason: string }>; acceptedRevision: string | null; confidence?:number; limitations?:string } | null;
}
export interface SavedObjection extends CrewFinding { id: string; owner: string; status: "open" | "resolved"; resolutionId?: string }
export interface ProductionRecord {
  version: 1; revision: string; inputRevision: string; parentRevision: string | null; briefHash: string;
  status: "proposed" | "accepted" | "held"; snapshots: FilmSnapshot[];
  history: SavedContribution[]; objections: SavedObjection[]; acceptedContributionIds: string[];
  producerOverrideShotIds: string[];
}
const copy = <T>(value: T): T => structuredClone(value);
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const recordHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ids = (items: string[]) => [...new Set(items)];
const fact = (value: string | null, owner: string, ref: string, approved = false): FilmFact => ({
  value, units: "none", status: value === null ? "unknown" : approved ? "approved" : "proposed", owner,
  reason: value === null ? "Not established by saved production evidence." : "Retain the supplied saved production decision; do not infer additional detail.",
  evidence: [{ ref, limitations: "Saved intent/reference, not proof of generated pixels or new source/canon approval." }],
  approvalRecord: approved && value !== null ? ref : null
});

export function projectFilm(brief: CrewBrief, revision: string, hash: string, inputRevision: string, parentRevision: string | null): FilmSnapshot[] {
  return ids(brief.shots.map(s => s.sceneId)).map(sceneId => {
    const shots = brief.shots.filter(s => s.sceneId === sceneId);
    const ref = `production_runs:${revision}:brief`;
    const cast = brief.canon.filter(c => shots.some(s => s.characterIds.includes(c.id)));
    return {
      fdlVersion: 2, purpose: "production", revision: `${revision}:${sceneId}`, parentRevision: parentRevision ? `${parentRevision}:${sceneId}` : null,
      inputRevision, context: { projectId: brief.project.id, sceneId, briefSha256: hash },
      prose: "Saved chapter intent beside prose. Scripture, measured source/cast audio, approved regional identity, producer decisions and accepted assets remain controlling. Unknowns are not permission to invent facts.",
      world: [...cast.map(c => ({ id: c.id, kind: "character", recordRefs: [{ table: "character_versions", id: c.versionId, version: c.versionId, snapshotSha256: null }],
        facts: { appearance: fact(`Use the exact approved ${c.region} video identity and references. ${c.notes ?? ""}`, "casting_canon", `character_versions:${c.versionId}`, true),
          garment: fact(c.notes, "casting_canon", `character_versions:${c.versionId}`, true) } })),
        { id: `set:${sceneId}`, kind: "set", recordRefs: [{ table: "production_runs", id: revision, version: revision, snapshotSha256: null }],
          facts: { architecture: fact(shots[0]?.spatialContinuity ?? null, "staging_designer", ref), hiddenGeometry: fact(null, "staging_designer", ref) } }],
      states: shots.map(s => ({ id: `state:${s.id}`, worldIds: [...s.characterIds, `set:${sceneId}`], facts: {
        performance: fact(s.action, "creative_director", ref), "light.direction": fact(s.lighting, "lighting_designer", ref),
        ...Object.fromEntries(s.characterIds.flatMap(id => [[`${id}.pose`, fact(null, "choreographer", ref)], [`${id}.gaze`, fact(null, "choreographer", ref)]]))
      } })),
      shots: shots.map(s => ({ id: s.id, recordRefs: [{ table: "shots", id: s.id, version: null, snapshotSha256: recordHash(s) }], facts: {
        framing: fact(s.framing, "cinematographer", ref), cameraPosition: fact(s.spatialView ?? null, "cinematographer", ref),
        cameraMovement: fact(s.cameraMovement, "cinematographer", ref), continuity: fact(s.continuity, "script_supervisor", ref),
        crowdDensity: fact(s.crowdDensity ?? null, "staging_designer", ref)
      } })), keyframes: [], clips: [],
      extensions: { bibleRegional: {
        extensionVersion: 2, source: { sourceBindingRef: `${ref}:source`, language: brief.project.language, book: brief.project.book, chapter: brief.project.chapter,
          verseRefs: ids(shots.map(s => s.verseRef)), sourceIntervalRefs: brief.audio.filter(a => a.verseRef).map(a => a.id), referencePurpose: "semantic_context_only", internalVerseTiming: "unresolved" },
        regionalIdentity: { region: brief.canon[0]?.region ?? "unresolved", medium: "video", appliesTo: "character_identity", canonContextRef: `${ref}:canon`, characterVersionRefs: cast.map(c => c.versionId) },
        historicalSetting: { period: "First century", place: "Biblical setting from the verified passage; regional identity does not relocate it.", setVersionRefs: [ref], approvedReconstructionRefs: [], unknowns: ["Unrecorded geometry and historical details"] },
        grounding: [{ target: "scene", authority: "verified_source", refs: [ref], limitations: "Source context does not establish unstated staging or geometry." }],
        gateRecordRefs: { videoEligibility: null, citationScope: null, sourceReview: null, canonApproval: null, historicalReconstruction: null, fieldReview: null, releaseApproval: null }
      } }
    };
  });
}

export function newProductionRecord(brief: CrewBrief, revision: string, hash: string, prior?: ProductionRecord): ProductionRecord {
  const parentRevision = prior?.status === "accepted" ? prior.revision : prior?.parentRevision ?? null;
  const inputRevision = parentRevision ?? `brief:${hash}`;
  const snapshots = projectFilm(brief, revision, hash, inputRevision, parentRevision);
  if (prior?.status === "accepted" && prior.briefHash === hash) for (const snapshot of snapshots) {
    const old = prior.snapshots.find(s => s.context.sceneId === snapshot.context.sceneId);
    if (old) for (const layer of ["world", "states", "shots"] as const) snapshot[layer] = copy(old[layer]);
  }
  return { version: 1, revision, inputRevision, parentRevision, briefHash: hash, status: "proposed", snapshots,
    history: copy(prior?.history ?? []), objections: copy(prior?.objections ?? []), acceptedContributionIds: [],
    producerOverrideShotIds: copy(prior?.producerOverrideShotIds ?? []) };
}

export function filmTarget(record: ProductionRecord, target: FilmChange["target"]): FilmFact {
  const found = record.snapshots.flatMap(s => s[target.layer]).filter(e => e.id === target.entityId);
  if (found.length !== 1 || !found[0]!.facts[target.fact]) throw new Error("Unknown or ambiguous FDL fact target.");
  return found[0]!.facts[target.fact]!;
}
function bounded(value: unknown): asserts value is string { if (typeof value !== "string" || !value.trim() || value.length > 12000) throw new Error("Expected bounded exchange explanation."); }
function array(value: unknown): asserts value is unknown[] { if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid exchange list."); }
function validateFact(f: FilmFact): void {
  if(f && Object.keys(f).some(k=>!["value","units","status","owner","reason","evidence","approvalRecord"].includes(k)))throw new Error("Unexpected FDL fact property.");
  if (!f || f.units !== "none" || (f.value !== null && typeof f.value !== "string") || resolveRoleId(f.owner) !== f.owner ||
      !["unknown", "open", "observed", "proposed", "approved"].includes(f.status)) throw new Error("Invalid qualitative FDL fact.");
  if ((f.status === "unknown" || f.status === "open") !== (f.value === null)) throw new Error("FDL uncertainty cannot contain a guess.");
  bounded(f.reason); array(f.evidence);
  for (const evidence of f.evidence) { bounded(evidence.ref); if (typeof evidence.limitations !== "string") throw new Error("Missing evidence limitations."); }
  if (f.status === "approved" ? !f.approvalRecord || !f.evidence.length : f.approvalRecord !== null) throw new Error("Invalid FDL approval provenance.");
  if (f.status === "observed" && !f.evidence.length) throw new Error("An observation needs evidence.");
}

/** Validate against the actual pinned input, never against a model's owner claim. */
export function validateFilmExchange(output: CrewContribution, role: CrewRole, record: ProductionRecord): void {
  for (const field of ["filmChanges", "ownerResponses", "objectionResponses", "withdrawals", "acceptedContributionIds"] as const) if (output[field] !== undefined) array(output[field]);
  const seen = new Set<string>();
  for (const change of output.filmChanges ?? []) {
    if (!change?.target || !["world", "states", "shots", "keyframes"].includes(change.target.layer)) throw new Error("Invalid FDL target.");
    validateFact(change.before); validateFact(change.after);
    const actual = filmTarget(record, change.target), key = JSON.stringify(change.target);
    if (seen.has(key)) throw new Error("Conflicting replacements in one contribution."); seen.add(key);
    if (!same(actual, change.before) || actual.owner !== change.after.owner) throw new Error("Stale FDL before-value or domain ownership transfer.");
    if (change.after.status !== "proposed" && change.after.status !== "unknown" && change.after.status !== "open") throw new Error("An agent may propose, not approve its own changed fact.");
  }
  for (const response of output.ownerResponses ?? []) {
    const proposal = record.history.find(h => h.id === response.contributionId);
    if (!proposal?.proposedChanges.some(c => c.after.owner === role) || !["accepted", "rejected"].includes(response.outcome)) throw new Error("Only the affected domain owner may review this proposal.");
    bounded(response.rationale); bounded(response.evidence);
  }
  for (const response of output.objectionResponses ?? []) {
    const objection = record.objections.find(o => o.id === response.objectionId);
    if (!objection || objection.owner !== role || !["resolved", "carried"].includes(response.outcome)) throw new Error("Only the original objector may resolve its finding.");
    bounded(response.rationale); bounded(response.evidence);
  }
  for(const withdrawal of output.withdrawals??[]){
    const proposal=record.history.find(h=>h.id===withdrawal.contributionId);
    if(!proposal||proposal.owner!==role||!["proposal","revision"].includes(proposal.kind))throw new Error("Only the author can withdraw a proposal.");
    bounded(withdrawal.rationale);bounded(withdrawal.evidence);
  }
  if (output.acceptedContributionIds?.length && role !== "production_director") throw new Error("Only the Production Director can select reviewed contributions.");
}

export function saveContribution(record: ProductionRecord, brief: CrewBrief, role: CrewRole, round: number, output: CrewContribution, phase: CrewPhase): SavedContribution[] {
  validateFilmExchange(output, role, record);
  const id = `${record.revision}:${role}:${round}`;
  const previous = record.history.filter(h => h.owner === role && (h.kind === "proposal" || h.kind === "revision")).at(-1);
  const scope = { projectId: brief.project.id, sceneIds: ids(brief.shots.map(s => s.sceneId)), shotIds: brief.shots.map(s => s.id),
    verseRefs: ids(brief.shots.map(s => s.verseRef)), audioBindingRefs: brief.shots.flatMap(s => s.sourceSegmentId ? [s.sourceSegmentId] : []) };
  const primary: SavedContribution = { id, kind: previous ? "revision" : "proposal", inputRevision: record.inputRevision, inputBriefSha256: record.briefHash,
    owner: role, scope, proposedChanges: copy(output.filmChanges ?? []), rationale: output.summary,
    evidence: [{ ref: `production_events:${id}`, limitations: "Retained role output and its reported rationale/evidence; not independent approval." }],
    objections: record.objections.filter(o => o.status === "open").map(o => o.id),
    destination: { roles: ids([...(output.filmChanges ?? []).map(c => c.after.owner), "production_director"]), stage: phase === "planning" ? "casting" : phase === "editing" ? "assembly" : "qc", subjectId: brief.project.id },
    relatedContributions: ids([...(previous ? [previous.id] : []), ...(output.ownerResponses ?? []).map(r => r.contributionId)]), supersedes: previous?.id ?? null, finding: null, resolution: null };
  const events: SavedContribution[] = [primary];
  for (const [index, finding] of output.findings.entries()) {
    const objectionId = `${id}:finding:${index}`;
    record.objections.push({ ...copy(finding), id: objectionId, owner: role, status: "open" });
    events.push({ ...copy(primary), id: objectionId, kind: "objection", proposedChanges: [], supersedes: null, rationale: finding.requestedChange,
      finding: { severity:finding.severity, confidence:finding.confidence, limitations:finding.limitations }, relatedContributions: [id], objections: [] });
  }
  for (const [index, response] of (output.objectionResponses ?? []).entries()) {
    const resolutionId = `${id}:objection:${index}`, objection = record.objections.find(o => o.id === response.objectionId)!;
    if (response.outcome === "resolved") { objection.status = "resolved"; objection.resolutionId = resolutionId; }
    events.push({ ...copy(primary), id: resolutionId, kind: "resolution", proposedChanges: [], supersedes: null, rationale: `${response.rationale}\nEvidence: ${response.evidence}`,
      relatedContributions: [id, response.objectionId], objections: [response.objectionId],
      resolution: { outcome: response.outcome === "resolved" ? "accepted" : "held", contributions: [id], objectionDispositions: [{ objectionId: response.objectionId, outcome: response.outcome, reason: response.rationale }], acceptedRevision: null } });
  }
  for (const [index, response] of (output.ownerResponses ?? []).entries()) events.push({ ...copy(primary), id: `${id}:domain:${index}`, kind: "resolution", proposedChanges: [], supersedes: null,
    rationale: `${response.rationale}\nEvidence: ${response.evidence}`, relatedContributions: [id, response.contributionId],
    resolution: { outcome: response.outcome, contributions: [response.contributionId], objectionDispositions: [], acceptedRevision: null } });
  for(const [index,withdrawal] of (output.withdrawals??[]).entries())events.push({...copy(primary),id:`${id}:withdrawal:${index}`,kind:"resolution",proposedChanges:[],supersedes:null,
    rationale:`${withdrawal.rationale}\nEvidence: ${withdrawal.evidence}`,relatedContributions:[id,withdrawal.contributionId],
    resolution:{outcome:"rejected",contributions:[withdrawal.contributionId],objectionDispositions:[],acceptedRevision:null}});
  record.history.push(...events);
  return events;
}

export function acceptProductionRecord(record: ProductionRecord, director: CrewContribution): void {
  if (record.objections.some(o => o.status === "open" && o.severity === "blocking")) throw new Error("Unresolved blocking objections remain in the saved production record.");
  const selected = director.acceptedContributionIds ?? [];
  if (new Set(selected).size !== selected.length) throw new Error("Duplicate accepted contribution.");
  const replacements = new Set<string>();
  for (const id of selected) {
    const proposal = record.history.find(h => h.id === id);
    if (!proposal || !["proposal", "revision"].includes(proposal.kind) || proposal.inputRevision !== record.inputRevision || proposal.inputBriefSha256 !== record.briefHash ||
        !id.startsWith(`${record.revision}:`) || record.history.some(h => h.supersedes === id)) throw new Error("A selected contribution is stale, superseded or unknown.");
    for (const change of proposal.proposedChanges) {
      // Canon/set facts use existing specific approval tools, not crew votes.
      if (change.target.layer === "world") throw new Error("A crew contribution cannot replace approved canon or persistent set facts.");
      if (change.after.owner !== proposal.owner && !record.history.some(h => h.owner === change.after.owner && h.kind === "resolution" && h.resolution?.outcome === "accepted" && h.resolution.contributions.includes(id))) {
        throw new Error("Cross-domain proposal lacks the accountable owner's acceptance.");
      }
      if (record.history.some(h => h.kind === "resolution" && h.resolution?.outcome === "rejected" && h.resolution.contributions.includes(id))) throw new Error("Rejected proposal cannot reach generation.");
      const key = JSON.stringify(change.target);
      if (replacements.has(key)) throw new Error("Selected contributions conflict on an FDL fact."); replacements.add(key);
      const current = filmTarget(record, change.target);
      if (current.approvalRecord?.includes(":producer-edit")) throw new Error("A producer decision requires an explicit producer revision; a crew proposal cannot overwrite it.");
      if (!same(current, change.before)) throw new Error("Selected contribution has a stale before-value.");
    }
  }
  for (const id of selected) for (const change of record.history.find(h => h.id === id)!.proposedChanges) {
    Object.assign(filmTarget(record, change.target), copy(change.after), change.after.value === null ? {} : {
      status: "approved", approvalRecord: `production_runs:${record.revision}:acceptance`, evidence: [{ ref: id, limitations: "Accepted local intent, not proof of provider compliance." }]
    });
  }
  for (const snapshot of record.snapshots) for (const layer of ["states", "shots"] as const) for (const entity of snapshot[layer]) for (const value of Object.values(entity.facts)) {
    if (value.status === "proposed") { value.status = "approved"; value.approvalRecord = `production_runs:${record.revision}:acceptance`; }
  }
  const primary = record.history.filter(h => h.owner === "production_director" && h.id.startsWith(`${record.revision}:`) && (h.kind === "proposal" || h.kind === "revision")).at(-1)!;
  record.history.push({ ...copy(primary), id:`${record.revision}:acceptance`, kind:"resolution", supersedes:null, proposedChanges:[], relatedContributions:ids([primary.id,...selected]),
    resolution:{ outcome:"accepted", contributions:ids([primary.id,...selected]), objectionDispositions:[], acceptedRevision:record.revision,confidence:director.decisionConfidence,limitations:director.decisionLimitations } });
  record.acceptedContributionIds = [...selected]; record.status = "accepted";
}

export function acceptedFilmDirection(record: ProductionRecord, shotId: string): string {
  if (record.status !== "accepted") throw new Error("The saved production revision was not accepted.");
  const snapshot = record.snapshots.find(s => s.shots.some(shot => shot.id === shotId));
  if (!snapshot) throw new Error("Shot is outside the accepted FDL snapshot.");
  const state = snapshot.states.find(s => s.id === `state:${shotId}`)!;
  const shot = snapshot.shots.find(s => s.id === shotId)!;
  return `\nACCEPTED FDL CONSTRAINTS (revision ${record.revision}):\n` +
    // Canon images/locked facts retain their existing reference-packet path;
    // do not treat a canon's prohibitions as mutable prompt instructions.
    [state, shot].flatMap(entity => Object.entries(entity.facts).filter(([, f]) => f.value !== null && f.status !== "proposed" && f.status !== "observed")
      .map(([name, f]) => `${entity.id}.${name}: ${f.value}`)).join("\n");
}
