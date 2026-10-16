# Coordinated filmmaking roles

Producer authorization: September 11, 2026. This extends stages 3, 4, 6 and
7 of the existing pipeline. It implements the role collaboration described
in shot-planning.md; it does not create a second production pipeline.

## Acceptance criteria

The outcome is a faithful chapter that Dan can inspect and correct, following
PRODUCT_VISION.md and USER_WORKFLOW.md. Existing Scripture, audio, approved
canon, takes and manual edits remain authoritative. A manual planning run
and an autonomous run use the same implementation and saved decisions.

- Each specialist makes a separate, bounded model call using the same
  immutable chapter brief: exact source/reference text, ordered shots,
  measured audio intervals, scoped approved canon and producer notes.
- Creative direction establishes intent. Cinematography, choreography,
  staging, production design, costume and lighting elaborate it. Script
  supervision checks continuity across the chapter. Picture editing checks
  coverage and the developing cut. Scripture/cultural review identifies
  concerns but never claims native-speaker or translation approval.
- Later roles see earlier contributions and objections. The Production
  Director may ask for one complete revision pass; persistent blocking
  objections hold the run. Missing/malformed output is an incomplete review,
  never approval. A call budget bounds the entire run, including revisions.
- All calls, findings and decisions are retained and visible beside the
  storyboard. Producer guidance is recorded and included in subsequent runs.
- Approved planning directions feed keyframe/video prompts. A stale or held
  plan blocks new spending; previously approved takes remain available.
- Finishing review uses an actual, explicitly labelled compressed audiovisual
  copy of the assembled cut. Editor, continuity, color, sound and music roles
  see the same cut and timeline; a metadata-only review cannot pass as a
  viewing of the film. Structural timing failures block approval independently.
- The Picture Editor selects existing footage and requests explicit pauses
  before the opening or after complete source segments. Rendering retains
  the entire performance in order: original narration, duration-matched
  ElevenLabs cast-master speech, and any unassigned intervals between lines.
  Missing visual coverage holds the cut; it never pads a missing performance
  with a frozen face or stretches speech.
- Color adjustments and sound/music cues use bounded typed parameters and
  registered reviewed assets. Finishing creates a new render and edit-history
  record. A revised mix starts from the original clean cut, with the previous
  decisions supplied to the crew as a complete replacement recipe; it cannot
  accidentally layer a second score over the first.

## Role ownership and authority

### Executable registry

`src/pipeline/creative-direction/role-registry.ts` is the single authority for
role identity, historical aliases, authority boundary, phase participation,
contract, and tool availability. The producer view derives from it. The crew
runner dispatches only roles marked `implemented`; declared and presentation
roles fail closed. Ada, Theo, and Cora run as separate evidence
challengers on both planning passes and the first editing/finishing pass. Their findings can
hold a run but never approve it or override source, canon, producer, or human
review authority. `production_director` is an internal decision handler, not
an additional producer-facing crew member or Mabel impersonation.

The existing casting pass supplies the initial shots; specialists refine
their direction without rewriting source words or existing shot IDs. Each
role owns its own contribution. A Director cannot make a specialist's
blocking objection disappear merely by declaring approval. A second pass
must clear it, or the producer gets a hold with its evidence and requested
change. This resolves the shot-planning design's open interaction questions:
roles run inside stages, the UI shows summaries with expandable transcripts,
and the producer remains final authority through recorded guidance.

The Critic/QC coordinator remains separate: planning approval is not image
acceptance. Historical Critic fixes are preserved. Generation still passes
through existing attempts, cost and review records.

