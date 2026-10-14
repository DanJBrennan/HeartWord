import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ROLE_REGISTRY, resolveRoleId } from "../../src/pipeline/creative-direction/role-registry.js";

// Executable design contracts only. No DB, production gate, compiler, image
// inspection or provider is implemented/invoked by these tests.
const read = (name: string) => JSON.parse(readFileSync(resolve("docs/design/fdl", name), "utf8"));
const core = read("core.v2.schema.json");
const extension = read("bible-regional.v2.schema.json");
const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
ajv.addSchema(extension);
const validate = ajv.compile(core);
const anchor = read("example.v2.anchor.json");
const sequence = read("example.v2.scene.json");
const inspection = read("example.v2.anchor-inspection.json");
const copy = () => structuredClone(sequence);

interface Fact { value: unknown; units: string; status: string }
interface Entity { id: string; facts: Record<string, Fact> }
interface Example {
  world: Entity[];
  states: Array<Entity & { worldIds: string[] }>;
  shots: Entity[];
  keyframes: Array<Entity & { shotId: string; stateId: string }>;
  clips: Array<{ id: string; shotId: string; startKeyframe: string; endKeyframe: string | null;
    endStateId: string; durationMs: number; motion: Array<{ subjectId: string; property: string;
      startMs: number; endMs: number; from: Fact; to: Fact }> }>;
}

// Check this camera-only worked sequence's semantics independently of schema
// shape. A future runtime resolver still needs actual saved records/authority.
function assertExampleLinks(packet: Example): void {
  const ids = new Set<string>();
  for (const entries of [packet.world, packet.states, packet.shots, packet.keyframes, packet.clips]) {
    for (const item of entries) {
      if (ids.has(item.id)) throw new Error("duplicate ID");
      ids.add(item.id);
    }
  }
  const world = new Map(packet.world.map(item => [item.id, item]));
  const states = new Map(packet.states.map(item => [item.id, item]));
  const shots = new Map(packet.shots.map(item => [item.id, item]));
  const frames = new Map(packet.keyframes.map(item => [item.id, item]));
  for (const state of packet.states) {
    for (const id of state.worldIds) if (!world.has(id)) throw new Error("unknown world ID");
    for (const entity of packet.world) for (const name of Object.keys(entity.facts)) {
      if (`${entity.id}.${name}` in state.facts) throw new Error("shadowed persistent fact");
    }
  }
  for (const frame of packet.keyframes) {
    if (!states.has(frame.stateId) || !shots.has(frame.shotId)) throw new Error("unknown state/shot");
  }
  for (const clip of packet.clips) {
    const first = frames.get(clip.startKeyframe);
    const last = clip.endKeyframe ? frames.get(clip.endKeyframe) : undefined;
    if (!first || (clip.endKeyframe && !last) || !states.has(clip.endStateId)) throw new Error("unknown endpoint");
    if (!shots.has(clip.shotId) || first.shotId !== clip.shotId || (last && last.shotId !== clip.shotId)) throw new Error("cross-shot endpoint");
    if (last && last.stateId !== clip.endStateId) throw new Error("end state mismatch");
    for (const track of clip.motion) {
      if (!(0 <= track.startMs && track.startMs < track.endMs && track.endMs <= clip.durationMs)) throw new Error("unbounded motion");
      if (track.subjectId !== "camera") {
        if (!world.has(track.subjectId)) throw new Error("unknown motion subject");
        if (track.property in world.get(track.subjectId)!.facts) throw new Error("persistent mutation");
        throw new Error("this example declares only camera changes");
      }
      const begin = first.facts[track.property] ?? shots.get(clip.shotId)!.facts[track.property];
      const end = last?.facts[track.property] ?? shots.get(clip.shotId)!.facts[track.property];
      if (!begin || !end || track.from.units !== begin.units || track.to.units !== end.units ||
          JSON.stringify(track.from.value) !== JSON.stringify(begin.value) ||
          JSON.stringify(track.to.value) !== JSON.stringify(end.value)) throw new Error("motion endpoint mismatch");
    }
  }
}

