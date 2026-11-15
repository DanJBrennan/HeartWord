export function repairPermit(state:any,reserve:number){
 if(state.maximumCalls!==6||state.maximumInputTokens!==200000||state.pendingInputTokens!==0||state.calls.some((c:any)=>c.status!=='returned_usage_known'))throw Error('Repair holds on unknown or pending usage');
 if(!Number.isSafeInteger(reserve)||reserve<1||state.calls.length>=6||state.knownInputTokens+reserve>200000)throw Error('Repair six-call /200000-input-token ceiling; no automatic extension');
}
