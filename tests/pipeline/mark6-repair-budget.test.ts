import {it,expect} from 'vitest';
import {repairPermit} from '../../outputs/mark6-production/bounded-context-repair/repair-budget.js';
it('stops before exceeding the approved repair calls/tokens or replaying uncertain usage',()=>{
 const s={maximumCalls:6,maximumInputTokens:200000,pendingInputTokens:0,knownInputTokens:150000,calls:[{status:'returned_usage_known'}]};expect(()=>repairPermit(s,50000)).not.toThrow();expect(()=>repairPermit(s,50001)).toThrow('ceiling');expect(()=>repairPermit({...s,pendingInputTokens:1},1)).toThrow('pending');expect(()=>repairPermit({...s,calls:[{status:'held_unknown_no_retry'}]},1)).toThrow('unknown');expect(()=>repairPermit({...s,calls:Array.from({length:6},()=>({status:'returned_usage_known'}))},1)).toThrow('ceiling');
});
