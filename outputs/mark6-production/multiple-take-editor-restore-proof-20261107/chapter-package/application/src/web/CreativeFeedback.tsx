import type { CreativeFeedback as Feedback } from "../pipeline/creative-direction/creative-feedback";

export function CreativeFeedback({ feedback }: { feedback: Feedback }) {
  return <details className="creative-feedback"><summary>Creative feedback · {feedback.stopReason}</summary>
    <p>Nell · {feedback.rubric} · best acceptable pass {feedback.selectedRound ?? "none"}. Initial review + at most one revision; {feedback.maxCalls} calls maximum.</p>
    <p>Equal 20% craft weights. Scores are ordinal judgments, separate from acceptance checks and confidence. No calibrated numeric threshold or audience-approval prediction.</p>
    <p>Review call ceiling: {feedback.callUpperBoundUsd === null ? "unreported; paid calls require an evidenced bound" : `$${feedback.callUpperBoundUsd.toFixed(2)} per call; up to $${feedback.reviewUpperBoundUsd!.toFixed(2)} per run`}. Existing cumulative $200 film limit and outstanding charges still apply. Reviewers cannot dispatch paid repairs.</p>
    {feedback.passes.map(pass => <section key={pass.round}><h4>Pass {pass.round}{feedback.selectedRound === pass.round ? " · selected" : ""} · acceptance checks {pass.hardChecks}</h4><p>{pass.reason} Craft score: {pass.score === null ? "unscored / incomplete observation" : `${pass.score}/100`} · {pass.assessment.recommendation}.</p>
      <table><thead><tr><th>Craft dimension</th><th>Quality / 4</th><th>Evidence</th><th>Confidence / limits</th></tr></thead><tbody>{pass.assessment.dimensions.map(d => <tr key={d.name}><td>{d.name.replaceAll("_"," ")}</td><td>{d.score ?? "unobserved"}</td><td>{d.shotIds.join(", ")}{d.startMs !== null ? ` ${d.startMs}–${d.endMs} ms` : ""} · {d.evidence}</td><td>{d.confidence}/100, uncalibrated · {d.limitations}</td></tr>)}</tbody></table>
      {pass.concerns.map(c => <p key={c.id}><strong>{c.owner.replaceAll("_"," ")}{c.shotId ? ` · ${c.shotId}` : ""}:</strong> {c.evidence} Requested change: {c.requestedChange}<br /><small>Finding {c.id}</small></p>)}
      {pass.responses.map(r => <p key={`${r.owner}:${r.findingId}`}><strong>{r.owner.replaceAll("_"," ")} response:</strong> {r.change} Evidence: {r.evidence}<br /><small>Responds to {r.findingId}</small></p>)}
    </section>)}
  </details>;
}
