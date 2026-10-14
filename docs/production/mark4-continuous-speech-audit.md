# Mark 4 continuous-speech audit — 2026-10-14

Dan's existing confirmations answer the speaker-attribution question at **22
internal verse boundaries**. They do not establish exact word timing at those
boundaries, and they should not cause new requests to locate words. The current
implementation nevertheless still returns a speaker-coverage hold for live
Mark 4. The synthetic demonstration is not sufficient to declare this concern
complete for the existing production state.

This is a read-only evidence audit, not a new production run or approval. No
runtime code, production record, selected take, canon, source, soundtrack or
render was changed. No provider or generation call was made; incremental direct
production cost is **$0**. This does not establish the remaining film budget or
clear outstanding charges for a future call.

## Goal and acceptance criteria

The [product vision](../PRODUCT_VISION.md) requires an immutable reading master,
a complete continuous cast performance, exact lip-sync provenance, and explicit
editorial pauses that preserve spoken wording and speed. The
[user workflow](../USER_WORKFLOW.md) makes chapter production autonomous and
Dan's work review and correction of the result. The
[current goal](../plans/CURRENT_GOAL.md) separates speaker coverage, verse
metadata, semantic phrase timing and actual audio edits.

For this check, acceptance means reuse the existing named speaker confirmations;
show which ordinary verse questions are already answered; retain real speaker
and narrator handoffs and unresolved phrase timing; and preserve all production
state and approved assets without spending. The audit identifies remaining
compatibility work instead of inventing new language evidence or approvals.

## Production state inspected

Project `8a5659a4-b033-4d5f-80e2-904b217cf8a0` is Hatam / Mark / 4,
currently held at `media_generation`. The saved state contains:

| Record | Count | What it establishes |
| --- | ---: | --- |
| Original source intervals | 74 | Retained source windows, not a new claim of complete chapter coverage |
| Speaker confirmations | 47 | 46 Jesus intervals and 1 Peter interval, named reviewer Dan Brennan |
| Reviewed text/verse corrections | 18 | Exact listened-to text/verse assignments retained separately from speaker identity |
| Reviewed split | 1 | Narrator/Peter separation inside verse 38 |
| New typed continuous-speech records | 0 | The new whole-run cast path has not been activated on this project |
| Shots / formal exact utterance bindings | 111 / 14 | Existing picture and precise performance records |
| Further performance shots with accepted exact-window provenance | 15 | Retained accepted lip-sync attempts specify source windows; these have no formal shot binding |
| Coverage beats / historical clip rows / generation attempts | 6 / 201 / 652 | Existing production history, not counts of selected final-cut assets |

All three bound source files match their recorded SHA-256 hashes. All 47 speaker
confirmations refer to the current aggregate source hash
`27e1d5cdc88f7db0c3fce0701b343aadc45737fee4ebbfbd99fed48cee16eddf`.
The latest registered render is `deefa536-62f9-41b3-bbac-e9e8fb244206`,
`generated/chapter/Markus-4.mp4`, v73, duration 561.833 seconds. Its manifest is
a historical held-cut recipe, not the new complete source-window manifest.
Neither the stored stage nor this audit certifies field review, release, or
complete source fidelity of that cut.

## Ordinary verse questions already answered

All timestamps below are **original source seconds**, not final-film time.
The envelopes describe already-attributed rows; they are not newly confirmed
continuous intervals or exact internal verse alignment.

| Confirmed Jesus coverage | Envelope of retained attributed rows | Verse boundaries that do not need word location solely for attribution |
| --- | ---: | --- |
| 4:3–8 | 35.288–103.308 | 3/4, 4/5, 5/6, 6/7, 7/8 |
| 4:11–12 | 133.062–169.227 | 11/12; stop before the reviewed narrator lead-in at verse 13 |
| 4:13–20 | 172.991–258.679 | 13/14, 14/15, 15/16, 16/17, 17/18, **18/19**, 19/20 |
| 4:21–25, confirmed portions | 262.484–306.801 | 21/22, 22/23, 23/24, 24/25; the later verse 25 tail remains separate below |
| 4:26–29 | 314.979–358.269 | 26/27, 27/28, 28/29 |
| 4:30–32 | 361.365–396.232 | 30/31, 31/32 |

