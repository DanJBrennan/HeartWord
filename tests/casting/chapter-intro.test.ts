import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildChapterIntroPlan, type IntroProposal } from "../../src/pipeline/casting/chapter-intro.js";
import { parseChapterTitle } from "../../src/pipeline/ingestion/parse-source-text.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function sourceDocx(title: string): string {
  const dir = mkdtempSync(join(tmpdir(), "heartword-intro-test-")); dirs.push(dir);
  const name = Buffer.from("word/document.xml");
  const bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${title}</w:t></w:r></w:p><w:p><w:r><w:t>1First verse.</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  const path = join(dir, "source.docx");
  writeFileSync(path, Buffer.concat([local, name, bytes, central, name, end]));
  return path;
}

const grounding = "Jesus entered the synagogue. One shared location: the synagogue near the town edge.";
const proposal: IntroProposal = {
  reasoning: "Orient the viewer at the named synagogue before the Scripture recording starts.",
  shots: [
    { role: "establishing", description: "Wide town and synagogue exterior.", reason: "Locate the scene.", evidence: "synagogue near the town edge", durationSec: 6 },
    { role: "bridge", description: "Move toward that exterior.", reason: "Connect the two views.", evidence: "synagogue near the town edge", durationSec: 5 },
    { role: "arrival", description: "Settle at the synagogue exterior.", reason: "Prepare the story entrance.", evidence: "Jesus entered the synagogue", durationSec: 4 },
  ],
};

describe("chapter opening strategy", () => {
  it("uses only the published source-language chapter title", () => {
    expect(parseChapterTitle(sourceDocx("MARKUS 3"), 3)).toBe("MARKUS 3");
    expect(parseChapterTitle(sourceDocx("MARKUS 2"), 3)).toBeNull();
    expect(parseChapterTitle(sourceDocx("A heading without chapter identity"), 3)).toBeNull();
    expect(() => buildChapterIntroPlan({ title: null, language: "hatam", grounding })).toThrow(/verified source-language chapter title/);
  });

  it("plans a separate variable-length sequence with ambience and protected source-clock entry", () => {
    const plan = buildChapterIntroPlan({ title: "MARKUS 3", language: "hatam", grounding, proposal });
    expect(plan.titleCard).toMatchObject({ title: "MARKUS 3", language: "HATAM", durationMs: 2500, audio: "location_ambience" });
    expect(plan.shots.map(shot => shot.durationMs)).toEqual([6000, 5000, 4000]);
    expect(plan.shots[1]).toMatchObject({ endpointRule: "match_adjacent_frames", mediaStatus: "unassigned", audio: "location_ambience" });
    expect(plan.sourceClockStartMs).toBe(17500);
    expect(plan.reusePolicy).toBe("candidate_only_target_review_required");
    expect(plan.status).toBe("proposed");
  });

  it("allows a direct cut and does not force Mark 3's three-shot length", () => {
    const direct = { ...proposal, shots: [proposal.shots[0]!, proposal.shots[2]!] };
    const plan = buildChapterIntroPlan({ title: "MARKUS 4", language: "hatam", grounding, proposal: direct });
    expect(plan.shots.map(shot => shot.role)).toEqual(["establishing", "arrival"]);
    expect(plan.sourceClockStartMs).toBe(12500);
  });

  it("holds ungrounded or geographically unsupported proposals for review", () => {
    const ungrounded = buildChapterIntroPlan({ title: "MARKUS 3", language: "hatam", grounding,
      proposal: { ...proposal, shots: [{ ...proposal.shots[0]!, evidence: "the Roman fortress" }] } });
    expect(ungrounded).toMatchObject({ status: "needs_review", shots: [], sourceClockStartMs: 2500 });
    const noDestination = buildChapterIntroPlan({ title: "MARKUS 3", language: "hatam", grounding,
      proposal: { ...proposal, shots: proposal.shots.slice(0, 2) } });
    expect(noDestination.status).toBe("needs_review");
    expect(noDestination.shots).toHaveLength(0);
  });
});
