import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ROLE_REGISTRY, resolveRoleId } from "../../src/pipeline/creative-direction/role-registry.js";

// Executable design evidence only. This checks a retained hypothetical exchange;
// it installs no stage, patch executor, dispatcher or production approval gate.
const read = (name: string) => JSON.parse(readFileSync(resolve("docs/design/fdl", name), "utf8"));
const core = read("core.v2.schema.json");
const envelope = read("crew-contribution.v1.schema.json");
const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
ajv.addSchema(read("bible-regional.v2.schema.json"));
const validateFilm = ajv.compile(core);
const validateContribution = ajv.compile(envelope);
const fixture = read("example.crew-exchange.v1.json");

type Fact = { value: unknown; units: string; owner: string; status: string; approvalRecord: string | null };
type Target = { layer: "world" | "states" | "shots" | "keyframes"; entityId: string; fact: string };
type Snapshot = Record<Target["layer"], Array<{ id: string; facts: Record<string, Fact> }>> & {
  revision: string; parentRevision: string | null; context: { projectId: string; sceneId: string; briefSha256: string };
};
function factAt(snapshot: Snapshot, target: Target): Fact {
  const fact = snapshot[target.layer].find(entity => entity.id === target.entityId)?.facts[target.fact];
  if (!fact) throw new Error("unresolved FDL target");
  return fact;
}