These are 21 different-verse joins plus the internal 18/19 boundary inside an
already broad segment. Every contributing row has a saved speaker confirmation;
the evidence explicitly calls the later rows continuations of Jesus's speech.
There is no reason to reconfirm that identity on either side of an ordinary
verse label.

In particular, `abf34074-226e-4ece-a27f-a62c60ce741a` covers
218.910–232.910 seconds with reviewed range 18–19;
`653472de-e42c-4fbe-9266-0cad026aea59` covers 232.910–236.110 with
a correction to verse 19. Both are confirmed Jesus. The 232.910 alignment
edge is not evidence of the exact 18/19 word boundary. Retain the uncertain
internal timing instead of asking Dan to find that boundary merely to preserve
Jesus's attribution.

The current reviewed projection also removes **missing verse-label findings**
for 12, 16, 19 and 38. It reuses corrections and the Peter attribution's verse
reference rather than relying only on the raw audio row. This is a narrower
result than clearing the whole speaker gate: the gate still holds below.

## Real handoffs already reviewed — retain them without asking again

| Passage | Saved source separation | Evidence to reuse |
| --- | --- | --- |
| 4:9 | Narrator 104.102–110.451; Jesus 111.217–114.896 | Approved replacement boundary in the saved speaker confirmation |
| 4:11 | Narrator 130.920–132.213; Jesus starts 133.062 | Approved mixed-speaker boundary confirmation |
| 4:13 | Narrator 170.080–172.202; Jesus resumes 172.991 | Attribution `941b61c9-6aef-4131-a793-68ba69f58e2d` explicitly approves quoted Hatam words after the narrated lead-in |
| 4:21 | Narrator 259.449–261.735; Jesus starts 262.484 | Reviewed correction plus mixed-speaker confirmations |
| 4:26 | Narrator 312.663–314.211; Jesus starts 314.979 | Approved mixed-speaker confirmation |
| 4:30 | Narrator 359.081–360.568; Jesus starts 361.365 | Reviewed correction plus mixed-speaker confirmations |
| 4:38 | Narrator 462.434–473.234; Peter 473.234–476.434 | Split `23e5b9a2-7fe4-48cb-98eb-1b5b2f7782ad` and Peter attribution; two source roles within one verse |
| 4:39 | Narrator 476.434–485.738; Jesus 486.583–488.521; narrator 490.108–494.774 | Attribution `3e4f10e1-a140-4679-9077-f5316ba17ed5` and producer direction `81086739-4d9e-442c-8b18-af218e93f6b9` expressly say narration resumes afterward |
| 4:40 | Narrator 495.426–498.545; Jesus 499.351–501.407 and 502.017–504.416 | Both Jesus windows already confirmed and formally bound |

A quotation run in the reference text is a detection aid, not a single source
speaker run. In particular, its 11–20 range crosses the reviewed narration at
verse 13. The gaps between listed windows are retained source-clock ranges;
this table does not classify their contents or authorize dropping them.

## Targeted areas still requiring reconciliation or review

| Passage | Existing source window(s) | Remaining question |
| --- | ---: | --- |
| **4:25 tail** | **307.458–311.754** | Dan supplied exact Hatam text and verse 25 in correction `e60d9b43-a6cd-4985-8b44-e885c0bf47af`, but this interval has no saved speaker confirmation. Reconcile its speaker and end of turn with the retained final cut. Historical v34/v37 plans treat 306.801 as the speech end, before this corrected tail. A new pause or speech-end operation at 306.801 cannot inherit approval from that old plan. |
| **4:35 quotation** | 424.373–428.473 and **429.252–432.846** | No saved speaker confirmations cover either row. Confirm the source-supported narrator/quoted-speech handoff and the quoted extent, reusing any applicable retained producer decision first. Reference punctuation and planned Jesus casting alone do not prove the source interval. |
| **4:41 group quotation** | 505.236–510.137, 510.928–511.850 and **512.500–515.754** | No saved speaker confirmations cover these rows. Resolve the narrated/quoted extent and the approved representation of the group speech. A retained whispering-disciple picture does not by itself bind the source voice to Peter or another canon character. |

