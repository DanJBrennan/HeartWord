/** Add source-faithful narrator passthrough around the 30 reviewed cast rows. */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Full cast master must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [{getDb},{assertEditionVoiceAuditionApproved},{runVoicing}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition-audition.js"),import("../src/pipeline/voicing/index.js")]);
const db=getDb(),proof=assertEditionVoiceAuditionApproved(db,root,projectId);
const rows=db.prepare(`SELECT o.id,o.speaker_character_id,m.composite_segment_id FROM audio_segments o
  LEFT JOIN composite_audio_source_map m ON m.original_segment_id=o.id
  WHERE o.project_id=? AND o.layer='original_reading' ORDER BY o.start_ms,o.id`).all(projectId) as
  Array<{id:string;speaker_character_id:string|null;composite_segment_id:string|null}>;
if(rows.length!==54||rows.filter(row=>row.speaker_character_id!==null).length!==30||
  rows.some(row=>row.speaker_character_id!==null&&!row.composite_segment_id))
  throw new Error("The 54 source rows and 30 reviewed speech mappings must be complete before narrator passthrough");
const backup=join(root,"review","pre-full-cast-master-20261025.sqlite"),dbPath=join(root,"db","heartword.sqlite");
if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
const result=await runVoicing(projectId);
if(!result.ok||result.generated!==0||result.reused!==30||result.passthrough!==24||result.skippedNoVoice!==0)
  throw new Error(`Full isolated cast master held: ${JSON.stringify(result)}`);
const mapped=Number((db.prepare(`SELECT COUNT(*) AS n FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id
  WHERE a.project_id=?`).get(projectId) as {n:number}).n);
if(mapped!==54)throw new Error(`Full cast master maps ${mapped} of 54 source rows`);
assertEditionVoiceAuditionApproved(db,root,projectId);
const report={kind:"isolated_meyah_mark4_full_cast_master",projectId,planHash:proof.planHash,
  sourceRows:54,mappedRows:mapped,characterRows:30,narrationRows:24,
  newlyGeneratedVoiceRequests:result.generated,reusedCharacterRows:result.reused,
  originalMeyahPassthroughRows:result.passthrough,reasoning:result.reasoning,
  sourceLanguageWordsChanged:false,liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-full-cast-master.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
