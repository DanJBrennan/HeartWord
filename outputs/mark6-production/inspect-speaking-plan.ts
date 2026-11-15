import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const id=JSON.parse(readFileSync('outputs/mark6-production/workspace.json','utf8')).projectId,db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
console.log(JSON.stringify(db.prepare('SELECT s.id,sc.sequence scene,s.sequence,s.verse_ref,s.dialogue_character_id,c.name,s.action FROM shots s JOIN scenes sc ON sc.id=s.scene_id JOIN characters c ON c.id=s.dialogue_character_id WHERE sc.project_id=? AND s.needs_lip_sync=1 ORDER BY sc.sequence,s.sequence').all(id)));db.close();