The verse 35 row IDs are `d211352b-4e02-4fa2-83e8-ac9e314e1537` and
`c49a953a-6efd-40e1-82b5-fff98f6528ed`. The verse 41 IDs are
`16022ba3-7bba-44d9-bd97-7281fd1f0fb6`,
`8b61ca73-ebee-43b6-a26f-b8ef88625cbb` and
`5a459193-c14a-4002-8d7b-c6dd449ac28c`. The verse 25 tail is
`65670fad-edb5-4dc4-b1fa-4faa6d398a35`.

These are small existing windows to review or reconcile, not a request to locate
all intervening verse boundaries. If existing final-cut evidence settles them,
reuse it before asking Dan. Without such evidence, the speaker/phrase decision
remains qualified review work. No speaker, representative disciple, exact word
boundary or safe pause is invented here.

## Precise performance inside a long speech

Mark 4:21 already contains a useful independently evidenced example. Dan
listened to 271.401–271.864 and supplied **“Hi bi!”** in correction
`3fd42e0b-c526-4061-9413-1e2463cc0d39`. Attribution
`03fb013c-89ec-4b10-8efe-078b28be6339` confirms Jesus, and shot
`827cdcb5-0d38-406d-938e-c7ac77dce675` has an exact utterance binding.
This short phrase can support its own source-bound performance under the longer
Jesus attribution. The broad 21–25 range alone could not supply that phrase's
timing or justify a new emotional treatment.

The saved verse 11 pilot has explicitly approved source-pause picture cuts at
136.505 and 141.478 seconds (3443 and 8416 ms after its 133.062-second start;
note `649d1874-6d91-4b3f-9627-fe2e6bc0ac70`). The verse 21 pilot has
an approved cut at 266.164 (3680 ms after 262.484; notes
`edab54db-ba35-41d4-a219-3714c965cb27` and
`4f1dab30-ca76-460e-b820-41601746942f`). These are retained pilot
decisions, not new approval to insert silence or regenerate chapter-wide media.

All 15 additional performance shots lacking formal bindings nevertheless have
accepted lip-sync attempts with exact source windows in their saved prompts.
For example, the 14–20 explanation includes 195.500–200.000,
215.500–220.000, 235.500–240.000 and 254.200–258.679. Preserve these
assets and their provenance; reconciliation into the existing exact-binding
contract must not turn into 15 fresh word-location questions or paid retries.
Numeric generation-window provenance alone does not certify a newly proposed
semantic phrase, emotional beat or safe inserted pause.

## What the current implementation actually does on these records

The audit invoked only the pure speaker gate and coverage readers, not the
orchestrator or a production stage. The result is:

| Check | Result |
| --- | --- |
| Old raw missing quoted-verse labels | 12, 16, 19, 35, 38, 41 |
| Current reviewed missing quoted-verse labels | 35, 41 |
| Current full speaker gate | **Held:** 35, 41, 11–20, 24–25, 39 |
| Old gate on the same reviewed projection | Same affected verses as the current full gate |

The full gate has three partially unassigned quotation runs. Verse 13's
170.080–172.202 narrator interval makes it flag 11–20; verse 25's
307.458–311.754 tail makes it flag 24–25; verse 39's
490.108–494.774 narrator interval makes it flag 39. The first and third
are already explained by Dan's retained handoff decisions. They are evidence
integration gaps, not new language questions. The verse 25 tail is genuinely
unreconciled in the speaker records.

Four connected compatibility limits prevent a live acceptance claim:

