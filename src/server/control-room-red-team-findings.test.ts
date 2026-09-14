import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTROL_ROOM_RED_TEAM_FINDINGS,
  redTeamFindingsFor,
  redTeamImprovementFallback,
  redTeamImprovementResearchBrief,
  redTeamQuestionFor,
  redTeamReviewResponse,
  redTeamResponseModeFor,
  redTeamReviewerForAgent,
  seedControlRoomRedTeamFindings
} from "./control-room-red-team-findings.js";
import { researchRedTeamImprovements } from "./routes/control-room.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type SqliteDatabase = import("node:sqlite").DatabaseSync;

function reviewDb(): SqliteDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE control_room_red_team_findings (
    id TEXT PRIMARY KEY, reviewer TEXT NOT NULL, review_area TEXT NOT NULL,
    finding TEXT NOT NULL, evidence TEXT NOT NULL, severity TEXT NOT NULL,
    recommendation TEXT NOT NULL, source_references_json TEXT NOT NULL,
    audit_scope TEXT NOT NULL, presentation_only INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  return db;
}

describe("Control Room Red Team project audit", () => {
  it("seeds reviewer findings with evidence, references, severity, and recommendations", () => {
    const db = reviewDb();
    expect(seedControlRoomRedTeamFindings(db, 1_726_273_600_000)).toBe(CONTROL_ROOM_RED_TEAM_FINDINGS.length);
    expect(seedControlRoomRedTeamFindings(db, 1_726_273_600_001)).toBe(0);

    const ada = redTeamFindingsFor(db, "Ada");
    expect(ada).toHaveLength(3);
    const first = ada[0];
    if (!first) throw new Error("Ada findings were not seeded");
    expect(first).toMatchObject({ reviewer:"Ada", severity:"high" });
    expect(ada.some(finding => finding.evidence.includes("CURRENT_GOAL"))).toBe(true);
    expect(ada.some(finding => finding.sourceReferences.includes("docs/plans/CURRENT_GOAL.md"))).toBe(true);
    expect(ada.some(finding => finding.recommendation.includes("reviewer"))).toBe(true);
  });

  it("recognizes the two producer question flows and returns structured evidence-based responses", () => {
    const db = reviewDb();
    seedControlRoomRedTeamFindings(db);

    expect(redTeamReviewerForAgent("Ada Rowe")).toBe("Ada");
    expect(redTeamQuestionFor("What did we do wrong in this project?")).toBe("what_went_wrong");
    expect(redTeamQuestionFor("How can we make this project better?")).toBe("how_to_improve");
    expect(redTeamQuestionFor("What needs to be improved?")).toBe("how_to_improve");

    const problems = redTeamReviewResponse(db, "Theo", "what_went_wrong");
    expect(problems).toContain("Evidence-backed audit findings");
    expect(problems).toContain("146 unresolved QC notes");
    expect(problems).toContain("Evidence:");
    expect(problems).toContain("References:");

    const improvements = redTeamReviewResponse(db, "Cora", "how_to_improve");
    expect(improvements).toContain("Evidence-backed improvement priorities");
    expect(improvements).toContain("Improve:");
    expect(improvements).toContain("presentation-only project-audit context");
  });

  it("keeps the presentation reply path visibly evidence-backed and calibrated for short Red Team labels", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("X-Control-Room-Red-Team-Answer");
    expect(page).toContain("X-Control-Room-Research-Sources");
    expect(page).toContain("showRedTeamAnswer");
    expect(page).toContain("External sources:");
    expect(page).toContain("presentationPlaybackAgentAliases");
    expect(page).toContain("Ada:'Ada Rowe'");
  });

  it("routes each Red Team improvement query through bounded, role-specific web research", async () => {
    const db = reviewDb();
    seedControlRoomRedTeamFindings(db);
    const requests: Array<{ reviewer: string; instructions: string }> = [];
    const request: typeof fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body)) as { instructions: string };
      requests.push({ reviewer: /reviewer for (Ada|Theo|Cora)/.exec(payload.instructions)?.[1] ?? "", instructions:payload.instructions });
      return new Response(JSON.stringify({
        output: [
          { type:"web_search_call", action:{ sources:[{ title:"Authoritative source", url:"https://example.com/guidance" }] } },
          { type:"message", content:[{ type:"output_text", text:"Project-derived observations: resolve the saved priority. External, current recommendations: use a documented verification checkpoint." }] }
        ]
      }), { status:200, headers:{ "Content-Type":"application/json" } });
    };

    for (const reviewer of ["Ada", "Theo", "Cora"] as const) {
      expect(redTeamResponseModeFor(reviewer, "How can we improve this project?")).toEqual({ reviewer, mode:"improvement_research" });
      const projectContext = redTeamImprovementResearchBrief(db, reviewer);
      const result = await researchRedTeamImprovements({ apiKey:"test", agent:reviewer, reviewer, question:"How can we improve this project?", projectContext }, request);
      expect(result.sources).toEqual([{ title:"Authoritative source", url:"https://example.com/guidance" }]);
      expect(result.answer).toContain("External, current recommendations");
      expect(projectContext).toContain("Saved project-derived observations");
    }

    expect(requests.map(request => request.reviewer)).toEqual(["Ada", "Theo", "Cora"]);
    expect(requests[0]?.instructions).toContain("source-language and translated-text alignment");
    expect(requests[1]?.instructions).toContain("Dramatic impact, narrative clarity");
    expect(requests[2]?.instructions).toContain("Production feasibility, workflow reliability");
    expect(requests.every(request => request.instructions.includes("Prioritize primary, authoritative sources"))).toBe(true);
  });

  it("keeps wrong-question and non-Red-Team routing local, with an honest saved-finding fallback", async () => {
    const db = reviewDb();
    seedControlRoomRedTeamFindings(db);
    expect(redTeamResponseModeFor("Ada", "What did we do wrong in this project?")).toEqual({ reviewer:"Ada", mode:"local_audit" });
    expect(redTeamResponseModeFor("Mabel", "How can we improve this project?")).toBeUndefined();
    expect(redTeamImprovementFallback(db, "Ada")).toContain("External research was unavailable");
    expect(redTeamImprovementFallback(db, "Ada")).toContain("120.891 seconds");
    await expect(researchRedTeamImprovements({
      apiKey:"test", agent:"Ada", reviewer:"Ada", question:"How can we improve this project?",
      projectContext:redTeamImprovementResearchBrief(db, "Ada")
    }, async () => new Response(JSON.stringify({ output:[{ type:"message", content:[{ type:"output_text", text:"Unattributed advice" }] }] }), { status:200 }))).rejects.toThrow("no attributable recommendation");
    await expect(researchRedTeamImprovements({
      apiKey:"test", agent:"Ada", reviewer:"Ada", question:"How can we improve this project?",
      projectContext:redTeamImprovementResearchBrief(db, "Ada")
    }, async () => new Response(JSON.stringify({ output:[
      { type:"web_search_call", action:{ sources:[{ title:"Source", url:"https://example.com" }] } },
      { type:"message", content:[{ type:"output_text", text:"One generic recommendation." }] }
    ] }), { status:200 }))).rejects.toThrow("did not distinguish project and external");
  });
});
