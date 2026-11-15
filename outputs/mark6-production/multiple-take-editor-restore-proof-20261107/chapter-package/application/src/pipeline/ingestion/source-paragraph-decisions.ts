import { createHash } from "node:crypto";

export interface SourceParagraphDecisions {
  /** Unnumbered full paragraph continuing the stated existing verse. */
  continuations: Record<number, number>;
  /** Prefix before a consecutive verse marker, separated by a published title. */
  prefixes: Record<number, number>;
  evidence: string;
}

/** Exact retained document evidence, not a universal guess that unnumbered
 * prose is Scripture. Changed XML gets no inherited paragraph decisions.
 * No words, timestamps, translation or human attestation are invented here. */
export function sourceParagraphDecisions(xml: string): SourceParagraphDecisions | undefined {
  const sha256 = createHash("sha256").update(xml, "utf8").digest("hex");
  if (sha256 === "c74d505805171c4e65cadc6262d90bb5e2b7f1c3182767c1313d34a37e798335") {
    return { continuations: { 3: 6 }, prefixes: {},
      evidence: "Bound English Mark 6 XML inspected 2026-11-05: paragraph 3, 'And he went about among the villages teaching.', continues verse 6 before the next section heading and verse 7. Preserve exact supplied words; this is reference extraction, not new translation, audio timing or native-language approval." };
  }
  if (sha256 !== "a70d25c4a5191c7cb01ea707c57411ab973c254346db7d273837e02ca87ee759") return;
  return { continuations: { 14: 15, 20: 24, 28: 37, 30: 38 }, prefixes: { 8: 6 },
    evidence: "Hatam Mark 6 XML inspected 2026-10-31: unnumbered paragraphs continue verses 15, 24, 37 and 38 before the next consecutive verse marker. The pre-v7 prefix continues v6 across the printed heading/reference pair. Retain exact original wording and document order. Structural extraction decision; not native-language/source-audio approval." };
}