1. **Existing source rows are not contiguous.** All 21 labelled different-verse
   joins between confirmed Jesus rows have 748–920 ms source-clock gaps.
   `confirmContinuousSpeech` currently requires exact contiguous member bounds,
   so the existing multi-verse groups cannot simply be submitted as new runs.
   Preserve the intervening source material; do not stretch rows, discard gaps,
   or silently classify them as silence. This representation problem should
   not become another request for Dan to locate ordinary verse edges.
2. **Legacy narration evidence is not projected into the typed narration
   decision.** `reviewedNarration` is false on the already-reviewed verse 13
   and 39 narrator intervals. Reuse the explicit saved evidence while retaining
   the actual interruptions. Do not merge across them or infer narration from
   every null speaker.
3. **Some accepted performance provenance is outside formal bindings.** The
   15 exact-window attempts need reconciliation through the existing binding
   contract without changing accepted takes. New phrase/emotion operations
   still need their own evidence.
4. **Source review still hashes attribution together with alignment.** Review
   `f3dfc9e8-1096-49f0-84b6-8e38f4941a8b` matches today's source bytes,
   but its saved alignment hash differs from the current combined
   source-window/speaker/verse/confidence hash. Later speaker confirmations and
   the reviewed verse 38 split exist. The mismatch is not proof of changed
   source audio, nor permission to erase the attestation; the audit did not
   reconstruct every intervening alignment version. Applicability must be
   reconciled without blindly asking Dan to repeat all reviewed alignment.

No dependent runtime change or migration was made in this audit. These limits
qualify the earlier synthetic Goal Guardian pass; live Mark 4 acceptance remains
incomplete. Future spending still needs the existing source, canon, cost and
applicable review gates; field review and release requirements remain intact.

## Validation and separate Goal Guardian review

The read-only script opens SQLite with `readOnly: true` and
`PRAGMA query_only=ON`, reads one transaction, and never calls confirmation,
binding, merge, render, provider, approval or stage functions. It deliberately
does not invoke the source-review helper that also binds source paths.
The evidence is retained in
[`outputs/mark4-continuous-speech-audit.json`](../../outputs/mark4-continuous-speech-audit.json),
reproducible with
`npx tsx outputs/audit-mark4-continuous-speech.ts`.

The database SHA-256 remained
`f0732977d63d640cead9830785f63cfd63f76528ca4a29f3e450043c5cd88bf1`.
The latest film SHA-256 remained
`b207b4c0109d70e85fab40ccb9253e7973c4cd38213333307153d417fda8aa6a`.
All 516 observed source/cast, accepted-attempt and render assets existed and
their file sizes and modification times were unchanged. This is preservation
evidence, not a fresh content hash or quality review of every historical take.
The full 575-test / 98-file result belongs to the preceding implementation;
this report does not present it as proof that live Mark 4 now passes.

The dedicated final Goal Guardian pass checks the product vision, current goal
and user workflow separately from the record investigation:

- **Audit scope and preservation pass.** Existing producer confirmations and
  corrections were reused, real handoffs retained, and accepted assets and
  history left intact. No generation, spending, new approval gate, unrelated
  subsystem, ticket collection or theological content was introduced.
- **Live implementation acceptance remains incomplete.** Speaker-only verse
  questions are already answered by saved evidence, but the current runtime
  does not yet consume all of it or represent the source gaps as continuous
  runs. The result does not satisfy live automatic resumption on Mark 4.
- **Dan's remaining decisions are targeted.** The verse 25 tail/end-of-turn,
  verse 35 handoff/quoted extent and verse 41 group-speech representation need
  reconciliation or qualified review if no applicable retained decision exists.
  Already settled narrator handoffs and the 22 internal verse boundaries should
  not be presented again. Future exact phrase/emotion/pause work remains
  separately reviewable.

This pass reports through this chat. Your dot/Mabel dispatch and external
ChatGPT/SMS transport are unavailable in this session; delivery to the supplied
number ending in 8114 is not claimed.