The [structured-exchange contract](production-crew-communication.md#structured-film-information-beside-prose-2026-10-14)
recommends accepted FDL snapshots plus role-owned contributions beside prose,
with linked proposal/objection/revision/resolution, stale-input handling and
worked camera/blocking and rejected-wardrobe exchanges. The
[bounded runtime integration](production-crew-communication.md#runtime-integration-2026-10-14)
now saves qualitative FDL snapshots, explicit lifecycle history and current
revision-bound generation in the existing run/event/edit records. Producer edits
append immutable successor runs, retaining prior decisions and unaffected
specialist facts. Existing stage ownership, producer authority and automatic
progress under passing gates remain controlling; old films were not migrated.

Gap ideas now require an exact chapter shot as their editorial anchor and
exact approved cast names. New ideas become stable shot records, receive
crew direction, pass keyframe Critic review, and receive a video viewing
review before entering the clip library. An unresolved conflict at the old
ten-revision negotiation cap is rejected, not automatically approved.
Reorder/extension requests become saved editor guidance. Existing dialogue
cannot be extended past its performance. Ambiguous historical proposals
must be reviewed again rather than resolved by matching a verse label.

## Composer and Sound Designer

Dan clarified the audio design on September 11: the FCBH performance is the
foundation, with ElevenLabs voices for non-narrator speech and purposeful
space for establishing views, reactions and emotional development.

The Composer requests instrumental cues through Google's Gemini Interactions
API, using `GEMINI_MUSIC_MODEL` (default `lyria-3.5`). Its request includes
instrumentation, mood, tempo/texture, development, timed crescendos, release
and intended placement. Native instruments may inspire the non-diegetic
score; that does not establish historical or cultural authenticity.

The Sound Designer uses ElevenLabs' `eleven_text_to_sound_v2` adapter for
specific effects and ambience. Describe the audible event, material,
perspective/distance, duration and whether it loops. For Mark 2 this means
separate cues for distant chickens/birds, footsteps, cloth, roof debris and
restrained crowd ambience. Avoid invented intelligible speech. Long
atmospheres and individual action accents remain separate assets so their
levels and placements can be corrected independently. Suno is not integrated;
the shared soundtrack-provider interface allows a later adapter.

Every request is reserved before submission. A lost connection, failed
generation or failed listening review retains the attempt and never triggers
an implicit paid retry. An independent listening review checks fit, audible
artifacts and unwanted speech before registering the asset. Actual provider
usage/request IDs are retained. Dollar costs remain NULL when unreported.
Replaying a completed request reuses its reviewed assets, including after
those assets enter the shared brief.

Individual cues are limited to -18 dB during source performance (-6 dB only
in mapped pauses). Combined cue levels are bounded and the bed is ducked
against speech. These conservative limits do not substitute for listening.

Manual controls share the stage implementations. Stage 7 can run one bounded
finishing cycle: review, generate up to eight requested assets, review again,
mix once, and view/listen to the result. It uses at most three reviews of 17
role calls each, plus eight generation/listening-review pairs. Remaining
changes hold for another deliberate run. Planning uses at most two complete
15-call passes, including Sam/Composer's advance treatment review and all three
critics on revisions; editing/finishing keep their existing bounded rosters.
October 15 limits are 30 planning calls, 16 editing calls and 17 finishing /
cut-review calls; finishing's former 14/16 limits could not fund its 10-call
initial plus seven-call complete revision. The outer cycle now permits at
most 51 role calls, with the existing cost and outstanding-charge gates.
See the
[advance treatment](shot-planning.md#advance-emotional-treatment-implemented-2026-10-14).

Crew calls now reserve an explicitly configured, evidenced conservative
`HEARTWORD_CREW_CALL_UPPER_BOUND_USD` before submission, using the existing
film cost reconciliation/history (the retained API is named `avatar-budget`).
No price default is invented. The $200 cumulative direct film ceiling includes
planning, reviews, generation, rejected work and retries, plus outstanding
Avatar/crew reservations and evidenced bounds for other unreported liabilities.
New unreported crew/media/soundtrack costs invalidate old reconciliation.
Reported token-derived estimates enter the ledger/events; absent usage stays
NULL, with its reservation outstanding, as does a lost/failed response. These
are conservative bounds/estimates rather than invoice reconciliation or a new
spending authority. No silent paid retry follows a failed review. Synthetic
injected calls in tests do not submit or reserve provider work.

Provider references: [Google music generation](https://ai.google.dev/gemini-api/docs/music-generation)
and [ElevenLabs sound effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

## Existing edits and timing import

The current hand-edited Mark 2 film includes supplementary clips outside
the shot database. It is viewable and can receive a specialist review now,
but automatic finishing is held until its timing is documented. The crew
does not infer complete source coverage from matching total durations.

The timing import accepts JSON containing `renderId`, `renderSha256`,
`timeline: [{shotId,startMs,endMs}]` and
`audioMap: [{segmentId,sourceStartMs,sourceEndMs,startMs,endMs}]`. Times are
milliseconds. Each picture interval is associated with its known chapter
shot; supplementary angles can share that shot ID. The audio map must retain
every source interval in order and at its original duration. Obtain the
identifiers/source intervals from the recorded brief and the placements from
the actual editor timeline. The hash binds this timing to the unchanged file.

Importing timing is additive and recorded in edit history. It enables
reviewed sound/color finishing of that film; it does not authorize replacing
the manual picture edit. Picture changes to an imported hand edit stay in
its existing editor until all supplementary footage is represented. The new
automatic Picture Editor renderer works with database-backed footage.

## Verification and limits

October 15: [bounded craft feedback](automated-quality-control.md#bounded-production-craft-feedback-october-15-implementation)
extends these same saved crew runs. Nell owns the evidenced craft assessment,
after other production specialists and before independent challengers/Director.
Separate acceptance checks, ordinal scores and confidence remain visible.
Stable findings route revisions to owners; initial review plus at most one
complete revision stays within existing call/cost limits. At a plateau Dan's
agreed policy retains the best acceptable version with a visible shortfall;
failed or unverified hard checks hold. Vera remains declared, and presentation
critics have no authority. Existing FDL snapshots, accepted media, source
performance and producer successors remain authoritative. Numeric cutoff
calibration is explicitly insufficient; no new numeric gate is introduced.

An incomplete existing film can now receive an `observed_cut_timing` audit
through the same timing endpoint or `scripts/import-cut-timing.ts`. Its typed
`audit_cut_timing` edit-history record retains measured picture intervals,
waveform observations, uncertainty and missing source intervals. It appears
beside the cut and in the crew brief, but never fills an approved manifest.
The film/source hashes must still match before the crew uses it. An observed
audit holds finishing even if all specialists approve or a mathematically
complete timing table is supplied. Corrected media needs a new verified map.
This allows the crew to examine real production problems without pretending
the input film is already complete. See the September 11 Mark 2 timing audit.

Deterministic tests inject model replies and temporary SQLite/assets. They
cover response validation, cross-shot context, bounded disagreements,
staleness, canon/source isolation, provider contracts, request replay, timing
imports and execution of the complete finishing cycle. A real FFmpeg test
measures silence, preserved narration, a distinct dubbed voice and unchanged
duration; it also verifies that a second mix does not stack the soundtrack.
Full tests and frontend build run before handoff.
Paid production calls are not needed to test orchestration; filmmaking
quality still needs evaluation on the actual chapter and human field review.

The browser was checked against an isolated fixture database. A read-only
production snapshot checks real Mark 2 compatibility: 28 shots, 23 approved
canon identities and 27 protected source intervals (24 aligned segments plus
three unassigned intervals). It also exposed and fixed the existing source
parser's omission of the lowercase opening of English verse 26.

This is role integration, not a replacement NLE or a rewrite of every legacy
production script. The generic voice/lip-sync stage entry point still has its
pre-existing implementation gap; existing dedicated generation/assembly
tools remain available. The separate Critic benchmark and full per-finding
evidential weighting remain future evaluation work, as previously deferred.
