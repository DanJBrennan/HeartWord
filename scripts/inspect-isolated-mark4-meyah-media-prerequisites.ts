/** Read-only preflight for normal target keyframe and local LTX production. */
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Media preflight must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [{getDb},{loadCrewBrief},{getKeyframeContext},{readLanguageEditionPlan}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-context.js"),
  import("../src/pipeline/media-generation/external-keyframes.js"),import("../src/pipeline/language-edition.js")]);
const db=getDb(),brief=loadCrewBrief(db,root,projectId,"planning");
const plan=readLanguageEditionPlan(db,projectId);
if(!plan?.revision)throw new Error("The reviewed shot plan is missing");
const targetShots=db.prepare(`SELECT sh.id,sh.verse_ref FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence`).all(projectId) as Array<{id:string;verse_ref:string|null}>;
const pending=db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? AND NOT EXISTS(SELECT 1 FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate' AND ga.status='accepted')`)
  .all(projectId) as Array<{id:string}>;
const first=pending[0]?.id;
const context=first?getKeyframeContext(db,root,first):null;
const report={kind:"read_only_target_media_prerequisites",projectId,planHash:plan.hash,
  targetScenes:Number((db.prepare("SELECT COUNT(*) AS n FROM scenes WHERE project_id=?").get(projectId) as {n:number}).n),
  targetShots:targetShots.length,sourceRows:brief.audio.length,briefShots:brief.shots.length,
  briefJsonBytes:Buffer.byteLength(JSON.stringify(brief)),
  sourceTextVerses:brief.source.text.length,englishReferenceVerses:brief.source.reference.length,
  approvedProductionPlanningRuns:Number((db.prepare("SELECT COUNT(*) AS n FROM production_runs WHERE project_id=? AND phase='planning' AND status='approved'").get(projectId) as {n:number}).n),
  firstPendingKeyframeShot:first??null,firstPendingVerse:targetShots.find(shot=>shot.id===first)?.verse_ref??null,
  firstPendingCastReferences:context?.references.length??null,
  firstPendingSetReferences:context?.sceneReferences?.length??0,
  conclusion:"The normal Codex keyframe handoff requires an approved current target production crew plan before preparing a new image brief. The reviewed edition correspondence does not itself forge that plan.",
  databaseWrites:0,providerRequests:0};
console.log(JSON.stringify(report,null,2));
