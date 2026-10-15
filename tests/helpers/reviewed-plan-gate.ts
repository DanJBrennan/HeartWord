// Provider/tier unit tests start downstream of an already reviewed plan. They
// intentionally do not build Scripture/alignment/canon fixtures. The real
// saved-state gate, staleness, owner consent and API/stage integration are
// exercised without this seam in creative-direction/production-record.test.ts.
export const reviewedPlanGateFixture = {
  requireCurrentPlan:()=>({id:"reviewed-fixture-plan",brief_hash:"a".repeat(64)}),
  productionAuthorization:()=>({runId:"reviewed-fixture-plan",briefHash:"a".repeat(64),assertCurrent:()=>{}}),
  directionsFromRun:()=>"\nReviewed synthetic film direction.\n",
  validateAttemptRevision:()=>{}
};
