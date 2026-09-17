import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareEvaluation, exportEvaluationPredictions, importEvaluationPredictions, retainEvaluationCase } from "../../src/pipeline/qc/evaluation.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

describe("reviewed evidence evaluation", () => {
  it("links immutable human evidence and blocks protected regressions", () => {
    const db=new DatabaseSync(":memory:"); try {
      db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
      db.exec("INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 2:1','Mark 2:1',1)");
      db.exec("INSERT INTO shots (id,scene_id,sequence,action,created_at) VALUES ('shot','scene',1,'Recorded action',1)");
      const id=retainEvaluationCase(db,{projectId:"p",subjectType:"shot",subjectId:"shot",artifactHash:"abcdef1234",evidence:{reviewNote:"producer adjudicated this retained shot"},label:"reject",factual:true,protected:true});
      importEvaluationPredictions(db,"v1",[{caseId:id,label:"reject",confidence:80,evidence:"baseline reviewed evidence"}]);
      importEvaluationPredictions(db,"v2",[{caseId:id,label:"accept",confidence:90,evidence:"candidate reviewed evidence"}]);
      const run=compareEvaluation(db,{baselineVersion:"v1",candidateVersion:"v2"});
      expect(run.recommendation).toBe("do_not_adopt"); expect(run.confidenceCalibration).toMatchObject({insufficient:true});
      expect(() => db.prepare("UPDATE evaluation_cases SET label='accept' WHERE id=?").run(id)).toThrow("immutable");
      expect(exportEvaluationPredictions(db,"v1").predictions).toHaveLength(1);
    } finally { db.close(); }
  });
  it("rejects malformed imports without partial writes and detects held-out leakage", () => {
    const db=new DatabaseSync(":memory:"); try {
      db.exec(readFileSync("src/db/schema.sql","utf8"));
      for (const p of ["p1","p2"]) { db.prepare("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES (?, 'hatam','mark',?,1,1)").run(p,p === "p1" ? 2 : 3); db.prepare("INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES (?, ?,1,'Mark 2:1','Mark 2:1',1)").run(`s-${p}`,p); db.prepare("INSERT INTO shots (id,scene_id,sequence,action,created_at) VALUES (?, ?,1,'action',1)").run(`shot-${p}`,`s-${p}`); }
      const a=retainEvaluationCase(db,{projectId:"p1",subjectType:"shot",subjectId:"shot-p1",artifactHash:"aaaaaa",evidence:{human:true},label:"accept"});
      const b=retainEvaluationCase(db,{projectId:"p2",subjectType:"shot",subjectId:"shot-p2",artifactHash:"bbbbbb",evidence:{human:true},label:"accept"});
      expect(() => importEvaluationPredictions(db,"bad",[{caseId:a,label:"accept",evidence:"ok"},{caseId:"missing",label:"accept",evidence:"bad"}])).toThrow("unknown");
      expect(exportEvaluationPredictions(db,"bad").predictions).toHaveLength(0);
      importEvaluationPredictions(db,"base",[{caseId:a,label:"accept",evidence:"base"}]);
      importEvaluationPredictions(db,"candidate",[{caseId:a,label:"accept",evidence:"candidate",trainingCaseIds:[b]}]);
      expect(compareEvaluation(db,{baselineVersion:"base",candidateVersion:"candidate",heldOutProjectId:"p2"}).recommendation).toBe("do_not_adopt");
    } finally { db.close(); }
  });
});
