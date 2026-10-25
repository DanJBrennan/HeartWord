# Meyah Mark 4 source review — provisional timing

The isolated Meyah project is `a5a40890-8bb0-4856-aacb-1dcad97074bb`.
Its staged non-drama recording is
`output/mark4-donor-20261024/assets/source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3`
(SHA-256 `2b11f64599b52992dde641a265b8c42f3212840b4dfb382be3f62c2ca18f9d7b`).
The matching supplied Scripture document is staged under
`output/mark4-donor-20261024/assets/source/meyah/text/Mark/Mark 4.docx`.
It matches Dan's supplied document byte for byte.

[Listening page](listen.html) gives a full recording player with buttons to
seek to each estimated interval. [Provisional verse timing](provisional-verse-timing.tsv)
lists one spoken-heading interval and 39 verse-group intervals covering
0:00–13:25.685. Dan heard “Mark chapter 4” in Meyah at the start and verse 1
beginning about four seconds in. A measured pause spans 3.327–4.861 seconds;
its 4.094-second midpoint is the **provisional** title/verse boundary. The
earlier alignment was rerun on the remainder of the
recording, with the title retained as its own source interval. HeartWord
produced the other boundaries locally from
silence-based estimated timing, with Gemini disabled. No speaker was inferred,
no source review was recorded and no provider request was made. Several
intervals are long, so the table is a listening index, **not** an exact
word/verse or mouth-timing map.
The heuristic currently gives verse 1 more than a minute and verse 41 about
one second. Check those labels and their neighboring boundaries closely.

The Meyah listener should confirm the exact end of the spoken heading and
start of verse 1, then compare the entire recording against the supplied
text, correct boundaries and speaker identities, identify uninterrupted
speech that crosses provisional verse rows, and confirm whether the preceding
supplied words and recording cover the text-only references `6 (4:5)` and
`19 (4:18)`. Record uncertainty rather than adding missing words. Choose one
complete 2–15 second spoken excerpt for the initial ElevenLabs audition only
after that source and correspondence review. The audience and producer then
review pronunciation and voice identity before bulk conversion.

The approved Hatam final cut is 9:21.8 of picture; the Meyah recording is
13:25.685. The longer target may require extended retained handles and new
target-owned Codex keyframes/local LTX motion, with Kling Avatar for visible
speech. No shot timing, added coverage or final edit has been approved yet.

## Interactive waveform review

The isolated reviewer is served at
`http://127.0.0.1:4002/api/projects/a5a40890-8bb0-4856-aacb-1dcad97074bb/source-listening-review`
by `scripts/serve-isolated-mark4-meyah-review.ts`. It uses only the isolated
`output/mark4-donor-20261024` data root. The original static page above remains
a historical record of the first local timing pass.

Each heading/verse-group entry shows the target and parallel English text, the
full-recording waveform, a playable selected window, optional Gemini phrase
highlight, zoomed start/end views, millisecond time boxes and ±0.001/±0.010 s
buttons. Saves retain a named revision and an exact PCM clip. A speaker field
starts with a provisional reading of the English verse and can be edited in
the same revision. Mixed narration/quotation remains explicitly flagged.

The review distinguishes provisional boundary confidence, a Gemini
**text-match** score and English speaker-context score. Gemini short-phrase anchors are
not forced word boundaries. No verse window, speaker or casting decision is
confirmed merely by displaying a suggestion. The heading and all 39 Meyah
verse-group intervals require Dan's listening review. `v1` and `v41` are
especially uncertain. The 41 English verses include two reference-only verse
markers in the supplied Meyah text; they are not silently turned into source
audio rows.

The one recorded Gemini alignment run made **91** audio checks, with estimated
provider cost **$0.528753**. It retained 87 audio spans, matched 77, placed a
phrase anchor in all 39 Meyah verse groups, and covered 96.4% of supplied
Scripture words. It matched the spoken chapter title at 1.807–3.327 seconds.
Verses 7, 10, 14, 33, 36, 37 and 38 have some unmatched
words. These are model estimates, not Dan's listening decisions. The review
windows now propose each intervening boundary at the midpoint between the
neighboring Gemini phrase extents. Verse 1 changes from the earlier 4.094–66.352
seconds to 4.094–29.020 seconds; verse 41 changes from about one second to
788.436–805.668 seconds in the decoded reviewer PCM. The original MP3 reports
805.685 seconds; this 17 ms codec/decoder tail difference is kept visible and
does not rewrite the source file. A separate one-call Gemini reading of the
parallel English verses cost an estimated $0.016093. Its speaker labels are
review suggestions only.