describe("FDL v2 design contracts", () => {
  it("compiles both schemas strictly and validates the initial and successive packets", () => {
    for (const packet of [anchor, sequence]) {
      expect(validate(packet), JSON.stringify(validate.errors)).toBe(true);
      expect(() => assertExampleLinks(packet)).not.toThrow();
    }
    expect(ajv.getSchema(extension.$id)!(sequence.extensions.bibleRegional)).toBe(true);
  });

  it("distinguishes open choices/unknowns from invented known values", () => {
    for (const status of ["unknown", "open"]) {
      const packet = copy();
      packet.world[3].facts.hiddenGeometry.status = status;
      packet.world[3].facts.hiddenGeometry.value = "A hidden second door";
      expect(validate(packet)).toBe(false);
    }
    const packet = copy();
    packet.world[0].facts.appearance.value = null;
    expect(validate(packet)).toBe(false);
  });

  it("requires observed evidence and prevents approval attached to an observation", () => {
    const packet = copy();
    const fact = packet.world[3].facts.furnishings;
    Object.assign(fact, { status: "observed", value: "Two visible bench ends", evidence: [] });
    expect(validate(packet)).toBe(false);
    fact.evidence = [{ ref: "example:K1", limitations: "Partial visibility" }];
    expect(validate(packet)).toBe(true);
    fact.approvalRecord = "example:accidental-canon-promotion";
    expect(validate(packet)).toBe(false);
  });

  it("cannot mark a fact approved without both evidence and an approval reference", () => {
    for (const missing of ["approvalRecord", "evidence"]) {
      const packet = copy();
      packet.world[0].facts.appearance[missing] = missing === "evidence" ? [] : null;
      expect(validate(packet)).toBe(false);
    }
  });

  it("checks numeric units, vector arity and positive lens dimensions", () => {
    for (const value of ["six metres", [0, -6], [0, -6, 1.6, 99]]) {
      const packet = copy();
      packet.keyframes[0].facts.cameraPosition.value = value;
      expect(validate(packet)).toBe(false);
    }
    const packet = copy();
    packet.shots[0].facts.lensFocalLength.value = -35;
    expect(validate(packet)).toBe(false);
  });

  it("pins records and portable assets without pretending hashes prove approval", () => {
    const packet = copy();
    packet.world[0].recordRefs[0].version = null;
    expect(validate(packet)).toBe(false);
    packet.world[0].recordRefs[0].snapshotSha256 = "a".repeat(64);
    expect(validate(packet)).toBe(true);
    packet.world[0].recordRefs[0].version = "latest";
    expect(validate(packet)).toBe(false);
    packet.world[0].recordRefs[0].version = null;
    packet.keyframes[0].selectedAsset = structuredClone(inspection.sourceAsset);
    expect(validate(packet)).toBe(true); // A fixture hash is structurally valid, not real media.
    for (const uri of ["../K1.png", "assets/../K1.png", "assets/./K1.png", "/K1.png", "C:/K1.png", "https://example.com/K1.png", "assets\\K1.png"]) {
      packet.keyframes[0].selectedAsset.uri = uri;
      expect(validate(packet), uri).toBe(false);
    }
    packet.keyframes[0].selectedAsset.uri = "assets/K1.png";
    packet.keyframes[0].selectedAsset.sha256 = "missing";
    expect(validate(packet)).toBe(false);
  });

  it("uses canonical role contracts without making declared owners executable", () => {
    for (const id of core.$defs.owner.enum) {
      expect(PRODUCTION_ROLE_REGISTRY.some(role => role.id === id)).toBe(true);
      expect(resolveRoleId(id)).toBe(id);
    }
    expect(PRODUCTION_ROLE_REGISTRY.find(role => role.id === "casting_canon")!.runtime).toBe("declared");
    const packet = copy();
    packet.world[3].facts.architecture.owner = "production_designer"; // Historical alias.
    expect(validate(packet)).toBe(false);
  });

  it("validates the embedded extension and keeps people/geography/source authority separate", () => {
    const packet = copy();
    const ext = packet.extensions.bibleRegional;
    expect(ext.regionalIdentity.region).toBe("Papuan");
    expect(ext.regionalIdentity.appliesTo).toBe("character_identity");
    expect(ext.historicalSetting.place).toContain("Galilee");
    expect(ext.source.internalVerseTiming).toBe("unresolved");
    ext.regionalIdentity.appliesTo = "setting";
    expect(validate(packet)).toBe(false);
    ext.regionalIdentity.appliesTo = "character_identity";
    ext.source.referencePurpose = "rewrite_hatam";
    expect(validate(packet)).toBe(false);
    ext.source.referencePurpose = "semantic_context_only";
    ext.grounding[2].refs = [];
    expect(validate(packet)).toBe(false);
    const separate = copy();
    separate.extensions.bibleRegional.extensionVersion = 1;
    expect(validate(separate)).toBe(false);
  });

  it("preserves speech speed and requires a saved safe-boundary reference for a pause", () => {
    const packet = copy();
    packet.clips[0].audio.spokenSpeed = 0.9;
    expect(validate(packet)).toBe(false);
    packet.clips[0].audio.spokenSpeed = 1;
    packet.clips[0].audio.bindingRefs = [];
    expect(validate(packet)).toBe(false);
    packet.clips[0].audio.mode = "editorial_pause";
    expect(validate(packet)).toBe(false);
    packet.clips[0].audio.safePauseRef = "bind:reviewed-safe-boundary-and-gap";
    expect(validate(packet)).toBe(true); // Actual evidence must still resolve in existing gates.
  });

  it("keeps fixed world/state/lens/light/gaze and explains exactly the camera change", () => {
    expect(sequence.world).toEqual(anchor.world);
    expect(sequence.states).toEqual(anchor.states);
    expect(sequence.shots).toEqual(anchor.shots);
    expect(sequence.context).toEqual(anchor.context);
    expect(sequence.parentRevision).toBe(anchor.revision);
    expect(sequence.keyframes[0]).toEqual(anchor.keyframes[0]);
    expect(sequence.clips[0].motion).toHaveLength(1);
    expect(sequence.clips[0].motion[0].subjectId).toBe("camera");
    expect(sequence.providerSettings[0].targetId).toBe("C1");
    expect(sequence.providerSettings[0].requiredFields).toContain("startFrame");
    expect(sequence.providerSettings[0].settings.durationSeconds * 1000).toBe(sequence.clips[0].durationMs);
    expect(sequence.providerSettings[0].settings).not.toHaveProperty("lensFocalLength");
    expect(sequence.clips[0].motion[0].reason).toContain("story state and source performance stay continuous");
    const bad = copy();
    bad.clips[0].motion[0].to.value = [0, -2, 1.6];
    expect(validate(bad)).toBe(true);
    expect(() => assertExampleLinks(bad)).toThrow("motion endpoint mismatch");
  });

  it("detects missing/cross-scope endpoints, duplicate IDs, out-of-range motion and fixed-fact mutation", () => {
    const mutations = [
      (p: any) => { p.keyframes[1].stateId = "missing-state"; },
      (p: any) => { p.keyframes[1].id = "K1"; },
      (p: any) => { p.clips[0].endKeyframe = "missing-frame"; },
      (p: any) => { p.clips[0].motion[0].endMs = 6000; },
      (p: any) => { p.clips[0].motion[0].startMs = 5000; },
      (p: any) => { p.clips[0].motion[0].subjectId = "jesus"; p.clips[0].motion[0].property = "appearance"; },
      (p: any) => { p.states[0].facts["jesus.appearance"] = p.world[0].facts.appearance; }
    ];
    for (const mutate of mutations) {
      const packet = copy(); mutate(packet);
      expect(validate(packet)).toBe(true); // Shape alone cannot resolve relationships.
      expect(() => assertExampleLinks(packet)).toThrow();
    }
  });

  it("retains inspection uncertainty and proposals without promoting them to later canon", () => {
    expect(inspection.inputRevision).toBe(anchor.revision);
    expect(inspection.observations.map((fact: Fact) => fact.status)).toEqual(["observed", "unknown"]);
    expect(inspection.proposals.every((fact: any) => fact.status === "proposed" && fact.approvalRecord === null)).toBe(true);
    const [x, y, width, height] = inspection.observations[0].evidence[0].region;
    expect(x + width).toBeLessThanOrEqual(1);
    expect(y + height).toBeLessThanOrEqual(1);
    expect(sequence.world[3].facts.furnishings.status).toBe("open");
    expect(sequence.world[3].facts.hiddenGeometry.value).toBeNull();
    expect(sequence.purpose).toBe("design_example");
    expect(Object.values(sequence.extensions.bibleRegional.gateRecordRefs).every(ref => ref === null)).toBe(true);
    expect(sequence.keyframes.every((frame: any) => frame.selectedAsset === undefined)).toBe(true);
  });
});
