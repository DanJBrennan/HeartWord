import {describe,it,expect} from 'vitest';
import {inspectAvBudget} from '../../outputs/mark6-production/av-call.js';

describe('Mark6 retained AV receipt reconciliation',()=>{
 const now=Date.parse('2026-11-06T20:05:00Z');
 const model={model:'gemini-3.6-flash',inputTokenLimit:1048576,maxReviewOutputTokens:8192,observedAt:new Date(now).toISOString(),conservativeRequestReserveUsd:.82};
 const state=(costUsd:number)=>({maximumRequests:80,maximumUsd:8,pendingUsd:0,estimatedUsd:costUsd,calls:[{status:'returned_reconciled',model:model.model,category:'pairedSceneReviews',costUsd,usage:{promptTokenCount:11602,candidatesTokenCount:584,thoughtsTokenCount:0,totalTokenCount:12186}}]});
 it('keeps the actual half-microdollar provider receipt and historical integer-rounded estimate usable without another request',()=>{
  expect(inspectAvBudget(state(.010891),model,'pairedSceneReviews',now)).toEqual({total:.010891,reserve:.82});
  expect(inspectAvBudget(state(.010892),model,'pairedSceneReviews',now)).toEqual({total:.010892,reserve:.82});
 });
 it('still rejects other prices, missing usage, pending charges and changed journal totals',()=>{
  for(const price of [.010890,.010893])expect(()=>inspectAvBudget(state(price),model,'pairedSceneReviews',now)).toThrow('Unknown or pending');
  const missing=state(.010891);delete (missing.calls[0] as any).usage;expect(()=>inspectAvBudget(missing,model,'pairedSceneReviews',now)).toThrow('Unknown or pending');
  const pending=state(.010891);pending.calls[0]!.status='held_unknown_no_retry';expect(()=>inspectAvBudget(pending,model,'pairedSceneReviews',now)).toThrow('Unknown or pending');
  const changed=state(.010891);changed.estimatedUsd=.02;expect(()=>inspectAvBudget(changed,model,'pairedSceneReviews',now)).toThrow('reconciliation mismatch');
 });
});