Provider intent, per-call usage/results and the final model output are retained
under `output/mark4-donor-20261024/review/`. The prepared manifest, decoded
PCM and initial/context clips are under
`output/mark4-donor-20261024/assets/source-listening-review/a5a40890-8bb0-4856-aacb-1dcad97074bb/`.
No Gemini request was repeated, no review was auto-verified, and no live or
isolated source/cast database row was rewritten.

Later review correction: the prepared Mark 4:3 Meyah text begins `Ofa agot
oida,` before its first opening quotation mark. That lead-in belongs to the
narrator; Jesus' quoted speech follows it. Dan's saved v3 timing draft
(34.913–50.313 s) remains in history. A subsequent Codex-authored **draft**
corrects the verse-level speaker label to `Narrator, Jesus` and records why;
neither draft verifies the exact narrator-to-Jesus audio handoff. The four
existing Dan verifications for v1, v2, v5 and v7 remain intact. The reviewer
now displays the narrator lead-in separately when a mixed speaker label and
opening quotation are present, and offers ±0.100 s boundary buttons alongside
the 1 ms and 10 ms controls. The immutable base manifest and saved review
history were not rewritten.

## Quoted speech-turn review (producer correction)

Dan clarified that the useful voice and Avatar cutoffs are **story-speaker
turns**, often spanning multiple verses. The verse-group estimates remain a
Scripture navigation and source-fidelity archive; their internal edges are not
required character-audio cuts. The new [speech-turn waveform reviewer](http://127.0.0.1:4002/api/projects/a5a40890-8bb0-4856-aacb-1dcad97074bb/source-listening-review?scope=speech#speech-jesus-v3-v8)
shows thirteen proposed quoted turns. For example, Jesus' first quoted turn
runs through Mark 4:3–8, with one audio start after the v3 narrator lead-in
and one end after the last quoted word in v8. The text and parallel English
are shown for the whole turn, and the same precise waveform, play, edge and
millisecond controls review its two outer boundaries.

These broad proposed windows come from the retained Gemini-aligned verse
phrases and English speaker-context proposal. They do **not** locate the exact
Meyah quotation edges. Mark 4:24 lacks an opening quotation mark in the
supplied Meyah text despite the English quotation; Mark 4:39 has no explicit
Meyah quotation punctuation around the line reported in English. Those turns
need particular listening/source review. At preparation time, all thirteen
turns were unverified.
Their separate immutable `speech-manifest.json` and PCM clips are in the
isolated review asset folder. The original `manifest.json`, its four verified
verse entries and all review history remain intact. Speech-turn verification
still does not apply source attribution, choose a canon voice or release film
work; those downstream decisions require exact reviewed words and bindings.

### Dan's first speech-turn pass, 2026-10-25

The isolated reviewer now records **13/13 current speech entries verified by
Dan**. The source and speech-manifest hashes are unchanged; the four older
verse-window verifications remain independent. The windows are non-overlapping.
The Mark 4:21–23 Jesus window ends at 461.883 seconds and the Mark 4:24–25
Jesus window starts at that same millisecond. For voice conversion these are
adjacent reviewed pieces of one continuous Jesus performance, unless later
source evidence shows a real narrator interruption. Do not add an audio seam
merely because English punctuation starts a new quotation.

Two saved windows were flagged for focused reconciliation before source
attribution; 4:11 was subsequently revised:

- **4:11:** Dan's current Jesus start is 175.610 seconds. The retained Gemini
  phrase evidence maps the Meyah narrator lead-in `Beda Ofa agot gu rua oida,`
  to roughly 175.878–178.109 and the first quoted phrase to 178.848–192.848.
  These model times are not forced word boundaries. This was the first-pass
  verification; Dan's revised boundary is recorded below.
- **4:39:** Dan verified 755.519–775.486 seconds as Jesus. The supplied Meyah
  verse has no marked direct quotation and narrates Jesus' rebuke and the sea's
  calm, whereas the parallel English has `“Peace! Be still!”`. Dan was asked
  whether the recording contains distinct direct words or only narrated
  action. Dan's answer and its separate content decision are recorded below.

Dan then reopened 4:11 and verified a revised start at **178.666 seconds**
(review revision `2d335bfb-8dee-4cd6-a1e7-eb5bb2243f44`). That places the
Jesus window after the estimated narrator lead-in while retaining the older
175.610-second verification in its history. Dan also answered the 4:39
question: **the narrator describes the action**. An append-only isolated
content decision (`1bc14003-29cd-4c1a-b79b-b5696debff14`) links to Dan's
unchanged v39 listening revision and marks the passage as original narration.
The reviewer now displays it as a narrated passage with no character voice.
This decision is not a fresh listening attestation, and no source or cast row
was changed. A consistent isolated SQLite snapshot immediately before this
decision is retained at
`output/mark4-donor-20261024/review/heartword.before-v39-narration.sqlite`.

The approved final-picture map gives the next correspondence pass three
important scene-specific constraints. At **4:38**, the visible speaking shot
is Peter (`9cbc4222-b194-4db4-baa9-2ba7083e31f3`) delivering the disciples'
plea, so its reviewed Meyah speech needs Peter's approved voice if that picture
is retained. At **4:39**, the Hatam final cut has 47 frames (12,194–12,240) of
Jesus visibly speaking. Those frames cannot serve the confirmed Meyah
narrator-only passage as a new Jesus lip-sync; choose the adjacent non-speaking
Jesus/storm footage or a target-specific non-speaking coverage shot in the
reviewed correspondence. At **4:41**, the donor's four picture beats have no
required visible lip-sync, and its retained final audio map used original
passthrough audio. The initial Meyah correspondence can likewise keep that
speech in the original narrator recording over the existing picture, subject
to the normal target shot review; it need not invent a Peter or group Avatar.
These are correspondence directions, not applied target shot or cast bindings.

The 4:9 Jesus clip is a **prepared source-only audition candidate**: Dan's
142.703–152.394-second review is 9.691 seconds, and its retained 16 kHz PCM
WAV hash is `4f9c9439ad4dad9e1ed759f304839ac69cb35f67715e8a315b86a8228b794b30`.
Its review ID, exact quoted text, approved donor Jesus voice ID/version and
proposed current adapter defaults are pinned in
`output/mark4-donor-20261024/review/meyah-mark4-v9-audition-source-candidate.json`.
The historical cast settings remain unknown. No ElevenLabs request, cast
master, source attribution or approval was made. The isolated target still
has no current whole-source alignment attestation or reviewed target-shot
correspondence; both are required by the normal audition gate.
The retained Gemini pass also left partial supplied-word matches in verses 7,
10, 14, 33, 36, 37 and 38, and an unresolved 744.776–758.776-second span near
the storm handoff. Dan's speech-turn boundary pass does not establish those
words. The two DOCX reference-only markers, `6 (4:5)` and `19 (4:18)`, also
remain source-text review items. Resolve these bounded source questions before
recording a whole-chapter source attestation or applying target correspondence.

### Dan's targeted word check, 2026-10-25

Dan then reviewed the seven flagged passages and directly answered that the
spoken Meyah words match the displayed text in 4:7, 4:10, 4:14, 4:33 and
4:36–38. He also answered that neither printed reference-only marker is
spoken. [The retained answer record](targeted-word-review.json) pins the
source hash, verse-manifest hash, and seven saved clip revision IDs and hashes.
The isolated reviewer reports 12 of 40 verse-archive entries verified in
this snapshot, including saved windows for 4:5 and 4:18. Dan's marker answer
is a separate content finding. The 4:38
archive window isolates the disciples' quote, so it is not a whole-verse
timing interval. These targeted answers resolve the seven named verse
word-match questions and both reference-marker questions. The model's
744.776–758.776-second storm span still needs source-row placement against
Dan's reviewed 4:38 speech and 4:39 narration. Whole-chapter alignment and
target-shot correspondence still require their normal named review.

The isolated database's older silence-only `original_reading` rows must be
reconciled before that whole-source review: 8 of the 11 verified verse-archive
clip midpoints currently fall under a *different* provisional verse label.
For example, the row labeled Mark 4:37 runs 702.398–776.219 seconds and
contains Dan's reviewed 4:38 disciples quotation and the 4:39 narrated
passage. The prepared 40-entry verse manifest is a contiguous, source-hashed
Gemini-based navigation proposal; its internal verse edges remain approximate,
while the separately verified speech-turn cutoffs carry exact voice timing.
Rebuilding source rows must preserve both review manifests, their saved WAVs
and histories, the v39 narrator decision, and these targeted content answers.
Calling ordinary re-ingestion against the current isolated database would
replace its rows and clear project QC notes, so it is not a safe shortcut.
The [source-row candidate](source-row-reconciliation-candidate.md) now gives
the proposed seven boundary repairs over the contiguous 40-entry navigation
manifest. It remains read-only until an application preserves review history.

### Isolated source-row application, 2026-10-25

The candidate was subsequently applied **only to the isolated Meyah project**
as append-only reconciliation `f8c8883a-0c3c-4ac2-adaa-c0f78a0808d1`.
Forty uncast original-reading rows still cover the full 0–805.685-second
recording, with the seven listed boundaries revised. The alignment hash moved
from `c01572ecb92dde388500c31bab5613df600a0b8bb832deb74a8aa35fe8966217`
to `97cac1b52db6f9cd16018d4aebdae6e142f6f91a0f7ce8a7c76a4d8c329929b8`;
the source hash remained unchanged. A consistent pre-application SQLite backup
is retained at
`output/mark4-donor-20261024/review/heartword.before-source-row-reconciliation.sqlite`
(SHA-256 `6cfa6ed036c0db35945533770f160f2806914dcddf60477ab53b2e1a3705dd6a`).
SQLite `quick_check` passed. Both original listening manifests, all saved
clips/revisions, Dan's v39 narrator decision, and his targeted word answers
remain readable. The reviewer displays each applied verse source row beside
the saved listening window and is now read-only pending any new source-binding
revision. It still reports 12/40 verse-window and 13/13 speech-entry
verifications. No whole-chapter source attestation, cast/source-word binding,
provider call, target shot correspondence or film approval was created.

Dan subsequently clarified that his saved 4:38 **verse-review** clip is the
spoken quotation alone (746.679–754.957 seconds). The separate disciples'
speech-turn review is 746.695–754.976 seconds. These nearly identical
windows establish the quoted performance; the applied 4:38 source row
(723.776–755.248 seconds) remains broader because it also includes the
narrator's lead-in. His clarification did not approve the whole-chapter
source-row alignment for scene planning.

Dan subsequently answered **“Approve the map for scene planning”** with the
approximate internal verse edges and separate 4:38 quotation windows stated
in the question. The named source attestation is
`10bfa028-92db-4826-bc14-a62760dca5bc`, bound to unchanged source hash
`7947e9038f1cc0e74df68d934b0dbeba271a2ea27481165021ae207b2751b2c6`
and applied alignment hash
`97cac1b52db6f9cd16018d4aebdae6e142f6f91a0f7ce8a7c76a4d8c329929b8`.
The isolated pre-approval SQLite backup is
`output/mark4-donor-20261024/review/heartword.before-source-approval.sqlite`
(SHA-256 `1aac3b828e75e2c72ca1258a437f2c52bbde731dbf347f4f9af70f7695acc7c8`).
The receipt `output/mark4-donor-20261024/review/meyah-mark4-source-map-approval.json`
records the user statement and stage result. Stage 2 created seven target-owned
Meyah scenes matching the donor's reviewed narrative divisions. The donor
scene records were unchanged and SQLite `quick_check` passed. This is scene
planning approval; no shot correspondence, character audio, provider work or
film approval followed from it.