// The fixture contains only these bounded fact replacements. Checking it is
// intentionally narrower than resolving arbitrary FDL or real saved authority.
function assertExchange(example: typeof fixture): void {
  const snapshots = new Map<string, Snapshot>();
  for (const snapshot of example.snapshots) {
    if (!validateFilm(snapshot)) throw new Error("invalid FDL snapshot");
    if (snapshots.has(snapshot.revision)) throw new Error("duplicate snapshot");
    snapshots.set(snapshot.revision, snapshot);
  }
  const previous = new Map<string, typeof fixture.contributions[number]>();
  const unresolved = new Map<string, typeof fixture.contributions[number]>();
  for (const event of example.contributions) {
    if (!validateContribution(event)) throw new Error("invalid envelope");
    if (previous.has(event.id)) throw new Error("duplicate contribution");
    for (const role of [event.owner, ...event.destination.roles]) {
      if (resolveRoleId(role) !== role) throw new Error("noncanonical role");
    }
    const basis = snapshots.get(event.inputRevision);
    if (!basis || basis.context.briefSha256 !== event.inputBriefSha256 ||
        basis.context.projectId !== event.scope.projectId || !event.scope.sceneIds.includes(basis.context.sceneId)) {
      throw new Error("wrong input context");
    }
    for (const change of event.proposedChanges) {
      if (JSON.stringify(factAt(basis, change.target)) !== JSON.stringify(change.before)) throw new Error("wrong before-value");
      if (change.before.owner !== change.after.owner) throw new Error("domain ownership transfer");
    }
    const refs = [...event.relatedContributions, ...event.objections, ...(event.supersedes ? [event.supersedes] : []),
      ...(event.resolution?.contributions ?? [])];
    if (refs.some(id => !previous.has(id))) throw new Error("lost earlier contribution");
    if (event.supersedes && previous.get(event.supersedes)!.owner !== event.owner) throw new Error("overwritten other owner");
    if (event.objections.some(id => previous.get(id)?.kind !== "objection")) throw new Error("wrong objection reference");
    if (event.kind === "objection") unresolved.set(event.id, event);
    for (const disposition of event.resolution?.objectionDispositions ?? []) {
      const objection = previous.get(disposition.objectionId);
      if (objection?.kind !== "objection") throw new Error("lost objection");
      if (disposition.outcome === "resolved") {
        // A Director may cite the original objector's resolution, never erase it.
        const ownerResponse = event.relatedContributions.map(id => previous.get(id)!).some(response =>
          response.owner === objection.owner && response.resolution?.objectionDispositions.some(
            (item: { objectionId: string; outcome: string }) => item.objectionId === objection.id && item.outcome === "resolved"));
        if (event.owner !== objection.owner && !ownerResponse) throw new Error("waived another role's objection");
        unresolved.delete(objection.id);
      }
    }
    previous.set(event.id, event);
  }
  const accepted = example.acceptedRecord;
  const current = snapshots.get(accepted.currentRevision)!;
  const acceptance = previous.get(accepted.acceptanceRef);
  if (!current || current.context.briefSha256 !== accepted.inputBriefSha256 ||
      acceptance?.owner !== "production_director" || acceptance.resolution?.outcome !== "accepted" ||
      acceptance.resolution.acceptedRevision !== current.revision || acceptance.inputRevision !== current.parentRevision) {
    throw new Error("no current acceptance");
  }
  const basis = snapshots.get(current.parentRevision!)!;
  const selected = acceptance.resolution.contributions.map((id: string) => previous.get(id)!);
  const selectedChanges = new Map<string, Fact>();
  const key = (target: Target) => `${target.layer}/${target.entityId}/${target.fact}`;
  for (const proposal of selected) for (const change of proposal.proposedChanges) {
    if (proposal.inputRevision !== current.parentRevision || proposal.inputBriefSha256 !== accepted.inputBriefSha256) {
      throw new Error("accepted stale proposal");
    }
    if (proposal.owner !== change.before.owner && !selected.some(response => response.owner === change.before.owner &&
        response.resolution?.outcome === "accepted" && response.resolution.contributions.includes(proposal.id))) {
      throw new Error("missing domain consent");
    }
    if (selectedChanges.has(key(change.target))) throw new Error("unresolved conflicting replacements");
    selectedChanges.set(key(change.target), change.after);
  }
  for (const layer of ["world", "states", "shots", "keyframes"] as const) {
    if (JSON.stringify(current[layer].map(entity => entity.id)) !== JSON.stringify(basis[layer].map(entity => entity.id))) {
      throw new Error("changed entity inventory");
    }
    for (const entity of current[layer]) {
      const original = basis[layer].find(item => item.id === entity.id)!;
      if (JSON.stringify(Object.keys(entity.facts)) !== JSON.stringify(Object.keys(original.facts))) throw new Error("changed fact inventory");
      for (const [name, fact] of Object.entries(entity.facts)) {
        const target = { layer, entityId: entity.id, fact: name };
        const proposed = selectedChanges.get(key(target));
        if (!proposed) {
          if (JSON.stringify(fact) !== JSON.stringify(factAt(basis, target))) throw new Error("unaccepted fact leaked");
        } else if (fact.status !== "approved" || fact.approvalRecord !== acceptance.id || fact.owner !== proposed.owner ||
            fact.units !== proposed.units || JSON.stringify(fact.value) !== JSON.stringify(proposed.value)) {
          throw new Error("accepted change missing or altered");
        }
      }
    }
  }
  const handoff = example.handoff;
  if (handoff.inputRevision !== current.revision || handoff.inputBriefSha256 !== accepted.inputBriefSha256 ||
      handoff.acceptanceRef !== acceptance.id) throw new Error("stale handoff");
  if (JSON.stringify(handoff.relevantContributionIds) !== JSON.stringify([...previous.keys()])) throw new Error("lost relevant history");
  if (JSON.stringify(handoff.unresolvedObjectionIds) !== JSON.stringify([...unresolved.keys()])) throw new Error("hidden unresolved objection");
}

