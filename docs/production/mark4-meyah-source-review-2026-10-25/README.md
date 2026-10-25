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
