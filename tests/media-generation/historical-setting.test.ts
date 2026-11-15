import {describe,it,expect} from 'vitest';
import {DOORWAY_RULE,historicalSettingDecisions} from '../../src/pipeline/historical-setting.js';
import {targetedRepairPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
describe('scoped historical decisions',()=>{
 it('carries global door construction and scopes Nazareth to the hometown scene',()=>{
  expect(DOORWAY_RULE).toContain('wooden pivot pegs');
  const one=historicalSettingDecisions({book:'mark',chapter:6},[1]);
  expect(one.find(d=>d.id==='mark6-hometown-synagogue')?.rule).toContain('rough limestone');
  expect(historicalSettingDecisions({book:'mark',chapter:6},[3]).map(d=>d.id)).toEqual(['doorway-pivot-planks']);
  expect(historicalSettingDecisions({book:'mark',chapter:2},[1]).map(d=>d.id)).toEqual(['doorway-pivot-planks']);
 });
 it('keeps current scoped facts without copying historical crew exchanges',()=>{
  const input={revision:{runId:'run',briefHash:'hash'},role:'staging_designer',task:'Correct doorway only',project:{id:'p',language:'hatam',book:'mark',chapter:6},source:{text:[{verse:1,text:'Exact source'}],reference:[],hashes:['source']},constraints:['Keep full audio'],sceneRules:[{sceneSequence:1,rules:['Same actor blocking']}],shotExceptions:[{shotId:'s',change:'Plain plank door'}],issues:[{id:'i',owner:'staging',scope:'scene1',severity:'blocking',status:'open'}],changesSinceRevision:['Door correction'],evidence:[{id:'door',version:'v1',location:'docs/design/media-generation.md',facts:['Pivot pegs']}]};
  const packet=targetedRepairPacket(input);expect(packet.source.text[0]?.text).toBe('Exact source');expect(packet.historicalDecisions).toHaveLength(2);expect(packet).not.toHaveProperty('productionRecord');expect(packet).not.toHaveProperty('contributions');expect(input).not.toHaveProperty('schemaVersion');
  expect(()=>targetedRepairPacket({...input,shotExceptions:[...input.shotExceptions,...input.shotExceptions]})).toThrow('Duplicate');
  expect(()=>targetedRepairPacket({...input,productionRecord:{history:['irrelevant accumulated prose']}} as any)).toThrow('Unexpected repair field');
 });
});