describe("structured crew exchange design", () => {
  it("strictly validates reused FDL snapshots and the complete linked exchange", () => {
    expect(() => assertExchange(fixture)).not.toThrow();
    expect(fixture.contributions).toHaveLength(12);
  });

  it("requires the contribution basis, ownership, scope, explanation, evidence, objections and destination", () => {
    for (const field of ["inputRevision", "inputBriefSha256", "owner", "scope", "proposedChanges", "rationale", "evidence", "objections", "destination"]) {
      const event = structuredClone(fixture.contributions[0]);
      delete event[field];
      expect(validateContribution(event), field).toBe(false);
    }
    const revision = structuredClone(fixture.contributions[2]);
    revision.supersedes = null;
    expect(validateContribution(revision)).toBe(false);
    const verdict = structuredClone(fixture.contributions[4]);
    delete verdict.resolution.confidence;
    expect(validateContribution(verdict)).toBe(false);
  });

  it("retains FDL uncertainty/prose and rejects guessed unknowns or malformed metric facts", () => {
    const snapshot = structuredClone(fixture.snapshots[0]);
    expect(snapshot.world[2].facts.hiddenGeometry.value).toBeNull();
    snapshot.world[2].facts.hiddenGeometry.value = "an unseen door";
    expect(validateFilm(snapshot)).toBe(false);
    const event = structuredClone(fixture.contributions[0]);
    event.proposedChanges[0].after.value = "two metres";
    expect(validateContribution(event)).toBe(false);
    event.proposedChanges[0].after.value = [-1, 0, 1.6];
    event.rationale = "The eyeline might read as avoidance; uncertain until the shot is viewed. Preserve this interpretation in prose.";
    expect(validateContribution(event)).toBe(true);
  });

  it("resolves camera placement by revising Leon's domain while retaining Tessa's blocking", () => {
    const [r1, r2] = fixture.snapshots;
    expect(r2.parentRevision).toBe(r1.revision);
    expect(r2.states).toEqual(r1.states);
    expect(r2.world).toEqual(r1.world);
    expect(r2.extensions).toEqual(r1.extensions);
    expect(r2.keyframes[0].facts.cameraPosition.value).toEqual([1, -6, 1.6]);
    const [proposal, objection, revision, ownerResponse, acceptance] = fixture.contributions;
    expect(proposal.proposedChanges[1].after.owner).toBe("choreographer");
    expect(revision.proposedChanges.map((change: { target: Target }) => change.target.fact)).toEqual(["cameraPosition"]);
    expect(ownerResponse.owner).toBe(objection.owner);
    expect(acceptance.relatedContributions).toContain(ownerResponse.id);
    expect(revision.objections).toContain(objection.id);
  });

  it("rejects wardrobe drift with its objection, withdrawal and original-reviewer resolution retained", () => {
    const [r1, r2] = fixture.snapshots;
    const [proposal, objection, withdrawal, rejection] = fixture.contributions.slice(6, 10);
    expect(proposal.proposedChanges[0].after.value).toContain("Blue mantle");
    expect(proposal.owner).toBe("costume_designer");
    expect(proposal.proposedChanges[0].after.owner).toBe("casting_canon");
    expect(objection.finding.severity).toBe("blocking");
    expect(withdrawal.supersedes).toBe(proposal.id);
    expect(rejection.owner).toBe(objection.owner);
    expect(rejection.resolution.outcome).toBe("rejected");
    expect(r2.world[1]).toEqual(r1.world[1]);
    expect(r2.world[1].facts.garment.value).toContain("cream mantle");
  });

  it("keeps transport and workflow authority outside FDL without activating declared roles", () => {
    for (const snapshot of fixture.snapshots) for (const field of ["destination", "objections", "resolution", "runStatus", "costUsd"]) {
      expect(snapshot).not.toHaveProperty(field);
    }
    expect(PRODUCTION_ROLE_REGISTRY.find(role => role.id === "coordinator")!.runtime).toBe("declared");
    expect(PRODUCTION_ROLE_REGISTRY.find(role => role.id === "generation")!.runtime).toBe("declared");
    expect(fixture.handoff.productionStatus).toContain("held_on_design_placeholders");
  });

  it("retains stale work without accepting it or advancing the current snapshot", () => {
    const [late, receipt] = fixture.contributions.slice(-2);
    expect(late.inputRevision).toBe(fixture.snapshots[0].revision);
    expect(receipt.inputRevision).toBe(fixture.acceptedRecord.currentRevision);
    expect(receipt.resolution.outcome).toBe("stale");
    expect(receipt.resolution.contributions).toContain(late.id);
    expect(receipt.resolution.acceptedRevision).toBeNull();
    expect(fixture.handoff.relevantContributionIds).toContain(late.id);
  });

  it("shows which intent-only dispatches hold without claiming live generation readiness", () => {
    for (const check of fixture.dispatchChecks) {
      const hasBlocking = check.unresolvedObjections.some((id: string) =>
        fixture.contributions.find((event: { id: string }) => event.id === id)?.finding?.severity === "blocking");
      const current = fixture.acceptedRecord;
      const result = check.revision === current.currentRevision && check.briefSha256 === current.inputBriefSha256 &&
        check.acceptanceRef === current.acceptanceRef && !hasBlocking ? "accepted_intent_only" : "hold";
      expect(result, check.label).toBe(check.expected);
    }
    // Even the accepted fixture still contains unresolved bind:* authorities.
    expect(fixture.snapshots[1].extensions.bibleRegional.gateRecordRefs.sourceReview).toBeNull();
  });

  it("rejects a Director erasing the blocking owner's response", () => {
    const example = structuredClone(fixture);
    example.contributions[4].relatedContributions = example.contributions[4].relatedContributions.filter(
      (id: string) => id !== "example:blocking-resolution");
    expect(() => assertExchange(example)).toThrow("waived another role's objection");
  });

  it("rejects accepting the original cross-domain actor move without its owner's consent", () => {
    const example = structuredClone(fixture);
    example.contributions[4].resolution.contributions = [example.contributions[0].id];
    expect(() => assertExchange(example)).toThrow("missing domain consent");
  });

  it("detects rejected wardrobe leakage, conflicts and lost disagreement context", () => {
    const wardrobe = structuredClone(fixture);
    wardrobe.snapshots[1].world[1].facts.garment.value = "Blue mantle";
    wardrobe.contributions[6].proposedChanges[0].before.value = "Blue mantle";
    expect(() => assertExchange(wardrobe)).toThrow("unaccepted fact leaked");
    const deleted = structuredClone(fixture);
    delete deleted.snapshots[1].world[1].facts.garment;
    deleted.contributions[6].proposedChanges = [];
    expect(() => assertExchange(deleted)).toThrow("changed fact inventory");
    const conflict = structuredClone(fixture);
    conflict.contributions[4].resolution.contributions.push(conflict.contributions[2].id);
    expect(() => assertExchange(conflict)).toThrow();
    const history = structuredClone(fixture);
    history.handoff.relevantContributionIds = history.handoff.relevantContributionIds.filter((id: string) => id !== "example:wardrobe-objection");
    expect(() => assertExchange(history)).toThrow("lost relevant history");
    const advisory = structuredClone(fixture);
    advisory.handoff.unresolvedObjectionIds = [];
    expect(() => assertExchange(advisory)).toThrow("hidden unresolved objection");
  });

  it("rejects stale handoffs, wrong before-values, ownership theft and historical role aliases", () => {
    const stale = structuredClone(fixture);
    stale.handoff.inputRevision = stale.snapshots[0].revision;
    expect(() => assertExchange(stale)).toThrow("stale handoff");
    const before = structuredClone(fixture);
    before.contributions[10].proposedChanges[0].before = before.snapshots[1].keyframes[0].facts.cameraPosition;
    expect(() => assertExchange(before)).toThrow("wrong before-value");
    const owner = structuredClone(fixture);
    owner.contributions[0].proposedChanges[1].after.owner = "cinematographer";
    expect(() => assertExchange(owner)).toThrow("domain ownership transfer");
    const alias = structuredClone(fixture);
    alias.contributions[0].owner = "cinematography";
    expect(() => assertExchange(alias)).toThrow("noncanonical role");
  });
});
