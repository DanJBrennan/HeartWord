# Current Goal

## Chapter-opening strategy in shot planning (2026-09-24)

Dan approved the reusable Mark 3-derived intro strategy for future chapters.
The existing casting/direction stage now asks its first-scene planner for a
separate pre-source-clock opening proposal. It validates the published
heart-language chapter title, records a 2.5-second series card, and accepts
zero to three grounded location shots with individually justified 3–8-second
durations. A bridge is allowed only between establishing and arrival views;
otherwise the plan can use a direct cut. The plan records evidence, reasoning,
ambience, frame-match constraints, unassigned media status, and the calculated
source-recording entrance. Malformed or unsupported suggestions become
`needs_review` instead of being silently adopted. Reused media remains only
a target-review candidate. The plan is persisted in `chapter_intro_plans`,
available through the project API and displayed beside the storyboard;
`docs/design/shot-planning.md` now specifies the strategy.

This change implements automatic **planning**, not automatic paid media
generation or assembly. Those existing stages still need to fulfill the plan
with reviewed assets and protect the exact source clock; no existing chapter
render or producer-approved intro is changed. The generated plan is available
for producer correction before any footage is assigned.

Goal Guardian check: the change advances the autonomous chapter storyboard
without hardcoding Mark 3's locations or 24-second opening, inventing
Scripture action, or shifting source-language speech. The user workflow still
starts from verified chapter inputs and exposes planner reasoning for review.
Typecheck and the four targeted intro tests pass. The full suite is 460/461,
with only the previously known unrelated fresh-chapter stage mismatch.

## Mark 3 Hatam opening title card (2026-09-24)

Dan requested the same opening title treatment used on Mark 2. The current
producer review is now
`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r6-title-card.mp4`.
It begins with a 2.5-second card reading `MARKUS 3` and `HATAM`, rendered by
the established font-based chapter-card builder over a darkened still from
the Capernaum aerial. The card has that shot's audible ambient sound and no
narration. The approved aerial, aerial-to-synagogue bridge, and synagogue
arrival remain at their original eight-second lengths, shifted to output
2.5–26.5 seconds; source-clock Mark 3 picture and speech start together at
26.5 seconds. The prior r5 review remains retained. The r6 manifest records
the card, source hash, input cut, and new chapter entrance;
`scripts/prepend-mark3-title-card.ts` rebuilds the edit.

QC: the card matches the Mark 2 title layout and yields 10,965 video frames,
with one 456.900-second 48 kHz stereo audio stream. The full video decodes
without errors, and typecheck passes. The full suite is 456/457, with the
previously known unrelated fresh-chapter stage expectation mismatch. The only >0.5-second low-level interval
near chapter entry is the same 0.584-second pause present in r5's source-clock
audio, shifted by the card duration. The title card adds no theological or
narrative content. Goal Guardian check: this is exactly the series title-card
treatment requested by Dan and specified in `docs/design/chapter-title-card.md`;
the three approved shots and Mark 3 source recording are not altered.

## Mark 3 approved three-shot location intro and reusable b-roll (2026-09-24)

Dan approved the eight-second aerial-to-synagogue bridge as the second opening
shot and asked for it to be saved as reusable b-roll. A byte-identical copy of
the endpoint-locked review candidate is cataloged as a standalone Hatam/Papuan
`reusable_reference` at
`HeartWordData/assets/generated/media-library/capernaum-aerial-to-synagogue-zoom-broll-v1.mp4`.
Its library provenance records Dan's approval, the generated source take, and
the exact aerial/synagogue endpoint frames and hashes; it is not tied to a
future chapter or automatically selected for any other timeline.

The current Mark 3 producer review is
`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r5-three-shot-intro.mp4`.
Its three independently traceable opening shots are the original Mark 2
Capernaum aerial at output 0–8 seconds, the approved zoom bridge at 8–16,
and the sound-bearing synagogue arrival at 16–24. Each supplies its own
ambient sound. The approved chapter picture and source soundtrack start
together at output 0:24, with no source-clock content removed or retimed.
The JSON manifest records each trim, path, hash, and output position;
`scripts/prepend-mark3-location-intro.ts` rebuilds the cut. Earlier review
versions remain retained.

QC: 10,905 video frames (576 intro plus 10,329 prior chapter frames) and
454.379 seconds of single-stream 48 kHz stereo audio. Sound measurements
cover all three intro shots, the 0:24 entrance, after the former audio dropout,
and near the ending; no intro silence longer than 0.5 seconds was detected at
-42 dB. Both intro seams and the chapter entrance were checked visually, and
the full file decodes. Typecheck passes; the full-suite result remains the
previously recorded 456/457 fresh-chapter stage expectation mismatch.

Goal Guardian check: this executes only Dan's approved opening edit and
reusable-b-roll request. It preserves the Scripture recording, cast and
chapter sync, adds no dialogue, and keeps all three opening shots separately
traceable and editable. Reuse beyond this chapter still requires the normal
target-shot review.

## Mark 3 aerial-to-synagogue bridge generation and review (2026-09-24)

Dan requested an eight-second zoom/descending camera move that uses the final
displayed frame of the Mark 2 Capernaum aerial as its first frame and the
first frame of the current sound-bearing synagogue exterior shot as its last.
The exact source frames are retained under `assets/generated/keyframes/`.
Veo 3.1 Lite produced two eight-second candidates with native nonverbal
ambience. V1 reached the exterior but invented a large intervening stone arch
and an abrupt blurred rush; retain it as rejected review history. V2 keeps the
synagogue visible and growing through a steadier approach. A review derivative
pins the first and last displayed frames to the source stills with only very
short terminal blends, retaining V2's central motion and audio:
`HeartWordData/assets/generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-v2-endpoint-locked.mp4`.
Its JSON manifest records the dependency on the V2 generation and both frames.

QC: 192 frames at 1280x720/24 fps, 48 kHz stereo audio, no detected silence
longer than 0.5 seconds at -42 dB, and clean full decode. After encoding, the
first and last displayed frames compare at SSIM 0.983 and 0.977 with their
respective source stills. The generated motion is a visual approximation of
the route. At this candidate stage, the existing 16-second intro and full
chapter cut were not changed; Dan later approved the bridge as recorded above.
Typecheck passed and the full suite remained at the previously known
456/457 fresh-chapter stage mismatch.

Goal Guardian check: this is an independently reviewable location transition
between producer-specified frames, not a new Scripture event or an automatic
timeline decision. It preserves the approved source recording and canon while
deferring selection to Dan.

## Mark 3 synagogue intro with native courtyard ambience (2026-09-24)

Dan identified that the selected synagogue opening take was silent. The r4
synagogue draft remains retained, but a new ten-second r5 draft was generated
from the approved exterior and Jesus references with explicit natural
courtyard sound: soft footfalls, cloth movement, lake breeze, birds, and
indistinct bustle, with no words or music. The provider returned a continuous
48 kHz stereo audio stream; its low level (about -48 dB mean) was raised 20 dB
in a separately retained, video-identical audible take. Both are cataloged
with their provenance and remain available for review.

The current producer review is
`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r4-location-intro-ambient.mp4`.
It uses 0–8 seconds of the original Mark 2 aerial with that shot's ambience,
then 0–8 seconds of the new synagogue take with its own courtyard ambience.
Jesus finishes entering before the second shot ends. The approved Mark 3
picture and source soundtrack start together at output 0:16. Its JSON manifest
records both source paths and trims; `scripts/prepend-mark3-location-intro.ts`
rebuilds the review without modifying the earlier r2 or r3 cuts.

QC: 10,713 frames and 446.379 seconds of 48 kHz stereo audio. Measured audio
remains non-silent across the entire second shot, with mean levels about
-29 to -28 dB in successive two-second intervals; decoded audio is present
at chapter entry, after the former 1:33 dropout, and near the ending.
The full render null-decodes without stream errors. Typecheck passes; the
full-suite result remains the known 456/457 fresh-chapter stage mismatch.

Goal Guardian check: this corrects the producer's specified opening with
location-native sound, rather than reused aerial audio, while retaining the
source-language recording, canon references, chapter sync, and independent
review/edit provenance. It adds no speech or narrative content.

## Mark 3 initial two-shot location intro review, superseded (2026-09-24)

At Dan's direction, the full-chapter producer review now has two eight-second
location shots before source-clock time zero: the original Mark 2 bird's-eye
Capernaum master (`shot-000-ancient-fishing.mp4`, 0–8 seconds), followed by
the current reusable synagogue arrival draft r4 (2–10 seconds, allowing Jesus
to finish entering and the doorway to clear). The new retained review is
`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r3-location-intro.mp4`.
Its JSON manifest records both independently trimmable source takes and the
unchanged r2 chapter dependency; `scripts/prepend-mark3-location-intro.ts`
rebuilds the cut. The bird's-eye source ambience is crossfaded through the
16-second opening and raised to an audible bed. The approved Mark 3 soundtrack
begins at output 0:16, remaining aligned with the original chapter picture.

QC: 10,713 video frames (384 intro plus 10,329 source-clock frames), 48 kHz
stereo AAC through 446.379 seconds, audible ambience in both intro shots, and
decoded audio at the chapter entrance, after the old 1:33 seam, and near the
ending. The original r2 review remains retained. Typecheck passes; full suite
is 456/457 with the previously recorded unrelated fresh-chapter stage
expectation mismatch.

Goal Guardian check: this adds only Dan's two requested establishing shots to
the review workflow, with no new speech, changed Scripture, recasting, or
source-clock retiming. The intro and original chapter remain traceable and
separately editable rather than replacing upstream scene decisions.

## Mark 3 full-chapter review audio playback repair (2026-09-24)

Dan found that the chapter review became silent in his player from about
1:33 onward. The six-section stream-copy join combined stereo Scene 1 opening,
mono Scene 1 remainder, and stereo Scenes 2–5 as one AAC stream. The mono-to-
stereo switch at source time 92.799 seconds matches the reported loss point.
FFmpeg's ability to decode later packets had hidden this player-level failure.

`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r2.mp4`
is the new producer review cut. It decodes each existing section's approved
soundtrack, pads or trims it to the recorded source interval, joins those
intervals, and encodes one 48 kHz stereo AAC track. The video stream is copied
unchanged from r1; r1 remains retained as diagnosis/history. A corresponding
JSON manifest records the repair. The chapter assembly script now invokes the
normalization step after its source-section join so repeat runs deliver r2.

QC: r2 has 10,329 video frames with a bit-identical video stream to r1 and
430.352 seconds of stereo AAC. Five-second decoded checks on both sides of
1:33 and near the ending contain audio; the repaired file loads and seeks past
the join in Chrome without a media error. A full r2 null decode reports no DTS
warning, though final export work remains separate from this audio repair.

Goal Guardian check: this restores audible, continuous approved Hatam audio in
the producer's existing full-chapter review workflow without changing the
Scripture, speaker bindings, picture edit, or selected media.

Typecheck passes. The full suite is 456/457 passing; the lone failure is the
previously recorded fresh-chapter stage expectation mismatch
(`media_generation` versus `voice_lipsync`).

## Capernaum synagogue reusable arrival-motion draft (2026-09-24)

At Dan's direction, a ten-second silent 16:9 Omni draft now animates the
approved Capernaum synagogue exterior r4 as a standalone reusable location
reference. Independently timed Papuan/Hatam townspeople pass by and conduct
ordinary business while Jesus, locked to the approved v5 walking reference,
enters frame and walks into the open synagogue. After Dan flagged a giant
scale and a late threshold crossing in earlier retained takes, the active r4
candidate explicitly holds Jesus to normal adult scale against the doorway
and keeps the open doorway empty for the final third after he has entered.
The generator audio was discarded. The retained MP4 is cataloged as
`reusable_reference`, with its set/canon sources and full generation prompt
in the library provenance, and is held for review rather than selected on any
timeline.

Goal Guardian check: this creates bounded, non-speaking location coverage
within the current reusable-reference catalog goal. It preserves the approved
synagogue reconstruction and Jesus canon, makes no claim about a specific
Scripture passage, does not introduce dialogue or a timeline edit, and leaves
all future reuse subject to the normal source/canon/editorial review.

## Reusable location-reference catalog (2026-09-24)

The existing retained-take media library now also catalogs standalone Hatam/
Papuan location stills and videos without inventing chapter or shot origins.
It records an immutable asset path/hash, provenance, title, location and tags;
the producer can browse or register these in the same library and extract
timecoded frames from video. Reuse remains a target-shot candidate requiring
normal source, canon and editorial review, never automatic timeline placement.
The approved Capernaum synagogue exterior r4 16:9 still is the first
standalone reusable reference. No video asset has been generated or selected
for it. The pre-migration SQLite database was backed up to
`HeartWordData/db/heartword-before-broll-20260924.sqlite`.

Goal Guardian check: this gives future Hatam chapters discoverable setting
coverage while preserving the autonomous chapter workflow and every existing
shot decision. It adds no new pipeline stage, story action, or cross-canon
reuse policy.
Focused library tests (5/5), typecheck, web build, SQLite integrity and
foreign-key checks pass. The full suite remains at 456/457 passing with its
existing fresh-chapter stage expectation mismatch (`media_generation` versus
`voice_lipsync`); this library work does not touch that fixture.

## Capernaum synagogue exterior location reference (2026-09-24)

Created a photorealistic exterior candidate with Nano Banana Pro. The first
take was too small for the approved Mark 3 Scene 1 interior; the revised take
uses that interior as a set-scale reference and a restrained early-Roman
dark-basalt building rather than the much later ornate limestone synagogue.
The delivered 16:9 PNG and retained model/prompt details are documented in
`docs/production/CAPERNAUM_SYNAGOGUE_EXTERIOR.md`. This is not selected onto
the timeline; no approved scene, character, or audio binding changed.
After Dan caught modern-looking door construction in that take, a revised
Nano Banana Pro edit replaced the main doors with plain plank leaves on
concealed outer-jamb pivots. An intermediate edit with an exposed freestanding
pivot post was rejected. The r4 16:9 PNG in the production note is the
current candidate; the original exterior and failed door edit are retained.

## Mark 3 Scene 1 opening coverage and full-chapter producer review (2026-09-24)

Scene 1's measured opening picture shortfall is closed. Seven source-timed
picture beats now cover 0–41.733 s, including the recorded chapter heading,
the existing selected eight-second Shot 1 and Shot 2 takes, the approved
8.183-second Shot 3A→3B performance, and four independently editable local
coverage shots derived from approved synagogue/observer keyframes. The final
observer reaction covers Jesus's continued 37.752–40.929 s cast line with
Jesus offscreen, followed by the recorded 0.804-second pause. The existing
Shot 3 lip-sync and all later approved scene content remain unchanged. A typed
edit command records source bounds, parent shots, picture paths, and rationale.

The six source-contiguous review sections are joined into
`HeartWordData/assets/generated/video/review/mark3-full-chapter-source-review-r1.mp4`,
with a JSON source/picture manifest beside it. Its 10,329 decoded video frames
at 24 fps represent the entire five-scene chapter, 0–430.352 s of the source
clock including the natural closing silence. Encoded audio measures 430.407 s
(about 55 ms of container padding); the last 200 ms averages about -49.5 dBFS,
not a renewed speech burst. The full file decodes through the final frame.
Original Hatam narration and approved composite-cast dialogue remain the
soundtrack; no provider audio was substituted by the chapter join.

This is a **producer review cut, not a distribution export**. The fast
six-section stream-copy join reports one non-monotonic DTS warning during an
ffmpeg null-mux decode near an early seam. Two attempted whole-file
normalization approaches lost frames and were rejected, not promoted; their
failed outputs were removed. The next finishing scope is to normalize the
picture from its short, independently editable source-timed beats (where
pixel formats and timestamps can be made uniform before joining), then
recheck audio seams and chapter duration. No scene regeneration or new
source/content decision is implied.

Goal Guardian check: the autonomous chapter workflow now yields one
reviewable film with complete original-source coverage, approved Papuan
canon, exact existing speech bindings, and inspectable editable shot records.
The review status and timestamp limitation are explicit rather than
misrepresented as a final field-ready export. Typecheck passes. Full suite
with two workers: 453 passing, one existing
`fresh-chapter-full-production.test.ts` failure (expects `voice_lipsync`,
receives `media_generation`); additional default-parallelism timeouts were
reproducibly absent at the lower worker count.

## Mark 3 Scenes 3–5 source-timed production (2026-09-24)

The three remaining Mark 3 scenes now have reviewed, selected, independently
editable picture coverage and source-continuous soundtrack previews. Scene 3
(Mark 3:13–19) covers 172.258–245.262 s in 10 shots; Scene 4 (Mark 3:20–30)
covers 245.262–371.645 s in 23 shots; Scene 5 (Mark 3:31–35) covers
371.645–429.852 s in 10 spoken/narrated picture beats, followed by a
0.500-second hold over silence actually present in the source recording. The
approved final 2.207-second Jesus binding remains unchanged. Every selected
shot has a separately assembled clip, and typed edit commands record source
bounds, donors, cutaway choices, and rejected alternatives.

The deliverable review cuts are
`HeartWordData/assets/generated/video/review/mark3-scene3-full-source-review-r1.mp4`,
`mark3-scene4-full-source-review-r2.mp4`, and
`mark3-scene5-full-source-review-r2.mp4` in the same directory. A JSON
picture/cast manifest accompanies each scene's initial cut; the Scene 5
postroll has a separate typed edit command. Original Hatam narration and
approved composite cast speech stay continuous across picture cuts. Provider
audio is discarded. Long Jesus turns in Scene 4 use short source-bound
lip-synced inserts with offscreen-scribe/listener coverage for the remaining
speech. The listener crops exclude Jesus's stationary mouth. Scene 5's
14-second Jesus turn is two contiguous 7-second source-bound lip-sync clips.
No speech is dropped to fit a provider's clip-length ceiling.

Visual QC retained approved Papuan faces, wardrobe, scene geography, and
causal action. Two Scene 4 doorway motion takes were rejected because they
added food props or an unsupported threshold crossing; restrained pans of
the approved still carry that narration. Veo rejected several other requests
under content/audio filters, and Kling parallel-task limits required smaller
batches. These provider failures did not change canon or source bindings.
The source final word is active almost to 429.852 s, followed immediately by
recorded silence; Scene 5's 0.500-second natural tail holds its last frame and
uses that recorded silence, with a 20 ms smoothing fade at the cast seam.

Automated QC report:
`HeartWordData/assets/generated/video/review/mark3-scenes3-5-qc-r2.json`.
It verifies full selected source coverage, 1,752 / 3,033 / 1,409 video frames,
audio durations, one assembled clip per selected beat, no truncated renewed
onset at the scene ends, and no acoustic crossing flag at the Scene 4→5
speaker turn. The final review's last 200 ms is approximately -51.8 dBFS RMS.
Typecheck passes. The full suite has 453 passing tests and the same existing
`fresh-chapter-full-production.test.ts` failure (expects `voice_lipsync`,
receives `media_generation`).

Goal Guardian check: this completes the requested remaining scenes within the
autonomous, exact-source, editable Hatam chapter workflow. It introduces no
new Scripture action or speech, does not replace approved character identities,
keeps every provider/cutaway decision reviewable, and required no routine
listening or choice from Dan. A fresh chapter-level audit found that Scene 1's
first two selected eight-second clips and Shot 3 do not yet cover the full
4.616–41.733-second source opening, even though its later passage and all of
Scene 2 are covered. The next scope is closing those Scene 1 opening picture
gaps before joining all five scenes into a chapter-level review cut, without
regenerating Scenes 2–5 by default.

## Mark 3 Scene 2 full source-timed picture coverage (2026-09-24)

Scene 2 (Mark 3:7–12) is now covered from the first original-reading onset at
92.799 seconds to the following scene's onset at 172.258 seconds. The six
previously selected clips supplied only 33.933 seconds of picture for this
79.459-second source span. Eight independently editable, source-timed coverage
shots now fill the gaps: three following-crowd continuations for verses 7–8,
closer boat preparation for verse 9, the same staff and woven-mat carriers for
verse 10, the kneeling man's pre-cry reaction for verse 11, a 0.755-second
post-cry pause, and a 3.507-second stern-order hold through the last 1.358
seconds of verse 12 narration and its natural 2.149-second pause. The original
six selected clips and the producer-approved 1.933-second lip-sync line remain
unchanged. A typed edit command records the old shot order, all additions,
source bounds, donor attempts, and rejected alternatives.

The complete review cut is
`HeartWordData/assets/generated/video/review/mark3-scene2-full-source-review-r1.mp4`
with a source/picture manifest beside it. It has 1,907 frames at 24 fps and
79.459 seconds of encoded audio. Original Hatam narration remains continuous
across picture cuts; only the bound 162.063–163.996-second man-with-unclean-
spirit line uses the approved cast master. Provider audio is discarded except
for Dan's approved quiet breathing at seconds 2–4 of the existing four-second
bridge. Acoustic QC found no truncated renewed onset at either speaker turn
or scene end; the final natural pause measures about -52 dBFS RMS.

The first crowd-led continuation for verse 7–8 and the first verse 9
continuation showed synchronized gestures and were retained as rejected
attempts. Revised tight-follow and boat-preparation coverage, plus a closer
mat-and-staff angle, passed visual review for source action and apparent canon
continuity. Three further provider requests returned no video under content
filters and were not selected. The successful new footage and three reviewed
keyframes are retained separately from local still holds. All 14 shots now
have selected and assembled clips; the review cut is a scene deliverable, not
yet a joined chapter render. Exact image-edit prompts and source/result paths
are recorded in `docs/production/MARK3_SCENE2_COVERAGE_KEYFRAMES.md`.

Goal Guardian check: the unit advances the autonomous, editable Hatam chapter
film without new Scripture content, invented healing/speech, replacement of
approved characters, or routine listening requests to Dan. New angles cover
only measured audio-clock picture gaps; picture decisions and their reasons
remain inspectable. The next production scope is Scene 3 or joining the
completed Scene 1 and 2 segments into a longer source-continuous review cut,
not regenerating already approved Scene 2 footage.

Verification: `npm run typecheck` passes. Full suite: 453 passing tests and
the same existing `fresh-chapter-full-production.test.ts` failure (expects
`voice_lipsync`, receives `media_generation`).

## Mark 3 Scene 1 verse 6 exit and scene close (2026-09-23)

The approved Mark 3:6 doorway keyframe now has selected 720p footage. Shot 10
shows the same dark-robed Pharisees leaving the dark-basalt synagogue for
8.000 seconds (source picture 78.779–86.779 s). Shot 11 was added as a
frame-continuous 6.020-second aftermath: the figures clear the doorway while
the same seated witnesses remain, then the empty entrance holds through the
natural pause before Scene 2 (86.779–92.799 s). A typed edit command records
the added coverage and its source timing. Both shots have selected and
assembled clips; selection-script replay is idempotent.

Verified Mark 3:6 Hatam and English name the Herodians and the counsel
against Jesus. No approved Herodian visual canon is present. The picture
therefore shows only the approved departure and aftermath, while the original
source-language narration carries the complete verse; it does not fabricate
a meeting, quoted words, weapons, or violence. The narration is one uncut
source span from 78.779–90.655 s across the picture cut, followed by the
recorded 2.144-second pause to the next scene. The scene-closing review cut
from Shot 4 through Shot 11 is
`HeartWordData/assets/generated/video/review/mark3-scene1-shot4-through-exit-review-r2.mp4`.
Its source-faithful audio is 51.066 seconds; picture is 1,226 frames at
24 fps (51.083 seconds, one-frame end hold). Speaker-turn tail QC reports
no truncated renewed onset at either Jesus or narrator turn, and the final
pause measures approximately -54.1 dBFS RMS. Provider-generated audio was
discarded.

Goal Guardian check: the work advances the autonomous Hatam Mark chapter
with approved Papuan canon, full original words, logged picture choices,
and no routine listening request to Dan. It adds one independently editable
coverage shot, not a new pipeline stage or an invented narrative event.
The next production scope is Mark 3:7–8 at the Sea of Galilee.

Verification: typecheck passes; the full suite has 453 passing tests and
the same single pre-existing `fresh-chapter-full-production.test.ts`
failure (expects `voice_lipsync`, receives `media_generation`).

## Mark 3 Scene 1 verse 5 selected coverage (2026-09-23)

The next source-grounded passage is now covered through the healing hand:
Shot 6 Jesus's closed-mouth anger/grief reaction (57.990–65.990 s), Shot 7
the three-person over-the-shoulder bench lead-in (65.990–70.759 s), Shot 8
Jesus's approved 1.241-second command over the man's still-contracted left
hand (70.759–72.000 s), and Shot 9 the same hand extending and restoring
(72.000–78.779 s). Each has a selected raw clip and an assembled clip. The
command remains bound to Dan's approved original source interval and the
mapped Jesus cast master; only its picture coverage changed. Typed edit
commands retain the prior shot order and original approved OTS command plan.

The original-reading narrator stays continuous from 55.153–70.759 seconds,
including both picture cuts; it is never sliced at 57.990 or 65.990. The
37.046-second review cut from Shot 4 through the healing is
`HeartWordData/assets/generated/video/review/mark3-scene1-shot4-through-verse5-healing-review-r2.mp4`.
Audio is 37.046 seconds, picture 889 frames at 24 fps (37.042 seconds).
Speaker-turn tail QC found no truncated renewed onset at the two Jesus and
two narrator turn ends. The cut is a selected producer-delegated work-in-
progress, not a claim that the entire Mark 3 chapter is finished.

The first 720p OTS final candidate introduced a fourth bench man, so it
was retained but not selected. A constrained Kling retry held the original
three men and supplied the selected 4.769-second lead-in. Jesus's side
profile remained slightly visible in that angle; during his command the
picture therefore cuts to the contracted hand, holds until the line ends,
and proceeds into the healing from the matching hand frame. The Jesus
reaction and healing clips came back as five-second Kling takes and were
retimed at constant speed to their eight- and 6.779-second source-grounded
picture slots. The failed draft label on the OTS was not treated as a veto:
its prose verdict and inspected frames were positive, but the fourth man in
the *later* full render was a real continuity failure. Paid generation
attempts and locally derived selections remain separately inspectable.

Goal Guardian check: this advances an editable, autonomously produced
heart-language chapter without new narrative content or routine listening
requests to Dan. The approved voices and source timing remain intact;
local picture cuts and retimes are logged rather than silently changing the
alignment. Next production scope is the following Mark 3:6 counsel/exit
shot, not a new product feature or stage.

Verification: typecheck passes. Full suite: 453 pass, one unchanged
`fresh-chapter-full-production.test.ts` failure expecting `voice_lipsync`
where the current pipeline holds at `media_generation`. Selection-script
replay is idempotent and leaves the approved command binding at
70.759–72.000 seconds.

## Mark 3 Scene 1 Shot 4 → 5 producer-confirmed boundary (2026-09-23)

Dan explicitly confirmed revising the reviewed 55.733-second edge to 55.153
seconds. The two original-reading intervals now meet there (41.733–55.153
seconds Jesus, 55.153–57.990 seconds narration), with 89-point timing
confidence, two named boundary-override records, and a new Dan-attributed
alignment attestation for the changed alignment hash. The original source
file and Dan's earlier narration-text correction were not replaced. Typed
edit command `mark3-scene1-shot4-shot5-boundary-55153-v1` retains the old
source intervals, Shot 4 utterance binding, composite mapping, and accepted
coverage-beat timing before the active projections were updated.

The approved Jesus cast performance is retained unchanged; a 13.420-second
PCM derivative excludes only its quiet/burst tail and is the active mapped
cast master. Shot 4's three coverage clips were selected at 0–6.755,
6.755–10.053, and 10.053–13.420 seconds and assembled. The 720p Kling
Shot 5 reaction was selected for 2.837 seconds and assembled silently for
continuous original narration underneath. The selected two-shot transition
is `HeartWordData/assets/generated/assembled/mark3-scene1-shot4-shot5-approved-transition.mp4`:
390 frames at 24 fps (16.25 seconds), with the real joined source/cast audio
and the natural ~0.8-second pause at the speaker change. The pre- and
post-approval PCM soundtrack files have identical SHA-256 hashes.

Re-running the one-shot reconciliation script makes no duplicate override,
selection, or assembly. The voicing stage now retains a current producer-
reviewed cast master across an ordinary rerun and holds a forced/stale
regeneration before paid provider calls; three focused tests and typecheck
pass. A read-only forced-voicing probe against the live project returns that
hold with zero generated segments. Full-suite result is recorded below.
The full suite ran with 453 passing tests and the same single pre-existing
`fresh-chapter-full-production.test.ts` failure (`media_generation` versus
expected `voice_lipsync`).

Goal Guardian check: this is Dan's confirmed timing correction, not a new
speaker or Scripture decision. The total source span remains 16.257 seconds,
the prior approval is inspectable, real narration is continuous, and only
the needed downstream clip timing was changed. No new pipeline stage or
unrelated production requirement was added.

## Mark 3 Scene 1 Shot 4 → 5 transition review (2026-09-23)

The 55.733-second original-source edge falls after a measured quiet gap
(54.753–55.553 s), inside the onset of Dan-attributed narration, “But they
were silent.” A review-only splice places the picture/audio transition at
55.153 s: Jesus's cast-master audio contributes 13.420 s, then the original
reading contributes 55.153–57.990 s. Together they retain the original
16.257-second combined span. Signal review shows one natural pause across
the splice and no renewed Jesus tail or missing beginning of the narrator's
phrase. The 16.25-second 720p/24fps review cut is
`HeartWordData/assets/generated/video/review/mark3-scene1-shot4-shot5-continuous-review-r2.mp4`.

Shot 5's accepted still was animated. The normal final-video route exhausted
Veo/Kling fallback and retained a 360p Omni candidate
(`2daec694-290e-455b-b233-d3b22f9e5892`, estimated $0.33); its full length
had visual continuity faults, and only its first 2.83 seconds were plausible. A concise
720p Kling retry (`aeb84524-f27d-43a5-b8b3-ce30328477dc`, estimated $0.60)
preserves the approved three-man bench composition through the needed 2.83
seconds and is used in the review cut. Automated gaze QC flagged the retry,
but its “all three look into the lens” claim conflicts with inspection of
the approved near-frontal starting keyframe and sampled retry frames; that
warning is retained as advisory, not silently erased.

At this review checkpoint, no Shot 4/5 clip had been promoted and no approved
source binding had been revised. Dan subsequently confirmed the version-safe
revision and selection recorded above; no routine listening was required.

Goal Guardian check: the review preserves the source words and total elapsed
audio, uses the approved visual staging, records paid attempts and QC, and
does not invent a new line or silently change a producer-reviewed binding.

Verification: the transition preview has 390 frames at 24 fps and a single
natural ~0.8-second quiet interval across the audio join at the -30 dB
threshold. The full suite remains at 450 passing / 1 pre-existing failure:
`fresh-chapter-full-production.test.ts` expects `voice_lipsync` but the
pipeline currently holds at `media_generation`.

## Autonomous audio-boundary correction and turn-end QC (2026-09-23)

Dan clarified that the goal is a finished chapter without his routine audio
listening. The preceding source-boundary hold was too broad: source activity
across a cut often means only that the same speaker continues. General
ingestion now treats such crossings as recorded advisories, not acoustic
holds or confidence penalties. When a fresh, unreviewed alignment has a
substantial quiet gap just before a proposed edge, it moves that edge into
the gap while keeping adjacent source intervals contiguous and caps their
timing confidence at 89; existing named
source decisions and approved bindings remain protected.

Chapter assembly now extracts adjacent intervals of the same speaker from
the same recording as one continuous PCM span, independently of picture
cuts. Before promoting a cut, it checks the rendered end of each speaker
turn and the chapter tail for a short, strong renewed onset after silence.
The failed output is held with timing and level evidence, never made to pass
by discarding audio. Read-only replay on the 48 existing Mark 3 composite
segments flags the known Shot 4 Jesus tail and no other speaker-turn tail.
It does not rewrite that existing approved chapter; its source correction
still requires explicit reconciliation.

Goal Guardian check: this serves the autonomous source-to-chapter workflow
and continuous-audio requirement. It avoids needless Dan listening at
ordinary picture cuts, preserves every source interval, does not infer Hatam
words or speakers, and does not add a pipeline stage or change approved media.
The broader pre-existing source-review gate remains conservative; this change
does not claim that text-match scores alone can certify linguistic timing.

Verification: typecheck passes; 450 tests pass. The same pre-existing
`fresh-chapter-full-production.test.ts` assertion remains the sole full-suite
failure (`media_generation` versus expected `voice_lipsync`).

## Source-boundary integrity at alignment (2026-09-23)

The Shot 4 ending exposed a timing failure that text-match confidence could
not catch: the 55.733 s source split lands after a quiet gap, inside renewed
audio activity. General chapter ingestion now checks adjacent proposed edges
in the original recording before scene planning or media generation. A cut
with sustained activity on both sides holds the two affected source
intervals for review, records acoustic evidence and a nearby quiet-gap
listening point, and caps their numeric confidence below the 80-point
auto-decide threshold. It does not move the edge or infer words or speakers.

An offline read-only replay against the current Mark 3 source found the
55.733 s failure and seven other candidate edges among 48 intervals. These
are review prompts, not attested errors; several coincide with 14-second
technical splits. The existing Mark 3 database and approved media were not
rewritten. Its producer-reviewed source binding still requires explicit
reconciliation before the new check could be applied through re-ingestion.

Goal Guardian check: this extends ingestion QC within the existing autonomous
workflow and preserves the source audio, named correction path, and producer
review. It adds no Scripture content, speaker attribution, new pipeline
stage, or automatic edit to an approved cut.

Verification: focused boundary and fresh-chapter tests pass; typecheck passes.
The full suite is 442 passing / 1 pre-existing failure in
`fresh-chapter-full-production.test.ts` (expects `voice_lipsync` while the
pipeline holds at `media_generation`).

## Mark 3 Scene 1 Shot 3 — producer-approved covered-sequence revision (2026-09-23)

Dan approved retaining the accepted Scene 1 Shot 3 synagogue composition as a
two-second staging beat (Shot 3A), then cutting to a new close,
canonical-Jesus lip-sync insert (Shot 3B) from the Man with Withered Hand's
eye line. The existing exact Hatam utterance binding remains authoritative:
Shot 3A covers its first 2.0 seconds without visible speech, and Shot 3B is
planned to perform the remaining 6.183 seconds. The original approved
keyframe is reused only for the staging beat; the close-up requires its own
producer-reviewable, canon-locked keyframe before a lip-sync candidate can be
made.

Goal Guardian check: this is a producer-directed coverage and performance
revision within the approved Mark 3:3 action. It preserves the source-audio
binding, approved Papuan Jesus canon, scene geography, and review gate; it
does not alter Scripture. The paragraph above records the planning decision;
the subsequent media work is recorded below.

### Shot 3B production candidate held for review (2026-09-23)

The approved 3B keyframe was animated through Kling. The first completed base
task (`931849384533950479`) was recovered and retained, but its measured
5.042 seconds cannot cover the approved 6.183-second speaking beat. A second
base task (`931868133391597592`) from the same accepted keyframe runs 10.042
seconds. Its frames preserve Jesus's approved face, clothing, eye line, and
synagogue setting. Kling identified one face across the beat; its thumbnail
was visually confirmed as Jesus (face ID `0`).

The original producer-approved source interval and hash remain unchanged.
The older bound Jesus character version and the currently approved composite
version both specify the same ElevenLabs voice ID, so no re-voicing or binding
rewrite was needed. The mapped composite slice is 1.998-8.173 seconds,
corresponding to the remaining source line after 3A's two-second setup.
Kling face-targeted lip-sync task `931869319351369821` returned and was
recorded as attempt `c672f203-b174-4aad-b1a8-38f80b4018d2`,
`hold_for_review`. Its original provider output is
`generated/lipsync-face/931869319351369821.mp4`; the first 6.183 seconds are
also rendered as `generated/lipsync-face/mark3-scene1-shot3b-review-6.183s.mp4`
for producer review. The original 10-second output is retained. No clip was
added to the timeline; Dan's review of this speaking take and completion of
3A remain next. The ledger records the prior short base, extended base, and
lip-sync at estimated USD 0.60, 0.60, and 0.50 respectively; these figures
are not invoice-reconciled. Kling reported 2.5, 5, and 1 deduction units for
those three tasks. The flat USD estimate for the 10-second base may understate
its cost relative to the 5-second base.

Goal Guardian check: the candidate performs only the approved Mark 3:3
utterance in the approved close Jesus view. It preserves the original source
binding, existing character voice, and producer review gate without adding
Scripture content or selecting footage for the editable cut.

### Shot 3B speaking-performance revision (2026-09-23)

Dan found the first face-targeted take too weak: Jesus barely opened his mouth.
That attempt (`c672f203-b174-4aad-b1a8-38f80b4018d2`) is retained as
`retry_modified`, with his feedback recorded. A direct Kling Avatar take from
the same accepted, single-face 3B keyframe and exactly the same mapped Hatam
audio slice is now attempt `51b5ed76-04ef-4bad-a09f-a6b77d3115c0`,
`hold_for_review`. The provider output is
`generated/lipsync/931871945874866179.mp4`; a review trim of its first 6.183
seconds is `generated/lipsync/mark3-scene1-shot3b-avatar-review-6.183s.mp4`.
Sampled speaking frames show wider and more varied mouth shapes and facial
movement than the first take. Audio comparison against the bound composite
slice confirms the returned audio closely matches it. Kling reported 2.4
deduction units; the existing USD ledger estimate is $0.50, not invoice
reconciled. No timeline clip was selected; Dan's visual review remains the
gate before using this take alongside the still-planned 3A video.

Goal Guardian check: the revision responds to producer feedback on visible
speech performance while keeping the approved source interval, character
voice, keyframe, synagogue setting, and reviewable edit path intact.

### Shot 3B Avatar take approved and selected (2026-09-23)

Dan approved the stronger direct Avatar performance. Attempt
`51b5ed76-04ef-4bad-a09f-a6b77d3115c0` is now `accepted`, with selected
clip `45b35461-76f1-4135-9335-437a40aa5a8f` spanning shot-local
2.000-8.183 seconds, exactly the approved 3B coverage beat. The weaker
face-targeted take remains retained as `retry_modified`. No clip occupies
3A's 0-2.000 second setup yet, so covered-shot assembly must wait for that
beat. The ordinary whole-shot lip-sync acceptor now refuses covered shots;
the beat-aware acceptor is tested for exact offsets, idempotency, and overlap
protection.

Goal Guardian check: producer approval selected only the reviewed speaking
performance. It neither stretches that performance across 3A nor changes the
source audio, Scripture action, or character canon.

### Shot 3A staging candidate held for review (2026-09-23)

The accepted wide synagogue keyframe was animated for Shot 3A's approved
0-2.000-second non-speaking setup. Veo 3.1 Lite returned a 4.000-second,
1280×720 base (attempt `a5369573-3359-4587-a26d-1eba2c1ea57a`,
`generate_coverage_base`, `hold_for_review`); its first two seconds were
rendered as a muted 48-frame review clip at
`generated/video/review/mark3-scene1-shot3a-a5369573-3359-4587-a26d-1eba2c1ea57a-2s-muted.mp4`.
The base remains retained at
`generated/video/mark3-scene1-shot3a-a5369573-3359-4587-a26d-1eba2c1ea57a.mp4`.
Frame review found the approved character/room staging intact and no obvious
visible speech. Automated video review passed on recheck at 95/100 confidence;
its first 0.95 confidence response did not meet the documented 0-100 scale and
was not treated as a pass. Both review calls and their costs are retained.
A separate 3A-to-approved-3B review cut with the exact existing Hatam composite
line is at `generated/video/review/mark3-scene1-shot3ab-review-8.2s.mp4`.
Neither preview is a timeline selection: Dan's review of 3A and the cut remains
the gate before filling its 0-2.000-second interval.

Goal Guardian check: this creates a candidate for the producer-directed silent
picture beat under the existing Hatam line. It does not substitute provider
audio, approve the take, overwrite 3B, alter the source binding, or invent a
new event.

### Shot 3A approved; Shot 3 assembled (2026-09-23)

Dan approved the 3A→3B review cut while clarifying that **Jesus speaks during
all eight seconds**. The first two seconds are not narrator audio or silence:
3A is a wide visual setup under the same continuous Hatam Jesus line. Dan
accepted this take, but noted that lip-syncing the full line or choosing an
over-the-shoulder opening that concealed Jesus's mouth would have avoided the
visibly stationary mouth in 3A. This is retained as production feedback, not
silently turned into a new global requirement.

Attempt `a5369573-3359-4587-a26d-1eba2c1ea57a` is now `accepted` and its
clip `8bfae4da-0ceb-432e-b94a-7d738364965f` occupies shot-local
0-2.000 seconds. The previously approved 3B clip remains at 2.000-8.183
seconds. Covered-shot assembly initially stopped because it searched cast
audio by verse label, while the exact approved composite segment has a null
verse label by design. The assembler now prefers the producer-approved
utterance binding and `composite_audio_source_map`, checks source-hash and
speaker identity, and trims to the mapped interval; older unbound productions
retain their legacy verse lookup. Focused tests cover null verse labels,
subset intervals, stale-map rejection, and the legacy path.

The assembled 720p shot is retained at
`generated/assembled/b3d64f2d-90ff-4b6c-8cda-dd98391a0d50.mp4`, with
the provider audio discarded and the single continuous Hatam Jesus line
under both cuts. The output has 8.167 seconds of 24 fps picture for the
8.183-second planned interval (sub-frame rounding); the audio stream is
8.150 seconds after AAC muxing, roughly 23 ms shorter than the retained
8.173-second composite source. No source binding, 3B approval, Scripture,
casting, or other shot was changed.

Goal Guardian check: the producer-approved coverage now has complete picture
and the correct mapped speaker audio. The narrower audio tail is disclosed
for final-cut QC rather than represented as sample-exact preservation.

## Drafts now arrive with an automated verdict (2026-09-21)

Dan asked how draft clips were evaluated. They weren't: `generateShotDraft`
wrote a "please look at this" note and nothing read it. The draft room's
whole premise is judge-before-you-commit, and the judging was manual only.

Three evaluation capabilities existed and none applied to drafts. The
Critic/Director QC pass (`runShotReview`) is hard-filtered to
`operation='generate'`, so it only ever sees keyframes, and every other QC
check (critic, canonical-likeness, scene-fidelity) reads still images. The
production crew does review real video, but only the assembled cut in the
finishing phase. And a genuine automated *video* review already existed --
inline in `creative-direction/implement.ts`, reachable only by gap-filler
videos.

Extracted that third one to `qc/video-review.ts` and pointed both callers
at it. It watches the clip against the keyframe it was meant to animate,
checking motion, continuity, physical action, source fidelity and unwanted
text, and returns pass/confidence/reason. `videoReviewPassed` requires an
explicit pass, a stated reason, and a confidence genuinely inside 0-100 --
a model claiming 140 is not more certain than one claiming 90.

The two callers deliberately treat a failure differently, and this is the
part worth remembering:

- A **directed gap-filler video** that fails is held. It would otherwise
  become deliverable footage. Behaviour preserved exactly.
- A **draft** that fails is recorded and stays choosable. The producer is
  comparing takes, and an uncalibrated confidence score should not veto
  that choice. A review that cannot run at all (model down, oversized
  clip) is likewise recorded and nothing more -- the draft is already
  generated and already paid for, so discarding it over a failed lookup
  would destroy real work.

The extraction also switched that path to the metered call, so the review
that was previously invisible now lands in `cost_ledger_entries` for both
callers. A draft now costs ~$0.26 to render plus ~$0.02 to review.

Still unbuilt: the upscale-an-approved-draft path, and no discard, so
rejecting all three drafts leaves a shot at capacity.

## Draft room wired into media generation (2026-09-21)

Two halves, deliberately in different places.

The **gate** lives in `generateNonSpeakingVideoCandidate`: a shot whose
risk says `draftFirst` returns `needs_draft` unless a draft has already
been chosen. Put there rather than in the stage loop so the per-shot API
route (`POST .../final-video`) cannot skip it, and placed before the
keyframe lookup so a refusal costs nothing -- asserted by provider call
count and an empty cost ledger.

The **production** of drafts lives in `runMediaGeneration`'s loop: a risky
shot gets a 360p Omni draft instead of a render, and only falls through to
the full render once one is chosen. The stage's summary now separates
drafts awaiting a choice, shots holding the maximum drafts already, and
final candidates awaiting review, rather than lumping them together.

What a real Mark 3 media-generation run would now do, computed through the
actual code path (18 non-dialogue shots, 12 risky):

| | cost |
| --- | --- |
| first run: 12 drafts + 6 economy renders | **$5.52** |
| remaining renders after drafts are chosen | $13.60 |
| total if nothing is re-rendered | $19.12 |
| all-premium, no drafts | $28.80 |
| all-economy, no drafts | $7.20 |

Worth being plain about: **drafting is not free insurance.** If every
render lands first time, this costs $19.12 where rendering everything at
economy would have cost $7.20. It pays only where a draft prevents a
wasted premium render -- two avoided premium re-renders roughly cover the
whole draft budget. The reason to run it is that the risky shots are
exactly the ones the RAI filter and the crowd-duplicate check have
actually bitten before, not a general assumption that drafts save money.

Still unbuilt: the upscale-an-approved-draft path media-generation.md
prefers (the chosen draft informs the render; it is not its source), and
no discard, so rejecting all three drafts leaves a shot at capacity.

## Draft room: several cheap drafts per shot, then one is chosen (2026-09-21)

`media-generation/draft-room.ts` gives `draftFirst` its missing consumer.
`generateShotDraft` produces a 360p Omni pass and, unlike
`generateNonSpeakingVideoCandidate`, several can be held for the same shot
at once; `chooseShotDraft` records which one the producer picked.

Kept deliberately separate from the final-render candidate flow rather
than loosening it, because a draft and a final are different things. Two
finals pending review is an unreconciled decision about deliverable
footage; several drafts pending is the point. They stay apart via
`generation_attempts.operation` (`generate_draft` vs
`generate_final_video`), which also keeps drafts out of the orchestrator's
"does this shot have footage yet" check -- a 360p draft is never
deliverable footage, and choosing one writes no `clips` row.

Relaxing "one at a time" removed a real cost guard, so it is replaced
rather than dropped: at most `MAX_HELD_DRAFTS` (3) may be held per shot.
At ~$0.26 for an 8s Omni draft that is ~$0.78, still under the single
premium render ($1.60) the draft room exists to avoid wasting -- raising
the cap past the cost of the render it protects would defeat the point. A
refusal at capacity costs nothing, which the tests assert by call count,
and removing the cap fails them.

Unchosen drafts stay held as history rather than being deleted or
rewritten, matching the append-only discipline of the alignment evidence
tables.

Known limits:
- Choosing a draft records the composition to commit to; it does not
  produce the shot. The full render still runs through
  `generateNonSpeakingVideoCandidate`, and the upscale-an-approved-draft
  path that media-generation.md prefers is still unimplemented.
- There is no discard, so a producer who rejects all three drafts is at
  capacity with nothing chosen. Deliberately not built on speculation;
  it needs a real decision about what "rejected" means, given
  generation_attempts.status has no such value.
- Nothing calls `generateShotDraft` automatically yet. The risk signal
  says which 12 of Mark 3's 18 shots are worth drafting, but wiring that
  into media generation is a separate step, and media generation for Mark
  3 has never been run.

## Shot-risk signal drives Veo tiering and draft-first (2026-09-21)

`casting/shot-risk.ts`'s `assessShotRisk` classifies a shot routine /
elevated / critical from facts the plan already carries, with a stated
reason for every tier. `media-generation/shot-risk-lookup.ts` reads those
facts from the database and maps them onto a render tier; the DB half is
kept separate so the rule itself stays pure and directly testable, the
same split coverage.ts already uses.

`VideoProvider.generateFinal` now takes a `tier`, and
`GeminiVideoProvider` selects the matching Veo 3.1 variant and rate --
economy/lite $0.05, standard/fast $0.10, premium $0.20. All three model
IDs were confirmed against the live model list (2026-09-21) rather than
guessed: `veo-3.1-lite-generate-preview`,
`veo-3.1-fast-generate-preview`, `veo-3.1-generate-preview`. Omitting the
tier gives economy, so a caller that has not assessed risk cannot
silently buy the expensive render. `generateNonSpeakingVideoCandidate`
passes the assessed tier and records the reasoning in its review note.

**The first calibration was wrong and real data caught it.** Thresholds
chosen a priori classified all 18 of Mark 3's non-dialogue shots as
critical -- no discrimination at all, and a 4x cost increase ($28.80 vs
$7.20) for nothing. Two factors turned out to carry no information:
continuity notes are set on 30 of 30 shots, and "moderate" crowd is also
`DEFAULT_CROWD_DENSITY`, so neither separates one shot from another. Both
were dropped. Cast size is the factor that actually varies (2-9 per shot)
and is the one the feasibility challenger independently flagged for the
nine-apostle frame.

Recalibrated against the real distribution, Mark 3 now comes out 6 routine
/ 7 elevated / 5 critical, 12 of 18 worth a draft first, and $16.00 of 8s
renders against $28.80 all-premium. The critical five are the frames you
would pick by eye: both nine-apostle shots, the six-character seaside
shot, and two five-character shots inside packed crowds.

Known limits, stated rather than papered over:
- Thresholds are calibrated against one crowd-heavy chapter. Re-check
  against a quieter one before trusting them on non-Mark-like material.
- Emotional weight is a real input that nothing in the shot row carries,
  so it is never inferred. Mark 3:5's healing insert -- two characters,
  locked off -- scores routine despite being the emotional turn of its
  scene. `escalateToCritical` exists for exactly that, and demands a
  stated reason.
- `draftFirst` is computed but has no consumer yet: the candidate flow
  still holds one take at a time, so multi-draft selection remains
  unbuilt.

## Omni draft cost is measured per second, not flat (2026-09-20)

`OMNI_DRAFT_COST_USD` was a flat $0.10 per draft regardless of length,
which is the wrong shape -- Omni bills per second like Veo does, so a long
draft was under-counted and a short one over-counted. Now
$0.033/sec (Dan's figure, 2026-09-20).

Per-second pricing needs a duration, and `generateDraft` has none: unlike
Veo's `generateFinal` there is no `durationSeconds` parameter, because
Omni decides the clip length itself. So the only honest way to price it is
to measure what actually came back, with a local ffprobe helper
(`probeDurationSeconds`). Deliberately local rather than reusing
assembly's `mediaDurationMs`: providers must not import from `pipeline/`,
enforced by tests/architecture/provider-boundaries.test.ts, and
assemble-single-shot/assemble-covered-shot already keep their own small
ffprobe helpers for the same reason.

If probing fails the attempt is recorded at zero rather than at an
invented duration. The clip is already generated and written to disk by
that point, so throwing over a pricing lookup would discard real work, and
a fabricated duration would be worse than an honest gap in the ledger.

Verified against real clips: 5s -> $0.17, 2s -> $0.07, 8s -> $0.26, and a
missing file -> $0. All three assertions fail against the old flat rate,
confirmed by restoring it.

This also sharpens the draft-first question Dan raised: at $0.033/sec an
8s Omni draft is $0.26, not the $0.10 the old constant implied, so three
drafts plus one Veo Lite final is ~$1.18 against $0.40 for a single blind
Veo render. Draft-first only pays where it actually prevents a wasted
render, which argues for making it selective rather than universal.

## Gap-filler negotiation is now cost-tracked (2026-09-20)

The Creative Director / Production Director calls used `generateJson`, so
none of their spend reached `cost_ledger_entries` -- yesterday's cost
tracking covered the production crew only. Added `generateJsonMetered`
(the no-images sibling of `generateJsonWithImagesMetered`) and a shared
`recordModelSpend` helper, and switched `proposeGapFillers`,
`reviseGapFillerIdeas` and the Director's `runDirectorReview` onto it.
Each call writes its own ledger row with a null generation_attempt_id, the
same shape crew-store.ts already uses, and `NegotiationOutcome` now
carries `modelCostUsd` alongside the existing `estimatedCostUsd` forecast.

Measured for real: the 15-gap Mark 3 negotiation cost **$0.4916** in
reasoning across 30 calls, to decide on **$15.04** of generation it has
not spent. Project ledger total is now $2.0379. `generation_attempts` for
Mark 3 remains zero -- nothing has been built.

Two defects found by the metering itself, both fixed:

- **The script under-reported by half.** It printed $0.2257 while the
  ledger grew $0.4916. `proposeGapFillers` writes its own ledger row, but
  its cost never reached the outcome object the script was summing -- so
  only the negotiation half was displayed. The proposal now carries
  `modelCostUsd` and the caller adds both halves. The ledger was right and
  the display was wrong, which is the failure the ledger exists to catch.
- **The script re-negotiated settled gaps.** Re-running with a lower
  threshold redid all 13 already-decided gaps, wasting about $0.43. It now
  skips any gap with a recorded `director_resolution`, with `--force` to
  redo deliberately.

Both verified on a real run: the next invocation skipped 15 settled gaps,
negotiated the 1 genuinely new one, printed $0.0326, and the ledger grew
by exactly $0.0326 across 2 rows.

Worth noting for the draft-tier question: roughly $0.50 of reasoning to
gate $15 of generation is a good ratio, and it is the same shape as using
a cheap Omni draft to decide before committing an expensive Veo render.

## Video cost constants corrected; Mark 3 gap negotiation run (2026-09-20)

Dan asked where the $1.04-per-shot figure came from before authorizing the
negotiation. Tracing it found two errors worth more than the number
itself.

**The recorded costs were not evidence.** `generation_attempts.cost_usd`
is computed from our own constants (`durationSeconds *
VEO_COST_USD_PER_SECOND`), so citing 229 recorded attempts as
corroboration of those constants was circular -- it was the estimate's own
arithmetic played back. Nothing in this repo has ever been reconciled
against a real invoice, exactly as every cost comment already said.

**The price didn't match the model.** `VEO_MODEL` is
`veo-3.1-lite-generate-preview` -- every shot renders through Veo 3.1
*Lite*, with no tier selection at all (images have standard/Pro tiering;
video never got it). But `VEO_COST_USD_PER_SECOND` was $0.20, the
*Standard* rate, derived from an assumed "$1.60 for an always-8-second
clip". Corrected to $0.05/sec using Dan's tier pricing (Lite $0.05, Fast
$0.10, Standard $0.20), and `ESTIMATED_COST_USD` from $1.04/$0.80 to
$0.64/$0.40 ($0.24 keyframe + 8s Lite at $0.40). This is not just
bookkeeping: the Production Director weighs approve/reject against those
figures, so a 1.6x-inflated number was making it decline coverage that was
actually affordable.

New `scripts/negotiate-narration-gaps.ts` drives the Creative Director /
Production Director negotiation from the coverage advisory for any
project, and **stops before `implementApprovedIdeas`** -- the existing
`run-production-director.ts` is hardcoded to Mark 2 and proceeds straight
into real paid generation, which is not what "run the negotiation" should
mean.

First run for Mark 3, 13 gaps of >= 4s (97.3s of the 104.2s total):
**26 ideas approved, 5 rejected**, $14.24 estimated if every one were
built. Verified nothing was generated -- `generation_attempts` for this
project is still zero. The approved ideas are precisely the beats Dan
asked about when this thread started: crowd reactions to the scribes'
accusation, the disciples' astonishment at the unclean spirit, James and
John receiving the name Boanerges, the man with the withered hand seated
quietly before he is called.

Three honest observations about the run:

- **The negotiation never actually negotiated.** Every one of the 13 gaps
  resolved in 0 rounds -- the Director issued 26 approvals and 5
  rejections on first pass and never once returned `request_changes`, so
  the 10-round machinery has yet to engage. Whether that means the ideas
  were simply good or that the Director isn't pushing back hard enough is
  unresolved.
- **Adjacent spans produce duplicate ideas.** The two separate "mark
  3:17" narration rows were proposed for independently, and both returned
  a "hold on Jesus naming the Sons of Thunder" extension plus a "James and
  John react" close-up. Building both would put two near-identical
  reaction shots back to back. Nothing in the current design lets one
  gap's proposal see another's.
- **These calls aren't cost-tracked.** `proposeGapFillers` and
  `negotiateGapProposal` use `generateJson`, not the metered variant, so
  the ~40 Gemini calls this run made never reached `cost_ledger_entries`
  (still 36 rows, all from the crew runs). The cost tracking added
  yesterday covers the production crew only.

## The shot planner now sees real narration durations (2026-09-20)

Root-cause fix for the under-provisioning the advisory above measured.
`buildScenePrompt` previously gave the planning model only the English
reference text, the confirmed speakers and the canon list -- nothing about
how many seconds of narration audio it was actually covering. So it split
each scene into shots purely by text structure, blind to duration, and
Mark 3 came out with roughly half the non-dialogue video its narration
needs.

Each scene's prompt now carries a measured narration budget: the real
seconds of narration-only audio in that verse range, broken down per span,
and the fewest non-dialogue shots that can cover it at
MAX_SINGLE_CLIP_LIPSYNC_MS. The arithmetic stays in code
(`narrationBudgetFor`, pure and unit-tested) rather than being left to the
model, the same reasoning that already governs `planCoverage`'s use of
real dialogue durations. The verse-reference resolution is shared with the
coverage report via a new exported `resolveNarrationSpans`, so the
correction/editorial overlay fixed yesterday has exactly one
implementation rather than two that can drift.

The prompt is explicit that more shots means more COVERAGE of what the
text already says -- another angle, a closer or wider view, the moment
just before or after a stated action, a reaction from someone the text
places in the scene -- never new events, dialogue or theology, and that a
wordless reaction beat is legitimate only where the passage supports one
and stays within its decorum. That mirrors the standing guidance already
embedded in the Creative Director's gap-filler prompt, so the two agents
now say the same thing rather than only the later one knowing the rule.

What the planner would now see for Mark 3, against what it actually
planned when it was blind to this:

| scene | narration | needs | planned |
| --- | --- | --- | --- |
| 1 (3:1-6) | 49.1s | >= 10 | 5 |
| 2 (3:7-12) | 72.5s | >= 12 | 4 |
| 3 (3:13-19) | 57.3s | >= 13 | 3 |
| 4 (3:20-30) | 47.8s | >= 7 | 4 |
| 5 (3:31-35) | 13.5s | >= 2 | 2 |

44 non-dialogue shots against the 18 Mark 3 has -- and that 44 is a floor,
assuming every shot runs the full ceiling. Scene 5 already being adequate
is a useful check that the figure isn't uniformly inflated.

Two consequences worth stating plainly. This does not retroactively change
Mark 3: casting refuses to re-plan a chapter that already has shots, so
Mark 3's shortfall remains a deliberate decision (re-plan, or close it
through the Creative/Production Director negotiation). And honouring
"the narrator must never go silent" properly costs real money -- at the
Production Director's own ~$1.04 per new shot, going from 18 to 44
non-dialogue shots is roughly $27 more per chapter in generation.

## Narration coverage moved before media generation, as an advisory (2026-09-20)

Dan asked whether breathing-room/reaction planning should happen before
media generation rather than after, and chose the advisory (non-gating)
approach. Background: the Creative Director / Production Director
gap-filling negotiation (creative-direction/index.ts,
production-director.ts) already exists and is built for exactly this --
its prompt quotes Dan's own standing guidance about awe, gasps and
narration pauses -- but it had never run for Mark 3, because
`scripts/report-narration-coverage.ts` is hardcoded to Mark 2's project id
and measures gaps against already-assembled clip durations, which don't
exist until media generation has happened.

New `src/pipeline/casting/narration-coverage.ts` (`computeNarrationCoverage`)
plus `GET /:id/narration-coverage`, modelled on canon-readiness: read-only,
live-computed, never blocks anything, makes no provider calls. It works at
any pipeline stage because the audio side of the equation -- real
narration-span durations -- is already known from alignment. A non-dialogue
shot's duration is its real assembled clip once one is accepted, and
MAX_SINGLE_CLIP_LIPSYNC_MS (the single-generation ceiling, the most
generous available assumption) before that, so a reported shortfall is
genuine rather than an artifact of underestimating.

Two matching bugs were found by checking the first Mark 3 output against
the raw data rather than trusting it, and both are fixed:

- **Containment dropped every multi-verse shot.** A shot planned for
  "Mark 3:16-17" is wider than either of the narrower "mark 3:16"/"mark
  3:17" narration rows the aligner actually produced, so it satisfied
  neither and counted as covering nothing -- 3 of 18 non-dialogue shots,
  24s. Switched to overlap. This does NOT reopen the double-count bug
  coverage.ts's `verseRangesRelated` guards against: that path sums every
  matching segment with no claim set, whereas `claimedShotIds` here
  already caps each shot at one span globally. An earlier claim in this
  session that loosening the match was risky was wrong -- it conflated the
  two code paths.
- **Reading the raw `verse_ref` column silently dropped real narration.**
  28.3s of it, including two segments a human had explicitly corrected
  ("Mark 3:4", "Mark 3:18") and three children of this session's own
  segment splits, which start with a null verse_ref by design. Now
  resolved through the same overlay the API projection uses (corrections
  outrank the raw column; an editorial classification means
  title/cross-reference material, not Scripture). Anything still
  unplaceable is itemized in `excluded`/`unplaceableMs` rather than
  vanishing.

Mark 3 before the fixes: 130.4s gap, 15/18 shots credited, 28.3s silently
dropped. After: **104.2s gap** against 240.2s of placeable narration and
136.0s of planned non-dialogue video, 17/18 shots credited, with 28.0s
editorial and 10.4s unplaceable both itemized.

Two things this surfaced, left for Dan rather than decided unilaterally:

- The remaining uncredited shot is `Mark 3:30` (the quiet-reaction beat).
  Its only narration span, `48c24660`, is classified
  `mixed_editorial_transition` -- it genuinely contains both the tail of
  v29-30 narration and the paragraph title before v31 -- and the report
  excludes any editorially-classified segment wholesale. That span likely
  wants the same split treatment Mark 3:5 and 3:32/33 already got, so only
  the title portion is editorial.
- The headline finding is robust to all of the above and is a shot-plan
  issue, not a report issue: 18 non-dialogue shots at the 8s ceiling is
  136s of video against ~240s of narration, roughly half what the chapter
  needs. That traces directly to `buildScenePrompt`, which never sees
  narration durations -- the shot planner decides how many shots to create
  with no idea how many seconds it has to fill.

## Mark 3 canon verified, a real shot_characters gap found and fixed, plan re-approved (2026-09-20)

Dan asked to verify all characters Mark 3 needs exist and are approved after
canon changes. `GET .../canon-readiness` said yes (26 needed, all approved),
but that endpoint only checks a DB status flag -- so also independently
confirmed every needed character's approved version has real, existing asset
files on disk (not just a flag), and separately compared the current
planning-brief hash against the last approved run's stored hash. That
surfaced something canon-readiness can't see: the previously-approved plan
(`ca9f1aca`) was stale, since Bartholomew and Judas's new v3 approvals (see
below) changed the brief after it was approved.

Re-ran the crew for real cost data, using the cost-tracking work above for
the first time on a live run: **held**, not approved, at **$0.963109**
across 23 calls (13 round 1 + 10 round 2) -- the Production Director's
blocking finding said "Man with withered hand" was missing from project
canon. Verified this independently rather than trust the finding at face
value: the character (`Man with Withered Hand`, v1, approved) genuinely
exists, but `shot_characters` had **zero rows** for it, despite four shots'
own action text naming him (Mark 3:1 gathered in the room, 3:3 "Jesus
speaks... to the man", 3:5 "commands the man, 'Stretch out your hand'", and
3:5's healing insert itself, `91afa1de`, which only listed Jesus). The
character was approved last night's canon-promotion session but never
actually wired to the shots that depict him -- canon-readiness's own query
starts from `shot_characters`, so it can never catch a shot that never
claimed a needed character in the first place, only that what's already
claimed is approved.

Linked the character to those four shots (`INSERT INTO shot_characters`,
via the real `getDb()` connection so the correct `journal_mode=PERSIST`
pragma applies -- a raw ad-hoc connection hit "disk I/O error" on this
mount without it, same known limitation documented in db/client.ts).
Confirmed canon-readiness now lists 27/27 approved with no gaps before
spending anything further, then re-ran: **approved**, 13 calls, one round
(no revision needed), **$0.550564**. Confirmed the healing shot's
characterIds now list both the withered-hand character and Jesus, the
Director covers all 30 shots, and the deliberation export refreshed with
the new run id. Cumulative tracked spend for this project: $1.513673 --
the first time this number has ever been nonzero.

Separately: Dan (or a parallel session) used the Canon Builder workflow
directly to promote seven apostles to new v3 identities while this
conversation was ongoing -- Bartholomew, Judas Iscariot, James son of
Alphaeus, James son of Zebedee, Philip, Matthew, and Thaddaeus (see the
four canon-promotion entries following this one; `scripts/character-tool/
promote-*-v3.ts` are the scripts that did it, committed alongside this
entry since they were sitting uncommitted). Re-checked plan freshness
after discovering this: the already-approved `acbf268c` run is still
current -- all seven promotions were already live by the time it ran, so
no further re-run is needed for that reason.

## Production crew Gemini calls now record real cost (2026-09-19)

Dan chose the cost-tracking improvement over the other option offered
(dropping the fidelity challenger's specific-segment-ID guesses, since one
of its 90%-confidence picks during the shot-binding work above was
actually wrong). `production_events.cost_usd` was hardcoded NULL on every
insert and `CrewBrief.spentUsd` (`SUM(amount_usd) FROM
cost_ledger_entries`) never had a crew-call row to sum, so a production
run's Gemini spend was invisible to both the audit trail and the
Production Director's own "review the actual spend" duty.

`generateJsonWithImages` (gemini-text.ts) discarded Gemini's
`usageMetadata` entirely. Rather than change its return shape -- it has 7
other unrelated callers (canonical-likeness, critic, scene-fidelity,
soundtrack review, alignment identification, generateJson) that would all
have to unwrap a `.result` they don't need -- added a sibling
`generateJsonWithImagesMetered`, sharing the same underlying fetch/parse
logic, that also returns token usage and an estimated USD cost. Pricing
constants ($0.30/1M input, $2.50/1M output tokens, output including
thinking tokens) are a rough public-pricing-based placeholder, explicitly
labeled NOT reconciled against a real invoice -- same honesty convention
already used for NANO_BANANA_COST_USD/VEO_COST_USD_PER_SECOND in
providers/gemini/index.ts; replace with a verified figure once real
billing data exists.

crew-store.ts's default `call` (used whenever a caller doesn't inject its
own, i.e. every real run) now calls the metered variant and captures its
cost via a variable reset before each call and read once by `log`
immediately after -- `runCrew` always calls `log` exactly once per `call`,
success or failure, before starting the next one (crew.ts), so this can
never attribute one call's cost to a different event or leak a stale
value into a failed one. Every real call's cost_usd is now stored on its
own production_events row, and a matching cost_ledger_entries row
(generation_attempt_id NULL, since it's not a media generation attempt) is
recorded too, so spentUsd will reflect real crew spend the next time a
brief loads. A caller-supplied `call` (every existing test, and manual
recovery) still leaves cost_usd NULL, unchanged from before.

Discovered two existing tests that vi.mock the whole gemini-text module
with an explicit export list (durable-production.test.ts,
fresh-chapter-full-production.test.ts) and would have silently broken
running the real pipeline the moment the new export was added; fixed both
to also provide generateJsonWithImagesMetered. New tests: 2 in
gemini-text.test.ts (cost computed from usage; missing usageMetadata
treated as zero rather than throwing) and 1 in crew.test.ts exercising the
real default call end-to-end (mocked fetch, maxCalls:1, no injected
call) -- confirmed to fail (cost_usd stayed null) against the pre-change
crew-store.ts before confirming it passes now. Typecheck, full suite (350
tests/62 files), and build:web all pass.

Known limitation, unchanged by this work: spentUsd is read once when a
brief loads and held fixed for that whole run (crewBriefHash already
zeroes it for planning-phase hashing), so a run's own earlier-round calls
never appear in its own later-round spentUsd -- only in the *next* run's.

## Segment-merge capability built; all 12 crew-flagged shots now bound (2026-09-19)

Dan chose to merge the two adjacent segments for the remaining shots rather
than pick one as the emphasis line. There was no existing inverse of
`segment-splits.ts`, so built one: `src/pipeline/ingestion/segment-merges.ts`
(`recordSegmentMerge`), a new `source_alignment_segment_merges` table
(mirrors `source_alignment_segment_splits`'s evidence-preservation shape,
just two originals in instead of one), and `POST
.../segment-merges`. Same discipline as the split: refuses to merge onto a
segment a shot is already bound to, refuses silently dropping existing
corrections/classifications/attributions/overrides (repoints them,
requires `acknowledgeSupersededEvidence` if any exist), and the merged
segment starts with no speaker/verse_ref -- a human re-records it. Added
validation the split doesn't need, since two independent IDs create new
failure modes a single segment can't: reject overlapping targets, reject
targets passed out of chronological order, and reject a merge if some
other segment falls between the two (guards against merging a mismatched
pair). 9 new tests in `segment-merges.test.ts`, confirmed to fail without
the implementation before confirming they pass with it.

Both real cases turned out to already be part of one continuous,
already-attributed Jesus quotation (Mark 3:23-29's divided-kingdom
parable) split into one `audio_segments` row per verse by the aligner --
their own existing attribution evidence said as much ("interior verse of
the continuous quotation"), which is why merging rather than picking one
segment was the right call, not an arbitrary choice. Merged
`65856c33`+`814d3cbe` -> shot `da0b28bc` (Mark 3:24-26) and
`5dcb5794`+`0ef8c24a` -> shot `4cc7c4fe` (Mark 3:27), re-attributed both
merged segments to Jesus, and bound both shots.

All 12 of the shots the production-crew challengers originally flagged as
missing `sourceSegmentId` are now bound. Typecheck, full suite (347 tests
across 62 files, including the 9 new ones), and `build:web` all pass.

Also: the long-running `npm run dev` process (tsx watch + vite) stopped
responding on port 4000 mid-session, after the schema/route edits above --
alive as a process but not listening, and its stdout wasn't visible to
this session since it predated it. Killed the stuck process tree and
restarted `npm run dev` fresh rather than dig into a process this session
had no log access to; the new instance's startup log was clean.

## Mark 3:3/3:4 boundary resolved by ear; 10 of 12 flagged shots now bound (2026-09-19)

Dan listened to the playback tool and confirmed verse 3 ends at 37.752s
within segment `5b497010` (29.569-40.929s, previously tagged the combined
"mark 3:3-4" and already attributed whole to Jesus). Split it there
(`source_alignment_segment_splits`, reviewer "Dan", acknowledging the
existing attribution as superseded) and re-attributed both pieces at the
finer grain, carrying forward the original attribution's own text
breakdown rather than re-deciding it:
- `567e1949` (29.569-37.752s) = "Yesus pai bak no di ninda nite hi mai
  'Akiju kwei ba, aya ei yahagom yoho bei.'" -- narrator intro + Jesus's
  quoted "Come here" -- Mark 3:3.
- `fb51068d` (37.752-40.929s) = "Lene Noni hig singgre tungwatu nya" --
  the quotative frame opening v4 ("And he said to them"), not the Sabbath
  question itself -- Mark 3:4, unbound to any shot (it's narration about
  Jesus's turn, not on-camera quoted dialogue).

Bound shot `b3d64f2d` (Mark 3:3) to the new first piece, and shot
`0e456bc8` (Mark 3:4) to `6563e2f8` (41.733-55.733s) -- already a clean,
fully-attributed, uncontested match on its own. `0e456bc8`'s "25.4s of
continuous dialogue" coverage-notes estimate implied it needed more than
that segment's 14.0s alone, which is what made this look ambiguous
originally; treating that figure as a rough pre-alignment approximation
rather than literal (same call made for `9c94aef7` below) resolved it.

10 of the 12 originally-flagged shots are now bound. The remaining 2
(`da0b28bc` Mark 3:24-26, `4cc7c4fe` Mark 3:27) are still blocked on the
architecture/editorial question already logged above -- each needs one of
two already-attributed adjacent segments merged or chosen as the lip-synced
emphasis line, not a listening question.

## Mark 3 utterance bindings for the crew's flagged shots (2026-09-19)

The challengers' "12 dialogue shots have needsLipSync=true but sourceSegmentId
is null" finding named exact segment IDs for only 2 of the 12 shots, and one
of those two (`5b497010` for shot `b3d64f2d`, Mark 3:3) turned out to be
wrong on inspection -- it's a naive first-verse-match, not a verified
utterance boundary. Rather than trust the challengers' suggestions directly,
walked the full `original_reading` timeline for the chapter (49 segments,
ordered by start_ms, cross-referenced against `speaker_character_id` -- not
`verse_ref`, which goes stale/null across a segment split and undersells
what's already decided) and classified all 12 by whether the correct segment
was actually unambiguous:

- **8 bound now**, each to an already speaker-attributed, non-competing
  segment: `03501e06` (Mark 3:5, "Stretch out your hand" -- the exact
  segment `3930cb5c` Dan's own earlier split evidence already identified and
  attributed to Jesus, just never wired into the shot), `ffb0efa5` (Mark
  3:11, Man with Unclean Spirit), `b01bcda8` (Mark 3:14-15), `b337e589`
  (Mark 3:23), `b5371a81` (Mark 3:28-29), `48b246ee` (Mark 3:33 -- Dan's own
  408-413.645s correction from earlier this session), `729dda33` (Mark
  3:34), `9c94aef7` (Mark 3:35). All via `POST
  .../shots/:shotId/utterance-binding`, approvedBy "Dan".
- **4 left unbound, for two distinct reasons, neither safe to guess:**
  - `b3d64f2d`/`0e456bc8` (Mark 3:3/3:4): segment `5b497010` (29.569-40.929s)
    is tagged a combined "mark 3:3-4" and both shots' Jesus dialogue may
    share it -- where "Come here" ends and "Is it lawful..." begins isn't
    determinable from metadata. Built a playback control at
    `HeartWordData/assets/_scratch/mark3-v3v4-boundary.html` (served via
    `/media/_scratch/...`, same pattern as the earlier alignment-gap
    listening tools) for Dan to find the exact boundary by ear.
  - `da0b28bc` (Mark 3:24-26) and `4cc7c4fe` (Mark 3:27): each shot's Jesus
    dialogue is already fully, unambiguously attributed -- but it spans TWO
    adjacent segments each (`65856c33`+`814d3cbe`; `5dcb5794`+`0ef8c24a`),
    and `shot_utterance_bindings` only holds one segment per shot. Both
    shots are `coverage_plan='covered_sequence'`, where only one "tight
    insert" line actually needs the lip-synced interval -- so this isn't a
    listening question, it's an editorial one (which line is the emphasis
    beat) or a schema one (support a segment merge). Left for Dan to decide
    rather than picking one segment arbitrarily, which the existing
    `voice-lipsync/index.ts` comments explicitly warn against ("choosing
    the first one would put real speech on the wrong mouth").

## Mark 3 production crew re-run validates the deliberation improvements (2026-09-19)

Re-ran the production crew for Mark 3 planning (run `ca9f1aca`) after
implementing challenger-brief narrowing, sole director authority, automatic
per-chapter deliberation export, and canon reference images for visually-
judging roles. Compared against the prior approved run (`31d90474`) directly
via the stored `brief_json`/`result_json` for both:

- Canon reference images measurably changed what the visual roles caught.
  Before images were attached, `cinematographer` and `staging_designer` had
  **zero** findings on the whole chapter; with the same shot now showing them
  the actual reference art, both independently flagged the same real defect
  `costume_designer` and `fidelity_challenger` already knew from text notes
  alone (character `44a42fb6` docs say "headwrap", asset renders bareheaded).
  `staging_designer`'s finding language ("is bareheaded in canon reference
  image") confirms it reasoned from the image, not the name/notes. Total
  advisory findings across the 13-role crew rose from 9 to 23, concentrated
  in the four visually-oriented roles.
- The automatic deliberation export
  (`HeartWordData/exports/production-crew/hatam-mark-3-planning.json`)
  correctly overwrote itself with the new run's id with no manual step,
  confirming `saveDeliberationExport` is durably wired into
  `runProductionCrew` rather than a one-off backfill.
- Production Director direction for the same shot reads as genuinely merged
  craft output in one instruction (lens/movement, per-character wardrobe,
  blocking, lighting with an EV value), consistent with the updated
  sole-authority duty; all 30 shots had director coverage in both runs, so
  that validation was already incidentally satisfied before it was enforced.
- Challenger-brief narrowing was already active in the prior run, so this
  re-run isn't new evidence either way on redundancy; the three challengers
  still converge on the same headwrap/lip-sync-binding issues, but that
  reflects a real shared defect surface (one bad asset, twelve unbound
  segments), not un-narrowed scope.

## Mark 3 Man with Withered Hand canon promotion (2026-09-19)

Dan approved a new chapter-scoped Papuan v1 canon for the Man with Withered
Hand. The seven selected candidates were copied non-destructively into
`characters/man-with-withered-hand-mark-3/`, recorded with hashes and their
candidate source paths, and left in the candidate area for comparison. The
anatomical **left** hand is affected in all pre-healing references through
Mark 3:4; the healed stretched-hand reference is eligible only from Mark 3:5.
The affected/healed close-up comparison images are proof/reference assets,
not ordinary scene poses.

Character-asset metadata now carries story state, an eligible verse range,
and an asset role. Generation reference selection receives the shot verse and
excludes out-of-range state assets and comparison proofs, rather than relying
on filename ordering. This is a narrow continuity safeguard: it does not add
story action, modify the source performance, approve rejected variants, or
alter existing candidates.

## Mark 3 production crew planning approved (2026-09-19)

Dan asked to run the production crew (`POST .../production/plan`). Found
and fixed two more real bugs surfaced along the way, both pre-existing and
unrelated to this session's alignment work, before the run could succeed:

- A copy-script bug from the earlier character-approval step: reference
  art for "Man with Unclean Spirit" was written to a doubled
  `assets/characters/characters/...` path, one level too deep, while the
  manifest/DB correctly recorded the intended
  `assets/characters/man-with-unclean-spirit-mark-3/...`. Moved the files
  to the correct location (content hash re-verified unchanged) rather than
  re-copying.
- The first curl call to `/production/plan` was cut off by a client-side
  timeout while the real crew run continued server-side (Express doesn't
  abort in-flight async work just because the client disconnected),
  leaving `production_runs` in `status='running'` with 5 events already
  logged. Confirmed it was still genuinely progressing (not a dead
  worker) rather than attempting `recover/:runId`, which would have
  wrongly treated a live run as interrupted. Waited for natural
  completion via a single-notification background poll instead of
  chat-noisy per-event monitoring.

Result: **approved**, 13 calls, 30 shots, no blocking issues or
unresolved coverage requests. Summary: "Phase planning pass 1 for Mark 3
resolves all team contributions across the synagogue healing, coastal
shoreline crowd, mountain commissioning, domestic dispute with scribes,
and redefinition of spiritual family. Script fidelity, historical
lighting, continuity, and Lip-Sync framing are fully harmonized across all
30 shots."

Media generation (real image/video provider costs) is the next pipeline
stage and has not been run -- that needs Dan's explicit go-ahead
separately, same as every other real provider call in this project.

## Mark 3 clears ingestion, scene breakdown, and casting (2026-09-19)

Dan attested the current Gemini coverage hold as approved
(`source_alignment_review`, reviewer "Dan"), which let the durable
orchestrator reuse a review-released ingestion execution instead of
re-running it fresh. That surfaced two real, unrelated path bugs left over
from the 2026-09-17 source-catalog migration, which only updated
ingestion's own path resolution -- casting and crew-context.ts kept their
own separate hardcoded legacy-only resolvers and were never touched:

1. `casting/index.ts`'s `resolveEnglishReferencePath` hardcoded
   `reference/english/<book>-<chapter>/<book>-<chapter>-text.docx` with no
   catalog fallback. Replaced with `resolveAndBindSourcePaths(db, project)`
   -- casting needs the full text+audio+reference package (it's a real
   pipeline stage using the bound source), so the full resolver is the
   correct fit here.
2. `crew-context.ts`'s `loadCrewBrief` had its own separate hardcoded
   legacy path construction, and deliberately takes an explicit `dataDir`
   parameter (not the global data directory) so its test suite can inject
   a temp directory for isolation -- the catalog resolvers always resolved
   against the *global* data directory internally, so a naive swap would
   have silently broken that isolation. Fixed by adding an optional
   `dataDir` override (default: the real data directory) to both
   `discoverSourcePaths` and `resolveAndBindSourcePaths` in
   `source-catalog.ts`.

   That swap surfaced a second, real mismatch: `loadCrewBrief` never
   needed a chapter's FCBH audio file to exist at all -- it reads audio
   purely per-segment from `audio_segments.source_path`, never a single
   canonical chapter-audio file. Forcing it through the full
   `resolveAndBindSourcePaths` package (which requires text+audio+
   reference as an all-or-nothing bundle, correct for ingestion's real
   needs) broke on every project lacking a co-located audio file at that
   convention, including all of `crew-context.test.ts`'s fixtures. Added a
   `requireAudio` parameter to `discoverSourcePaths` (default `true`,
   preserving ingestion/casting's exact existing behavior) and switched
   crew-context.ts to call `discoverSourcePaths(project, undefined,
   dataDir, false)` directly (not the DB-backed binding resolver, which it
   never needed either -- it has its own independent hash-based staleness
   check via `crewBriefHash`).

Verified against the real Mark 3 project: the durable orchestrator now
runs cleanly through ingestion, scene breakdown, and casting (all reused
their prior valid/review-released executions), and stops at
`media_generation` for a genuine, expected producer gate ("Run the
production crew and resolve its findings before generating new media"),
not a bug. Full validation: 57 Vitest files / 319 tests pass (including
all 16 crew-context tests, which initially broke and forced the
`requireAudio` fix above), typecheck and web build pass.

## Mark 3:5 and 3:32-33's mixed segments split and attributed (2026-09-18)

Used the new segment-splitting capability (and found/fixed a real bug in
it) to resolve both of Mark 3's remaining mixed-content gaps:

**Mark 3:5** (70.759-77.995s): Claude ran the ingestion pipeline's own
`detectSilences` (ffmpeg silencedetect) scoped to this segment as a
candidate-finding aid, found a 277ms pause at 71.763-72.040s, and Dan
confirmed by ear at 0.5x speed that the quote ("Atit anda." / "Stretch out
your hand") ends there. Split at 72.0s (Dan's requested +0.1s pad). The
first piece (70.759-72.0s) is now attributed to Jesus; the second
(72.0-77.995s, the healing's narration) stays unattributed.

**Mark 3:32-33** (399.191-413.645s): this segment already carried the
combined "Mark 3:32-33" correction from earlier, so splitting it exercised
-- and broke -- the acknowledge-and-supersede path for the first time.
Split twice, at Dan's previously-confirmed 406s and 408s boundaries, into
three pieces: the crowd's quote (399.191-406s, now corrected + attributed
to "Crowd witness (stern man, spokesperson)" -- the group's designated
voice per canonical-characters.md), Mark 3:33's narration lead-in
(406-408s, unattributed), and Jesus's reply (408-413.645s, corrected +
attributed to Jesus). The old combined correction is preserved as
historical record but no longer describes a live segment.

**Bug found and fixed doing this**: the first real split attempt threw
"FOREIGN KEY constraint failed" -- `recordSegmentSplit` deleted the
original segment while evidence rows still referenced it, since
schema.sql runs with `foreign_keys=ON`. Fixed by repointing superseded
evidence onto the first new segment before deleting, matching how
re-ingestion's own remap always repoints first. Also replaced the test
fixture's hand-rolled schema with the real schema.sql, since the subset
never enabled foreign keys and let this ship untested -- confirmed the
corrected test fails without the fix and passes with it. Full validation
after the fix: 57 Vitest files / 319 tests pass.

Mark 3's speaker attribution is now complete: every identified quotation
either has a canon character attributed to it, or is deliberately left as
narration with documented reasoning (Mark 3:22's reported-not-quoted
Beelzebul accusation, and the brief quotative-frame slivers throughout).

## Segment-splitting capability built (2026-09-18)

Built the tooling gap flagged twice now: `recordSegmentSplit`
(`src/pipeline/ingestion/segment-splits.ts`) splits one original-reading
interval into two at a producer-heard boundary, for when automated
segmentation merged genuinely distinct content (two speakers, or dialogue
mixed with narration) into one interval too coarse to attribute -- Mark
3:5's "Stretch out your hand" and Mark 3:32's crowd line are the two real
cases waiting on this.

Segments are already treated as regenerable elsewhere in this schema
(re-ingestion deletes and recreates all of them; only evidence tables are
durable), so a split follows the same convention: delete the original row,
insert two new ones with no verse_ref/confidence/speaker (a human
re-attributes each side separately, never guessed). The new
`source_alignment_segment_splits` table records the split permanently,
including exactly which prior corrections/editorial classifications/
speaker attributions/boundary overrides existed on the segment being
split. `recordSegmentSplit` REFUSES to run if any exist unless the caller
passes `acknowledgeSupersededEvidence: true` -- it never guesses which new
segment inherits old evidence, and never deletes the superseded rows
(preserved as historical record, just no longer linked to a live
segment). Wired into `POST /:id/segment-splits`.

Known, accepted limitation: a later re-ingestion won't find an automated
interval matching either new segment's finer bounds, so evidence recorded
against them will safely hold re-ingestion (the same "no exactly
equivalent replacement interval" guard used elsewhere) rather than
corrupt anything -- consistent with this project's "hold rather than
guess" philosophy, not a new kind of risk.

Full validation: 57 Vitest files / 319 tests pass (5 new unit tests
covering the clean-split case, out-of-bounds rejection, the
existing-evidence refusal/acknowledgment path, and validation), typecheck
and web build pass. Not yet applied to Mark 3:5 or Mark 3:32 -- the exact
split timestamp for 3:5 needs Dan's ear, and 3:32's split requires
deciding what replaces the existing combined "Mark 3:32-33" correction.

## Speaker analysis wired into audio_segments.speaker_character_id (2026-09-18)

Built the pipeline gap flagged earlier: a new append-only
`source_alignment_speaker_attributions` table (schema.sql +
`src/pipeline/ingestion/source-alignment-speaker-attributions.ts`), same
family as corrections/editorial classifications, but different in one way
-- it writes the real `audio_segments.speaker_character_id` column
immediately on record, since casting (`src/pipeline/casting/index.ts`)
reads that column directly rather than through an API-layer evidence
overlay. Requires the target character to be `canon_status='approved'`.
Wired into `POST /:id/source-alignment-speaker-attributions`, and into
re-ingestion's remap logic in `index.ts` (alongside corrections/editorial
classifications, using the same original-pre-override-bounds fix from
earlier) so an attribution on a boundary-overridden segment survives and
the new segment gets `speaker_character_id` reapplied -- proven by a
regression test mirroring the correction/boundary-override one.

Applied the earlier text analysis to Mark 3's real segments using the
stored Gemini evidence's per-segment matched text (not just verse labels),
so each attribution is grounded in exactly which words that interval
covers, not a guess from verse ranges alone: 11 segments to Jesus (Mark
3:3-4, 4, 14, 23, 24, 25-26, 26-27, 27, 28-29, 34-35, 35) and 1 to Man with
Unclean Spirit (Mark 3:11). Two identified quotations were deliberately
left unattributed because the automated segmentation mixes them with
other content in one interval that can't be safely split with current
tooling: Mark 3:5's "Stretch out your hand" (mixed with trailing narration
describing the result), and Mark 3:32's crowd line (mixed with Mark 3:33's
Jesus reply in the same corrected interval). Mark 3:22's Beelzebul
accusation remains correctly unattributed -- confirmed narration/reported
speech in Hatam, not a vocalized line.

Full validation: 56 Vitest files / 314 tests pass (5 new speaker-
attribution unit tests, 1 new re-ingest regression test), typecheck and
web build pass. Verified live: all 12 segments now show the correct
`speaker_name` via the existing character join.

## "Man with Unclean Spirit" voice-mapped to ElevenLabs Torgrim (2026-09-18)

Dan chose the ElevenLabs voice "Torgrim - Explosive & Furious"
(`ELt1673DDdqHyrE7h2ua`) for this character -- looked up via the live
`/api/voices` ElevenLabs listing, description matches the role well (a
roaring, panicked, adrenaline-fueled voice). Written via the existing
`PATCH /api/characters/:id/voice` endpoint directly onto the approved v2
character_version row; per seed-characters.ts's own design, this is
intentionally NOT mirrored back into the manifest file (the manifest's
voice fields are only initial-seed values -- the live DB is authoritative
for real voice approvals, and resyncing from the manifest would silently
wipe this out on a future re-seed). Verified via the live API:
`voice_provider: "elevenlabs"`, `voice_id: "ELt1673DDdqHyrE7h2ua"`.

## "Man with Unclean Spirit" approved with reference art (2026-09-18)

Dan approved the candidate character created for Mark 3:11's speaker,
supplying real reference art: a headshot (chosen as v3 of three candidates)
and four body poses (neutral standing, anguished standing, recoiling
distress, collapsed distress) at
`HeartWordData/assets/characters/candidates/`. Copied into the canonical
`characters/man-with-unclean-spirit-mark-3/` location (matching the
existing `lip_sync_closeup`/`motion` convention every other character
uses), hashed, and wired into
`HeartWordData/assets/characters/import-manifest.json` with real
`content_hash` values -- same mechanism as every other character, still no
raw DB writes.

One wrinkle: `seed-characters.ts` deliberately does not resync an existing
version row's `status` (to protect real producer voice-casting approvals
from being silently overwritten on re-seed) -- so promoting the original v1
placeholder (candidate, no assets) required bumping to a new `v2` entry
rather than editing v1 in place, exactly the "generate a candidate revision,
promote once it passes review" pattern `canonical-characters.md` already
documents. v1 remains as history; v2 is now the sole `approved`
character_version, satisfying crew-context.ts's one-approved-version
invariant. Verified via the live API: `canon_status: 'approved'`,
`version_status: 'approved'`, all 5 assets attached to the v2 version.
Full validation: 55 Vitest files / 308 tests pass (one FFmpeg PCM-
equivalence flake reproduced then passed clean on rerun, per the known
issue already noted in this file), typecheck and web build unaffected (no
application code changed, only runtime character data).

No voice mapping yet, and nothing wired into `audio_segments.speaker_
character_id` -- both remain open, separate steps.

## Mark 3 speaker/narrator text analysis, and a new candidate character (2026-09-18)

Read Mark 3's Hatam text verse-by-verse against the English reference,
following the precedent already set for Mark 2's hand-authored
`mark-2-quote-decisions.ts` (close reading, not an algorithm): identified
every direct-speech passage by its Hatam quotation marks and quotative verb
(`pai`/`pai bak` = "said/said to", `buhup` = "answered", `hig` = "said to",
`yahara` = "cried out"), cross-checked against the English reference and,
for one uncertain case, the real Hatam-English lexicon at
`HeartWordData/assets/source/hatam/reference/hatam-dictionary/hatam-lexicon.json`.

Findings: verses 3, 4, 5, 14, 23-29, 33, and 34-35 are Jesus's own speech
(the v14 attribution -- his charge to the twelve to preach the Gospel,
rendered as direct speech in Hatam where English narrates it indirectly --
is corroborated by the lexicon: `-cuk`="send", `-tri tut`="preach",
`Nihyet Di Kei`="Gospel", matching the verse's wording closely). Verse 32 is
the crowd (matches your own already-recorded evidence for that verse).
Verse 11 (the unclean spirits' cry, "You are the Son of God!") had no
existing character to attribute it to. Verse 22 is a notable negative
finding: Hatam renders the scribes' Beelzebul accusation as reported/
indirect speech (no quotation marks), unlike English's direct quotation --
per the same "trust Hatam's own quote structure over English" principle
Mark 2's q13 already established, this should NOT be cast as a vocalized
line. Verse 17's "Boanerges" aside and verse 30's parenthetical are narrator
glosses, not character speech.

Dan decided verse 11's speaker will be a new character, "Man with Unclean
Spirit," chapter-3 scoped (not book-wide, since demon-possessed figures
elsewhere in Mark -- e.g. 1:23, chapter 5's Gerasene man -- are distinct
individuals). Added via the normal manifest + `npm run db:seed-characters`
path (`HeartWordData/assets/characters/import-manifest.json`), the same
mechanism every other character here was built through -- not a raw DB
insert. Recorded honestly as `canon_status: 'candidate'` with an empty
`assets` array: no reference art exists yet, and none was fabricated. This
character needs the normal Character Creation & Editing Tool pass (headshot,
body-pose images, producer approval) before it's usable for real casting or
lip-sync.

This text analysis is evidence only so far -- nothing has been wired into
`audio_segments.speaker_character_id` yet. Unlike Mark 2, Mark 3's modern
Gemini-based ingestion pipeline has no code path that applies quote
decisions to real segments (`mark-2-segments.ts` is hardcoded to Mark 2);
building that is separate, later work Dan hasn't yet authorized.

## Fixed a re-ingestion bug: corrections on boundary-overridden segments (2026-09-18)

Running Mark 3's ingestion stage after recording the Mark 3:32-33 correction
above threw "Cannot safely re-ingest: human correction ... has no exactly
equivalent replacement interval" instead of holding cleanly. Root cause: the
correction's target segment also had its own boundary override (its bounds
were corrected from 399645-413645 down to 399191-413645 during earlier
review). Re-ingestion regenerates fresh segments at their ORIGINAL automated
timings, but the correction-remap step in `index.ts` was matching against
the segment's CURRENT (already-corrected) bounds, which a freshly-generated
original-timing segment can never equal. This was a latent bug -- it never
surfaced before because no earlier correction happened to target a segment
that also carried its own boundary override.

Fixed by building an `originalBoundsBySegmentId` map from the existing
`source_alignment_boundary_overrides` rows and using each segment's original
(pre-override) bounds, not its live bounds, when matching corrections and
editorial classifications for remap -- consistent with how the boundary-
override remap step already worked correctly. No data was ever at risk: the
transaction's existing rollback-on-mismatch behavior held exactly as
designed, and nothing was deleted or corrupted while this was diagnosed.

Verified against Dan's real Mark 3 project: re-running ingestion now
completes (46 intervals retained) instead of throwing, correctly falls
through to the expected pre-existing coverage hold (93.6%, uncovered verses
10,18,21,23,29,32,33,34), and every piece of human-reviewed evidence
survived the re-ingest with correct remapped bounds -- both text
corrections, both title-card decisions, and the boundary-overridden
Mark 3:31-32/32-33 pair. Added a regression test
(`tests/pipeline/fresh-chapter.test.ts`) that reproduces the exact
combination (a correction targeting a boundary-overridden segment) and
confirmed it fails without the fix and passes with it. Full validation: 55
Vitest files and 308 tests pass, strict typecheck, and web build all pass.

## Mark 3's two spoken titles resolved as on-screen title cards (2026-09-18)

Dan decided film treatment for the two Mark 3 narrated titles that are
actually spoken (before v20/22, "Yesus kin Beelzebul", and before v31,
"Yesus nipmem kin nikinjoi bat nya"): both display as on-screen title cards,
not narrated in the film's audio track. This is now wired into the
pipeline, not just documented:

- `source_alignment_editorial_classifications` gained an additive
  `film_treatment` column (`title_card` | `omit` | `narrated`, nullable —
  NULL means undecided). Schema.sql covers fresh databases; `client.ts`'s
  `COLUMN_MIGRATIONS` covers Dan's existing production database.
- `recordSourceAlignmentEditorialClassification` and the
  `/source-alignment-editorial-classifications` endpoint accept an optional
  `filmTreatment`; the audio-segments API and `editorialAlignmentDisplay`
  surface the resolved status (e.g. "— resolved: on-screen title card")
  once recorded, same append-only latest-wins pattern as corrections.
- `crew-context.ts` now looks up a resolved treatment by matching a
  classification's `next_verse_ref` against a parsed title's `verseStart`,
  and gives the Story Writer/Shot Director a resolved producer note
  ("Human-resolved by Dan: display as an on-screen title card...") instead
  of the prior always-on "do not automatically display it... unless a
  human resolves an exception" default. An unresolved title keeps that
  original default wording unchanged.

Both Mark 3 holds now carry `film_treatment='title_card'` (recorded via the
running app, reviewer "Dan"), and the before-v20/22 title's classification
now also records `next_verse_ref='Mark 3:20'` (previously null) so the new
crew-context lookup can match it. Full validation: 55 Vitest files and 307
tests pass (2 new: a film-treatment display test and a crew-context
producer-note test), strict typecheck, and web build all pass.

## Mark 3 has five source paragraph titles, not two (2026-09-18)

The Hatam and English ESV Mark 3 source docx files both confirm five
paragraph titles, matching English section-heading placement: before v1
("A Man with a Withered Hand"), before v7 ("A Great Crowd Follows Jesus"),
before v13 ("The Twelve Apostles"), before v20/22 ("Blasphemy Against the
Holy Spirit" — already the recorded `Yesus kin Beelzebul` hold), and before
v31 (already the recorded `Yesus nipmem kin nikinjoi bat nya` hold). Only the
last two had recorded review evidence before this pass. The first three had
none, and the audio segments around them show no separate interval for
title material, so their spoken status was unconfirmed. The before-v7 title
also has no parenthesized cross-reference in the source text, unlike the
other four, which the existing editorial-classification schema does not yet
have a slot for (it requires non-empty cross-reference text).

Dan manually reviewed the audio at the before-v1 title's expected position
(2.99-18.62s, spanning the automated `mark 3:1-2` match) and confirmed the
narrator skips the title and its cross-reference entirely, starting directly
on verse 1. This is a different kind of finding than the two existing holds:
it is not spoken material awaiting a film-treatment decision, but a
confirmation that no title audio exists here at all. No correction or
classification record was created because none of the existing schemas
represent a "confirmed not spoken" finding, and the automated `mark 3:1-2`
match already accurately reflects the audio with nothing to carve out.

Dan also reviewed the before-v13 title's expected position (168.0-181.27s,
spanning the end of the automated `mark 3:12` match through the end of the
automated `mark 3:13` match) and confirmed the title and its reference
(Mat. 10:1-4; Luk. 6:12-16) are likewise not spoken there. Same conclusion:
no correction needed, the automated v13 match already reflects the audio.

Dan also reviewed the before-v7 title's expected position (88.0-106.80s,
spanning the end of the automated `mark 3:6` match through the end of the
automated `mark 3:7-8` match) and confirmed it too is not spoken. This
retires the open question of how to record a title with no cross-reference
text (the schema gap noted above) since there is no spoken material to
record for it.

All three previously unreviewed Mark 3 titles (before v1, v7, and v13) are
now confirmed by Dan's manual listening to be unspoken in this FCBH
recording. Only the two already-recorded titles (before v20/22 and before
v31) are actually voiced, and those remain the two producer-confirmed
editorial review holds described below, unchanged by this pass.

## Mark 3 original-reading alignment coverage complete (2026-09-18)

Every original-reading interval in Mark 3 now carries either a 100%-confidence
automated text match or a named human-reviewed record — no interval remains
at legacy/unresolved status. The last open gap, `399.191–413.645s`, was
closed by Dan's manual listening and recorded as a single append-only
correction (`Mark 3:32-33`) covering the full span: the Mark 3:32 quotation
(`Andigpoi e...bit Na`, 399.191–406s), the Mark 3:33 narration lead-in
(`Yesus buhup`, 406–408s), and the Mark 3:33 quotation (`Ningat ne
dipmem...ritou nya i?`, 408–413.645s). The correction's evidence field
preserves Dan's exact sub-boundary timestamps even though the interval
remains one recorded segment; the tooling does not yet support splitting one
automated interval into multiple reviewable rows, so finer per-clause
boundaries were not created.

The two producer-confirmed narrated editorial intervals below remain
deliberate review holds pending Dan's film-treatment decision; they are not
part of this coverage milestone and are not resolved by it.

## Mark 3 narrated editorial alignment review (2026-09-18)

Mark 3 now retains two producer-confirmed narrated editorial intervals as
append-only, artifact-bound classifications: `259.262–273.262s` is the
`Yesus kin Beelzebul` title with `Mat. 12:22-32; Luk. 11:14-23, 12:10`, and
`371.645–385.645s` is a mixed transition containing `Yesus nipmem kin
nikinjoi bat nya` with `Mat. 12:46-50; Luk. 8:19-21` before Mark 3:31.
Neither is silently treated as Scripture or safe-to-omit material. The
mixed span deliberately has no invented split boundary; its automated
Mark 3:29–31 span is retained as evidence while its film treatment remains
held for human review.

The source-alignment view surfaces this as human-reviewed title/reference
material, including the title, citations, next Scripture marker where known,
and retained automated span. Re-ingestion remaps these append-only records
only to an exactly equivalent original interval, just as verse corrections;
otherwise it fails safely rather than orphaning review evidence. A future
provider-authorized title-aware alignment may produce finer boundaries, but
these classifications must remain review evidence and do not authorize a
provider call, asset generation, boundary shift, or source-audio change.

## Chapter-scoped canon readiness (2026-09-17)

The character-canon browser is now collapsed by default only when a selected
chapter has a planned cast whose every needed character has both approved
canon status and an approved version. A read-only project readiness projection
uses planned shot-character links, not the global browser, so a fresh chapter
states that needs will be checked after storyboard planning rather than
claiming readiness. Any missing or unapproved needed character expands the
section and names the gap. This changes no character, approval, casting, or
production record.

## Chapter-preparation entry point (2026-09-17)

The active chapter workspace now exposes one producer-facing **Start ingestion
and chapter preparation** control. It calls the existing durable orchestrator,
prevents duplicate submissions, and shows every returned stage result and any
truthful review pause. It refreshes the selected chapter's persisted state
afterward; it does not bypass source attestation, durable holds, candidate
review, or provider boundaries. The Reusable Media Library remains intact but
is collapsed by default behind a disclosure control so it does not obscure the
normal chapter-start workflow.

## Source-catalog migration (2026-09-17)

The immutable HeartWordData corpus is now the normal source convention rather
than a per-chapter copied runtime folder.  Stage 1, source review, scene
breakdown, and the durable ingestion signature resolve Hatam chapter text,
the default FCBH Non-Drama master, and the matching English ESV text directly
from the catalog.  A `project_source_bindings` row records the selected
relative paths, edition, hashes, and catalog/legacy provenance; changing a
bound source file holds reuse rather than silently reusing dependent work.

The FCBH Drama edition remains a bounded catalog selection, while Non-Drama
is the default.  Generated media and Demucs stems are outside discovery.
Existing legacy Mark 2-style paths remain readable for compatibility.  The
catalog reports missing required inputs (including Genesis's absent FCBH
audio) without copying or modifying source files.  Focused catalog tests
cover fresh Mark 3 resolution, the default edition, missing-source handling,
no-copy behavior, and binding invalidation. Full validation: 47 Vitest files
and 284 tests, strict typecheck, and web build pass.

## Durable recovery hardening (2026-09-16)

Completed executions are now reused only when their stage outputs still exist:
source-review evidence, planned scenes/shots, accepted media/clip records, and
referenced files are checked. Signatures include the approved canon
assets/versions and approved speaking voice/binding identity; a signature
query error is surfaced rather than becoming a reusable cache key. An
exception after work begins is retained as `uncertain`, and only the current
lease owner may update project state.

`POST /api/projects/:id/adopt-recovered-pipeline` is a producer-named recovery
action for old/manual chapters. It records only locally validated persisted
outputs, does not call a provider, and cannot approve candidates. Ingestion
and scene breakdown now hold rather than delete producer source reviews,
utterance bindings, accepted clips, or human review records.

This is not a claim that a chapter can proceed without human source approval:
unresolved alignment evidence remains a truthful hold. The isolated real-media
fresh-chapter proof and evidence evaluation remain open verification work.

## Architecture overhaul in progress (2026-09-16)

The chapter runner now records durable stage executions with input and upstream
dependency hashes, attempts, worker tokens, outputs, and explicit recovery
holds. It reuses a valid completed stage, scopes reruns to changed inputs and
their downstream dependencies, and refuses to blindly retry a running or
uncertain execution. This remains a single-machine, single-producer workflow;
it does not add a queue or alter accepted takes, manual edits, source audio,
or provider billing records.

Stage 5 now calls the existing composite cast-master work and only submits
Kling lip-sync for planned on-camera dialogue with an accepted keyframe,
approved cast voice, and aligned cast-master speech. Narration is explicitly
excluded. Missing prerequisites create a producer-reviewable hold before any
new provider request. A completed provider response is now retained as a
costed `hold_for_review` candidate, never automatically marked accepted or
placed into a clip; a same-character/same-verse ambiguity is held until an
exact utterance interval is persisted. This implementation has not been run
against Mark 2 or Mark 4 and has made no paid call.

The executable crew dispatcher now derives its production roster from the
single role registry, while independent challengers remain explicitly outside
production-direction authority. The evaluation ledger now links immutable
human-adjudicated evidence to retained records, imports/exports versioned
predictions atomically, detects protected regressions and held-out training
leakage, and reports small factual samples as insufficient. The documented
CLI is `npm run evaluate:reviewed-evidence --`. It cannot deploy a model or
change anyone's authority. Remaining architecture work includes persisting a
per-shot utterance binding, complete non-speaking video generation through the
ordinary stage, and end-to-end isolated fresh-chapter resume testing.

## Production interaction monitor and correction reuse (2026-09-16)

The selected chapter's Production Crew panel now polls recorded production events and director negotiations, shows active/completed/held/error state, scoped verse/shot context, producer-input holds, and links each event to the existing expandable full structured role contribution. It is not presentation dialogue or hidden reasoning. Producer guidance remains durable; explicit reusable guidance can be stored as an active scoped lesson, while candidate/disabled/superseded states preserve history and prevent accidental broad reuse. Active lessons are supplied to future crew briefs only for the same project, matching book, or explicitly broad language/region/global scopes. This is inspectable application memory and adaptive guidance—not model training or a guarantee of automatic generalization.

Runtime boundary: multi-role crew contributions and logs are implemented; full named-role dispatch, generic voice/lip-sync stage wiring, and universal milestone challenger dispatch remain declared work. Human language, field, and release approval remain mandatory where required.

## Active status: Mark 2 timing integration (2026-09-11)

Implementation handoff: Dan prefers Sonnet 5 at Medium for the next coding
work to conserve usage. The bounded starting task and branch details
are in [MARK_2_AUDIO_IMPLEMENTATION_HANDOFF.md](MARK_2_AUDIO_IMPLEMENTATION_HANDOFF.md).

Dan agreed to connect the crew to the existing Mark 2 edit before a soundtrack
trial. Recovered 62 source-clip placements in the saved film, separately
exported the newer Blender edit, and compared all 24 aligned source intervals.
The observed timing and findings are now in the production edit history and
crew brief/UI. See [the timing audit](../production/hatam-mark-2/TIMING_AUDIT_2026-09-11.md).

The film cannot yet receive an approved completeness manifest: five narration
intervals totaling 120.891 seconds have no matches; the healing narration is
partial; the forgiveness line begins in the original voice before its dub;
and the crowd/Mark 2:19–22 audio requires source-version reconciliation.
The two apparently missing assemblies exist with accepted attempt records,
but their clip links are absent. The newer Blender edit differs from the
saved film, so its timing was not misapplied to that film.

The import now distinguishes observed incomplete timing from verified full
coverage. Observations enable specific crew review without allowing approval,
soundtrack generation or automatic finishing; file/source changes invalidate
them. Existing film and Blender hashes are unchanged. No paid calls were made.
All 206 tests plus three Python waveform tests pass; frontend build/typecheck
pass, and the 21 pre-existing server type errors remain unchanged.

Next production step: prepare a separate corrected cut using the newer edit,
restore/reconcile the complete audio before score generation, and explicitly
plan the extra picture coverage needed to fit narration without overlapping
dialogue. This audit preserves existing media rather than silently rebuilding
or claiming that timing metadata repairs the film.

## Active status: coordinated filmmaking roles (2026-09-11)

Dan authorized design and implementation of the Creative/Production Director
and filmmaking-role improvements, then clarified the music/audio behavior:
retain the FCBH performance and ElevenLabs character voices, allow breathing
room and opening context views, and have a Composer direct Google-generated
instrumental music. ElevenLabs supplies the initial sound-effects adapter.

Implemented on `codex/film-role-workflow`, incorporating the existing Critic
fix branch (including `23f3d05` and its subsequent fixes). See
[`docs/design/production-crew.md`](../design/production-crew.md) for role
ownership, shared context, budgets, review gates, provider choices and limits.

- Separate specialist calls share exact source/reference text, measured
  audio, approved canon, the chapter shot plan and scoped producer guidance.
  A Production Director resolves disagreements through a bounded revision
  pass; unresolved findings and malformed reviews cannot become approval.
- Existing storyboard reruns preserve shot IDs, accepted takes and history.
  Approved directions feed keyframe handoffs and directed new-shot generation;
  changed plans invalidate prepared handoffs. New gap ideas use exact shot and
  character identities and the normal Critic/attempt/clip path.
- Picture editing protects source duration/order while allowing deliberate
  introductory and reaction pauses. Cut review actually views/listens to an
  audiovisual proxy. Typed color and soundtrack plans create new renders.
- Composer and Sound Designer requests reserve paid attempts, retain
  provider usage and failures, independently review generated audio, and reuse
  completed requests. Revised mixes start from the clean base film.
- The producer panel shows the current cut, role exchanges, findings,
  timed cue requests, audio previews, generation history and saved guidance.
  It can recover a review whose worker has stopped and import timing from
  an existing hand edit.

Validation: all 202 tests pass, including deterministic providers, temporary SQLite/assets, real FFmpeg
audio/timing checks, an isolated browser fixture and a read-only snapshot of
the real Mark 2 data. No paid generation calls or production render changes
were made during implementation. The snapshot loads all 28 shots and 23
approved canon identities, resolves the saved group-spokesperson relationship,
and preserves three otherwise unassigned intervals of the original recording.
The frontend build and frontend typecheck pass. Full server typechecking still
reports the pre-existing script/QC/casting errors; no new implementation file
appears in that error set.

Production adoption limit: the current hand-edited Mark 2 film has no saved
source-to-production timing map, and only 26 of its planned shots currently
have accepted assembled clips in the database. Its supplementary footage
also lives in the manual editor/scripts. Review is available; automatic
finishing requires timing import, and its picture edit stays in that editor
until the supplementary footage is represented. This work does not claim a
new rendered chapter or completion of the older generic voice/lip-sync stub.
Full Critic evidence weighting and an approved/rejected image benchmark are
still the separate evaluation work deferred in the earlier review.

Goal Guardian acceptance: this extends existing stages and preserves Dan's
watch–correct–rerun workflow, approved canon and the complete source
performance. It introduces no new narrative, translation, provider-generated
speech or replacement editor. Current production state remains intact.

## Previous status: Codex keyframe handoff, Hatam Mark 2 (2026-09-08)

Dan asked Codex to take over keyframe generation, beginning with Scene 1,
Shot 1, and to retain production status/prompts for continued work. The
existing pipeline remains the product; video generation/provider changes
have not been requested as a concrete implementation yet.

Implemented an additive stage-4 handoff (`scripts/keyframes.ts`): immutable
prompt/source/canon briefs, original-pixel reference contact sheets for the
tool's five-image input limit, per-shot status from SQLite, and non-destructive
PNG import into existing generation attempts and review notes. References
are checked for approval, region and file integrity. Stale briefs are blocked.
Every new take gets its own filename and provenance JSON. Built-in-tool
model/billing information is explicitly unreported, not inferred.

Scene 1 Shots 1–7 now each have a Codex-generated review candidate, imported
non-destructively through the keyframe handoff. Dan accepted Shots 2–4; the
new producer-accept command records that decision and resolves only the
candidate's own pending review note. Their prompt, rationale and review files
live under `docs/production/hatam-mark-2/scene-01-shot-0*/`.
Shot 3 received a second generation after the first drifted to an unsuitable
lakeside panorama; only the corrected candidate is recorded for review. The
shared scene lighting default describes an interior/later roof opening,
conflicting with Shot 1's exterior/intact-roof instructions; that shot's prompt
resolves the conflict without rewriting the scene or chapter plan.

Current production status: all 28 planned Hatam Mark 2 keyframes have an accepted latest Codex attempt. The producer approved the remaining Scene 1 and Scene 3 candidates on 2026-09-08, with explicit overrides recorded for Critic concerns where needed. The external handoff now requires `keyframes.ts critique <attempt-id>` before a candidate is presented: it runs the grounded Critic, scene fidelity, and canon-reference likeness checks while retaining producer control over acceptance.
See `docs/production/CODEX_HANDOFF.md` for the repeatable workflow and existing
integration limits. Prior uncommitted Claude work is preserved. All 100 tests
pass (90 existing + 10 new); the live shots API returns the new candidate.
Full typechecking currently reports pre-existing errors in
QC/casting/provider and scratch/character scripts.

The sections below are historical implementation notes. In particular, the
project DB row still says ingestion/not_started and the old "Next up" section
predates subsequent QC wiring; neither is a reliable per-shot production status.

## Historical status: vision and design complete; scoping the architecture request (2026-09-04)

`docs/PRODUCT_VISION.md` reflects the mature vision recovered from BVET (the
second of two prior attempts at this project), refined across this whole
design pass: branding (HeartWord AI/Studio/Films/Illustrated, logo, trimmed
tagline), a first-class Character Creation & Editing Tool, Gemini Omni
1.1 Flash-style Draft Room cost-tiered generation, the full Illustrated
Scripture strategy recovered from prior Mark/Acts comic work, enriched
canonical-character rules, language/book/chapter navigation with undo/redo,
a two-level book/chapter storyboard model with multi-agent role-based shot
planning, producer notifications (including a WhatsApp self-message
channel), export/delivery tiers grounded in the real distribution path
(Android phones, YouTube, WhatsApp fan-out through village leaders,
Bluetooth/USB-C), a field review gate before that distribution (Ryan and a
native-Hatam-speaker review team), and an FCBH-rights gate on public
YouTube publication independent of that.

Design docs completed, per `docs/ARCHITECTURE.md`'s "Design principles":

- **Provider abstraction** — every media provider sits behind one interface;
  see `docs/design/media-generation.md`'s Draft Room design, now with a
  concrete review-outcome set (accept / retry / retry-modified / escalate
  provider / hold for human).
- **Automated media review** — an evolving, learned rubric (not a fixed
  checklist), seeded with concrete dimensions (canonical likeness, extra/
  malformed characters, mouth-sync, unwanted text, continuity); see
  `docs/design/automated-quality-control.md`.
- **Illustrated Scripture strategy** — recovered in full from a prior
  attempt's Mark/Acts comic work; see `docs/design/illustrated-scripture.md`.
  Included in the architecture but stays lower priority than HeartWord Films.
- **Canonical Characters** — recognition hierarchy, naming/identity safety,
  and a non-destructive candidate-review workflow; see
  `docs/design/canonical-characters.md`.
- **Character Creation & Editing Tool** — the tool's own workflow (starting
  a character, gap detection during shot planning, evolving an existing
  character, voice mapping and live test); see
  `docs/design/character-tool.md`.
- **Timeline and project identity** — language/book/chapter as the project
  key, typed-command edit history with undo/redo; see
  `docs/design/timeline.md`.
- **Shot planning as multi-agent collaboration** — book/chapter storyboards,
  a manual "Create Storyboard" trigger, role agents that interact (not just
  independently propose) with the interaction logged; see
  `docs/design/shot-planning.md`.
- **Producer notifications** — trigger events, channel options (email,
  Pushover/ntfy.sh, Twilio, native app/PWA, WhatsApp self-message), a
  cheap-first phased approach; see `docs/design/notifications.md`.
- **Working conventions for AI coding agents** — `AGENTS.md` now includes a
  "never infer requirements from code, ask Dan on ambiguity" rule and a
  Goal Guardian check (verify implementation against the vision/goal/
  workflow docs, not just tests), aimed directly at the 100-ticket failure
  mode from the prior attempt.

## v1 Scope (confirmed 2026-09-04)

The smallest slice that proves the whole loop end-to-end on one real
chapter, rather than architecting the full vision at once:

**In scope for v1:** one chapter, Hatam Mark 2 (the chapter with the
existing pilot to compare against), taken through all seven core pipeline
stages — ingestion/alignment, scene breakdown, casting & direction, media
generation, voice & lip-sync, assembly, and QC — to a reviewable rendered
cut in the editor. One provider per media type (no cross-provider
escalation yet). Casting & direction as a single planning pass rather than
the full multi-agent role negotiation. The Character Tool, built just far
enough to create and approve the handful of characters Mark 2 actually
needs. QC limited to the structural checks (sync drift, coverage, lip-sync
confidence) rather than the full evolving media-review rubric. A basic
running cost total rather than the full live/pending/reconciled ledger.

**Deliberately deferred, but the architecture should leave room for:** the
Draft Room's cost-tiered draft/escalate loop, the multi-agent shot-planning
negotiation and its log, the full evolving media-review rubric with
retry/escalate decision states, the complete cost-governance ledger,
producer notifications, book-level (vs. chapter-only) storyboards, and the
Illustrated Scripture lane entirely.

## Architecture (confirmed 2026-09-04)

`docs/ARCHITECTURE.md` now has the v1 architecture: a local web app
(React/TypeScript frontend, Node/TypeScript backend, both on Dan's
machine), TypeScript throughout rather than splitting with Python, SQLite
for structured data with generated media on the filesystem, a v1 directory
layout, a data model covering the core entities, queue-free stage
orchestration, and a provider interface whose result states already match
the QC review-outcome vocabulary. Runtime data (the SQLite file and
generated assets) lives at `C:\Users\danbr\HeartWordData\`, outside the
OneDrive-synced repo, configurable via `HEARTWORD_DATA_DIR`.

## Providers and schema (confirmed 2026-09-04)

v1 providers are locked in: Google Nano Banana / Nano Banana Pro (images),
Google Veo 3.1 Lite 720p/1080p (video), and Google Gemini Omni 1.1 (360p
draft tier, start/end-keyframe-guided generation, targeted region image
editing) — all one Gemini adapter under `GEMINI_API_KEY`; Kling.ai's Avatar
API (lip-sync) under `KLING_API_KEY_1`. See `docs/ARCHITECTURE.md`'s
Provider interface section and `.env.example`. Voice/TTS is still open.

The v1 SQLite schema is written: `src/db/schema.sql` (projects, characters/
character_versions/character_assets, scenes/shots/shot_characters,
generation_attempts, clips, audio_segments/tracks, edit_commands,
cost_ledger_entries, review_notes). It deliberately mirrors BVET-Data's own
`identityId`/`scope`/region conventions so imported characters carry their
provenance rather than being re-modeled from scratch.

## Mark 2 assets imported (confirmed 2026-09-04)

Dan confirmed the import plan. Copied into `HeartWordData/assets/`
(sha256-verified against the source manifests after copy):

- `source/hatam/mark-2/` — the Hatam Mark 2 text and FCBH audio, from
  `BVET-Data/assets/`.
- `characters/jesus/` and `characters/matthew/` — full production packages
  (lip-sync close-up + 4 body/pose views), `approved` status, from
  `OpenAI-Code Comics/assets/characters/Video Character Library/Regional
  Canon/Papuan/`.
- `characters/mark-2-{friend-1-rust,friend-2-olive,friend-3-slate,
  friend-4-brown,paralytic,principal-scribe,crowd-witnesses}/` — one
  producer-approved turnaround sheet each, same source repo.
- `characters/import-manifest.json` — provenance for every file above
  (legacy identity id, canon status, sha256, source path), field-shaped to
  match `characters`/`character_versions`/`character_assets` in
  `src/db/schema.sql` so a future seed script can load it directly instead
  of re-deriving it.

**Voice mapping is scoped to speaking characters only** (see
`docs/design/character-tool.md`): Jesus and Matthew clearly need it. The
paralytic, the four friends, and the crowd witnesses probably don't — Mark
2 gives them no quoted lines — but the manifest flags the principal scribe
as a maybe, since the Pharisees'/scribes' spoken objections elsewhere in
the chapter (2:16, 2:24) may get attributed to him once shot planning
happens. Don't assume "no line" until the scene breakdown confirms it.

`OpenAI-Code Comics/claude-pilot/` (the folder Dan remembered as
"/claude-pilot") holds the earlier pilot's production scripts (per-scene
Veo generation, Kling lip-sync client, a 7-scene/50-segment rough-cut
concat list) — kept as implementation reference for the media-generation
and assembly stages, not imported as assets (the rough cut's own segment
files are no longer present there).

## v1 walking skeleton built (2026-09-04)

A real, tested foundation is running, not just scaffolding — see
`src/README.md` for the exact layout and what's real vs. stubbed:

- The v1 SQLite schema applies cleanly via Node's built-in `node:sqlite`
  (switched from `better-sqlite3` — its native-module install hung
  repeatedly in this dev environment; see `docs/ARCHITECTURE.md`'s
  "Implementation notes" for this and two other environment-specific
  fixes needed to get SQLite writing reliably to `HeartWordData`).
- `npm run db:seed-characters` loads the Mark 2 import manifest into the
  database — verified idempotent (a second run inserts nothing) and
  correct (9 characters, 9 versions, 18 assets, matching what was
  imported).
- The Express API (project create/list/run, character list) and the React
  frontend both work end to end against that database — verified with a
  full request-cycle smoke test (create a project, run its pipeline, see
  it correctly stop at the first stub stage with a reasoning message,
  confirm characters list), not just a typecheck.
- Every pipeline stage (`src/pipeline/*/index.ts`) and provider adapter
  method (`src/providers/{gemini,kling}/index.ts`) is wired into the
  orchestrator and the type system but not yet implemented — each returns
  or throws a clearly labeled "not yet implemented" result.

**Resolved (2026-09-05):** Dan granted delete permission for
`HeartWordData` specifically, closing the one remaining SQLite risk on
this mount (see `docs/ARCHITECTURE.md`'s "Implementation notes") — an
uncleanly-interrupted write outside the app's own `getDb()` path can now
self-heal instead of needing manual recovery.

**Ingestion & alignment implemented for real (2026-09-05):** stage 1
(`src/pipeline/ingestion/`) now parses the source docx into 13 verse-group
paragraphs, detects silence in the FCBH audio via ffmpeg, and picks
verse-group boundaries from the longest gaps — run against the real
imported Hatam Mark 2 assets and verified by inspecting the resulting
`audio_segments`/`review_notes` rows directly. This is honestly
low-confidence, by design: there's no ASR or forced-alignment model for
Hatam, so every boundary is capped below PRODUCT_VISION.md's 80-point
auto-decide threshold and flagged for a language specialist to confirm —
see "Ingestion & alignment (v1)" in `docs/ARCHITECTURE.md` for the full
approach and its known limitations (paragraph-, not verse-level timing; no
reviewer UI yet to act on the flag; heuristic tuned to this specific
docx/audio pair).

## Audio corroboration deepened, real vocal separation added (2026-09-05)

Went well beyond the "ingestion & alignment implemented for real" milestone
above, still within stage 1, driven by Dan's own listening and a request to
pursue real source separation:

- **version-2** (`mark-2-drama.ts`): re-scored the same 13 quote/speaker
  decisions against FCBH's actual multi-cast "Drama" edition instead of the
  single-reader Non-Drama edition, adding a real (if weak) acoustic signal —
  does a candidate quotation's audio sound like a different voice than the
  narrator, and does that difference disappear again right after (the
  "bracket" pattern only a true multi-voice recording could produce).
- Diagnosed and fixed two real bugs in that acoustic check along the way
  (narrator-pitch noise floor, and diluted signal in long estimate windows)
  and separately confirmed the drama edition's background music was
  distorting silence detection (fixed with a recording-specific noise-floor
  tune) but not the coarse pitch numbers.
- **version-3** (`mark-2-drama-v3.ts`): once Dan obtained real Demucs
  (htdemucs) pretrained weights through his own Hugging Face login — see
  `scripts/quote-alignment/separate_audio.py` and `docs/ARCHITECTURE.md`'s
  "Real vocal isolation achieved" section — re-ran the same check against a
  genuinely separated vocals track. Confirmed a real confound (a periodic
  instrument note in the underscore had been confusing the pitch estimator
  at some speaker transitions) and, more importantly, surfaced a much
  cleaner finding: 6 of 7 Jesus utterances now show a consistently
  lower-pitched voice than the narrator baseline — real corroborating
  evidence this recording uses a distinct voice actor for Jesus.
- **`music-dynamics-mark-2.ts`**: a bonus deliverable from having a clean
  instrumental stem — reads the drama edition's own music loudness contour
  (swells/recedes) as a reference for whoever eventually scores this
  chapter's video. A first attempt (before real separation) was mostly
  noise and wasn't delivered; the real-separation version finds 10 events
  that plausibly track real story beats.
- All three reports live in `HEARTWORD_DATA_DIR/exports/` as
  `clips-alignment-Mark-2-version-{1,2,3}.txt` and `music-dynamics-Mark-2.txt`.
  **The underlying open item is unchanged**: none of this has been
  confirmed by a human who actually understands Hatam or this recording —
  see "Next up" below, still the same gate as before, just with a
  stronger v3 report to review against.

## Stage 1 (ingestion) completed for real for Mark 2 (2026-09-05)

Closed the gap the "Next up" list below used to describe: the quote-
alignment R&D work (version-1/2/3 reports) is now wired into the real,
database-backed `runIngestion` for Hatam Mark 2 specifically, not just
sitting in text reports. `audio_segments` now has real
`speaker_character_id` values, real per-segment confidence scores, and a
`review_notes` row per segment needing a language specialist's
confirmation (20 of 21) -- verified against the real imported project,
not synthetic data. See `docs/ARCHITECTURE.md`'s "Stage 1 completed for
Mark 2" section for the full writeup, including a real overlap bug this
surfaced and fixed (q3/q4's independent timing estimates conflicted by
~8.7s) that the report-only version never caught. This is still
Mark-2-specific by design (see that section) -- a future chapter needs
either its own hand-authored decisions or a general algorithm, neither of
which exists yet.

Reviewer UI is still the one piece of "Next up" below that's genuinely
unchanged: the 20 flagged segments are real database rows now, not text
report lines, but there's still no UI for a human to act on them --
querying `review_notes` directly is still how you'd see them today.

## Stage 2 (scene breakdown) completed for real for Mark 2 (2026-09-05)

`runSceneBreakdown` is no longer a stub. It groups stage 1's real
`audio_segments` into scenes using the source .docx's own published
pericope headings (a new `parseSourceHeadings()`) as scene boundaries —
following the translation's already-published structure rather than
inventing a narrative breakdown, per NON_GOALS.md. Unlike stage 1, this
stage is chapter-agnostic by design, not Mark-2-specific — it just needs
a source .docx with published section headings, which is a translation
publishing convention, not something particular to Mark 2.

Verified against the real Mark 2 project: 4 scenes (Mark 2:1-12, 2:13-17,
2:18-22, 2:23-28) matching the four standard synoptic pericope divisions,
correctly grouping all 21 real audio segments with correct per-scene
speaker attribution, and 3 boundary-straddling narration segments (one at
each pericope seam) correctly flagged in `review_notes` for human
confirmation rather than silently misassigned. Idempotent, fully tested
(9 new tests), typecheck clean. See `docs/ARCHITECTURE.md`'s "Stage 2
(scene breakdown) implemented for real" section for the full writeup.

## Timbre-based speaker corroboration tried, negative result (2026-09-05)

Dan asked whether a real voice-timbre check could replace/supplement the
pitch-only acoustic corroboration (which admittedly can't tell apart two
same-range voices). Prototyped it with Resemblyzer, a pretrained speaker-
embedding model that runs fully offline. Result: no clean separation,
either comparing whole segments by attributed speaker or comparing short
windows straddling known-real boundaries against same-speaker controls --
the numbers overlap too much to trust. Not wiring this into production
scoring. See `docs/ARCHITECTURE.md`'s "Speaker-embedding (timbre)
corroboration tried, negative result" section for the full numbers and
reasoning, and `scripts/quote-alignment/timbre_probe.py` for the kept
prototype. Manual ear-review (the review queue) stays the mechanism for
v1; a diarization-purpose-built model (e.g. pyannote) would be the more
promising thing to try if this gets revisited later.

## Jesus canon assets corrected: legacy v1 files were live in production (2026-09-05)

Cross-checked HeartWord's `character_assets` rows for Jesus against the
OpenAI-Code Comics character library's own `PROVENANCE.md` (sha256 hash
comparison) after Dan pointed to the real source folders. Found the
`headshot` (feeds Kling's Avatar API) and the neutral-standing `body_pose`
were both stale legacy v1 files -- v1's close-up was originally
cross-region-contaminated from "Horn of Africa" canon -- while active,
producer-approved v2 versions existed and were readily available. Fixed:
copied the v2 files into HeartWordData, updated the two DB rows, backfilled
`imported_from` on all six of Jesus's asset rows (previously NULL
everywhere -- a real provenance gap), and republished the Mark 2 Canon
Board artifact with the corrected headshot. See ARCHITECTURE.md for the
full writeup. Not yet checked: whether the same v1/v2 mismatch exists for
other characters.

## Voice-casting UI added (2026-09-05)

Built a real "Voice casting" section in the web app (not a mockup):
`GET /api/voices` (`src/server/routes/voices.ts` + `src/server/providers/
elevenlabs.ts`) calls ElevenLabs' `GET /v2/voices` and returns every voice
on Dan's account; the UI lists each character with a filterable dropdown
(text filter, since ElevenLabs has no native "voice group" API object --
Dan's "BVET" set is whatever he's organized in his own account/labels, so
this can't query it directly) plus an audio preview and an Approve
button. Approving calls `PATCH /api/characters/:id/voice`, which writes
`voice_provider`/`voice_id` onto that character's current
`character_versions` row -- the same columns seeded NULL for all 9
characters. Jesus's dropdown pre-selects "Brian" by name match (Dan's
already-decided voice) so approving him is one click.

Not yet done: the actual re-voicing (speech-to-speech) call once a voice
is approved -- this UI only covers audition/selection/approval, per the
VoiceProvider interface split in ARCHITECTURE.md. Also untested against
the live ElevenLabs API in this environment (both the cloud sandbox and
the device shell used for this session have no network path to
api.elevenlabs.io -- blocked by egress policy on both), so it hasn't been
run against real data yet; it should work once Dan runs the server
locally with `ELEVENLABS_API_KEY` set in `.env`, where his machine's
normal internet access applies.

## Voice casting complete for Mark 2's three speaking characters (2026-09-06)

Dan used the new Voice casting UI to pick and approve ElevenLabs voices
for all three characters who actually speak in Mark 2 (per the
spoken_segment_count check added the same day): Jesus, the Principal
scribe, and the Crowd. All three now have voice_provider='elevenlabs'
and a real voice_id in character_versions -- verified directly against
the database. The four Friend characters, the healed paralytic, and
Matthew/Levi correctly have no voice mapped, since none of them have any
attributed lines in this chapter.

Next real blocker for stage 5 (voice & lip-sync) is building the actual
re-voicing call (ElevenLabs speech-to-speech on stage 1's
original_reading segments) -- the casting UI only covers audition/
selection/approval, not generation yet.

## Composite cast master generation built (2026-09-06)

Built the audio half of stage 5 (voice & lip-sync) as its own standalone
piece -- src/pipeline/voicing/index.ts -- rather than folding it into
src/pipeline/voice-lipsync/index.ts, since the lip-sync half of that
stage still needs a scene keyframe from stage 4 (media generation),
which doesn't exist yet. Triggered via `POST /api/projects/:id/voicing`
and a "Generate composite cast master" button in the web app (Composite
cast master section, below Voice casting):

- Narration segments carry through from the original reading unchanged
  (re-encoded into their own clip file via ffmpeg for a consistent
  one-file-per-segment layout).
- A segment whose speaker has an approved ElevenLabs voice gets
  re-voiced via speech-to-speech (src/server/providers/elevenlabs.ts's
  reVoiceAudio) -- the real Hatam performance clip in, that voice out.
  Uses eleven_multilingual_sts_v2 since the source audio is Hatam.
- A segment whose speaker has no approved voice yet is carried through
  unvoiced and flagged in review_notes, rather than blocking the run.
- Costs real ElevenLabs credits per re-voiced segment, so any segment
  whose output file already exists is reused rather than regenerated.
- New GET /api/projects/:id/audio-segments?layer=... lists a layer's
  segments; /media now serves HeartWordData/assets statically so the web
  app can play the resulting clips directly.

Not tested end-to-end yet -- this session's shells have no network path
to api.elevenlabs.io (same restriction hit during the voice-casting
work), and node_modules being Windows-targeted now (correctly, for Dan's
machine) means this session can't even start the dev server to check the
ffmpeg/DB wiring live. Verified separately: TypeScript compiles clean,
and the exact ffmpeg extraction command was smoke-tested directly against
the real vocals.mp3 (produced a correct ~7.5s clip). The real first run
needs to happen on Dan's machine.

## Casting & direction (stage 3) built (2026-09-06)

Implemented src/pipeline/casting/index.ts: for each of Mark 2's 4 scenes,
one Gemini call (gemini-2.5-flash, via the new src/server/providers/
gemini.ts) grounded in the chapter's real English reference text
(assets/reference/english/mark-2/mark-2-text.docx -- an LLM can't read
Hatam directly, and NON_GOALS.md rules out inventing narrative content,
so the English reference is the actual source of truth handed to the
model, not the Hatam source or a free-form request). The prompt also
tells Gemini which characters stage 1 already confirmed as speaking in
that scene, and the full approved canon character list with their notes,
and asks for a shot-by-shot breakdown -- action plus which canon
characters are visible -- as schema-constrained JSON
(responseSchema/responseMimeType). Writes to `shots`, `shot_characters`,
and `scenes.reasoning`. Idempotent (clears this project's shots before
regenerating). A character name Gemini returns that doesn't exactly
match the canon list is dropped from that shot and flagged in
review_notes rather than silently kept -- catching a hallucinated name
is exactly the kind of thing AGENTS.md's stage-reasoning-logging
convention is for.

Wired up via POST /api/projects/:id/casting and GET /api/projects/:id/
shots, plus a "Casting & direction" section in the web app (above Voice
casting, matching pipeline order) with a generate button and a per-scene
list of planned shots.

Verified as far as this session's tools allow: TypeScript compiles
clean, and running the module directly (`node --import tsx`, after
adding the platform's esbuild/rollup optional packages locally so tsx's
transform would even load) confirmed every step up through prompt
construction -- project/scene/character loading, the verse-range overlap
match between scenes and stage 1's speaker attribution, pulling the
correct English verses per scene -- works correctly, then fails cleanly
at the actual Gemini network call (blocked from this session, same as
the ElevenLabs and prior Gemini-adjacent restrictions) with no partial
DB writes (transaction rolled back). The real first run needs to happen
on Dan's machine.

Dan also added OPENAI_API_KEY to .env (2026-09-06) as an available
alternative -- not yet used anywhere; stage 3 still calls Gemini per
PRODUCT_VISION.md's existing provider preference. Worth asking Dan
whether he wants OpenAI used instead/as well before building anything
else against it.

## Fixed: docx parsing depended on the `unzip` CLI, missing on Windows (2026-09-06)

Dan's first live run of the new casting UI failed immediately with
`spawnSync unzip ENOENT`. Root cause: parse-source-text.ts's
readDocumentXml shelled out to the `unzip` command-line tool to read a
.docx's word/document.xml, on the assumption it's "a preinstalled system
tool" -- true on Linux, where every prior test of stages 1-3 happened to
run (this session's device bridge), but not true on native Windows,
where Dan actually runs the app. This was a latent, pre-existing bug in
ingestion and scene breakdown too, not something new to casting --
casting was just the first stage whose first real run happened to be on
Dan's own machine after `unzip`-independent testing had masked it
everywhere else.

Fixed by replacing the `unzip` shell-out with a small dependency-free ZIP
reader (src/pipeline/ingestion/simple-zip.ts) that reads the End-Of-
Central-Directory record and Central Directory entries directly and
inflates the target entry with node:zlib -- no external tool, no new npm
dependency (keeping the same "avoid native-module install risk" goal the
`unzip` approach was originally chasing), works identically on every
platform. Verified byte-for-byte identical output against the real
`unzip` CLI on both the Hatam and English reference docx files, and
re-ran the full test suite (19/19 still passing) plus a direct run of
the casting module, which now gets all the way through docx parsing and
fails only at the (expected, from this session) Gemini network call.

## Fixed: gemini-2.5-flash retired, switched to gemini-3.6-flash (2026-09-06)

Dan's first real "Generate shot plan" click got a 404 from Gemini:
"This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.6-flash." Swapped
GEMINI_TEXT_MODEL in src/server/providers/gemini.ts accordingly --
generateContent's request/response shape (including responseSchema/
responseMimeType) is unaffected, just the model string. Not yet
confirmed this actually produces a good shot plan -- that's the next
thing to check once Dan re-runs it.

## Camera language added to stage 3 (casting & direction) (2026-09-06)

Closed a real gap Dan flagged: stage 2's own docstring already scoped
"staging, camera, or action content" as stage 3's job, but the first build
of stage 3 only delivered action + which-characters, not the cinematography
half. Extended `shots` and `scenes` (new columns, additive migration in
`src/db/client.ts` so Dan's existing Mark 2 data upgrades in place -- verified
against the real database, integrity check clean, existing rows intact) and
`src/pipeline/casting/index.ts`:

- Every shot now gets a `verse_ref`, a `framing` (wide/medium_wide/medium/
  medium_close/close_up/insert), and a `camera_movement` (static/push_in/
  pull_out/pan_left/pan_right/tracking/handheld_follow) from the same Gemini
  planning call, validated against the known enum (falls back to medium/
  static and flags it in review_notes rather than writing an unrecognized
  value).
- Each scene now gets one `lighting_continuity` note (time of day, light
  source, interior/exterior) meant to be threaded into every shot's stage-4
  generation prompt so a scene's shots share one lighting decision instead
  of each reinventing it and drifting.
- Lip-sync forces framing: a shot can only be flagged `needs_lip_sync` with
  a named `dialogue_character_id` if its framing is medium_close/close_up/
  insert -- Kling's Avatar API needs a clear view of the mouth. Gemini's own
  answer isn't trusted blindly here; `src/pipeline/casting/coverage.ts`'s
  `validateFraming` tightens a too-wide framing and flags the correction,
  the same distrust-and-flag pattern already used for hallucinated character
  names.
- Coverage detection for long dialogue: a lip-synced shot's REAL dialogue
  duration is computed from stage 1's actual measured `audio_segments`
  timing (not a guess), and `coverage.ts`'s `planCoverage` flags anything
  longer than Veo 3.1's ~8s single-clip ceiling as needing a `covered_sequence`
  rather than one long lip-synced take -- concretely, a wide master (no
  lip-sync) plus tight lip-synced inserts on the emphasis lines plus
  cutaways to listeners, all under one continuous dialogue audio segment
  (an L-cut). This stage only detects and records that need
  (`shots.coverage_plan`/`coverage_notes`); building the actual multi-clip
  sequence is stage 4/5's job once media generation exists -- `clips` is
  already a separate table from `shots` for exactly this reason.

New pure-logic module `src/pipeline/casting/coverage.ts` (11 new tests,
same separation-from-DB-glue pattern as `scene-breakdown/build-scenes.ts`).
Full suite still green (30/30), typecheck clean. Not yet run against a real
Gemini call with the new prompt fields (same network restriction as every
other Gemini-adjacent change this session) -- Dan's next "Generate shot
plan" click on Mark 2 will be the first real run and will re-populate the
existing shots (casting is idempotent) with the new camera fields.

## Character canon expanded to the other eleven disciples (2026-09-06)

Dan asked to expand the canon beyond Jesus/Matthew. The OpenAI-Code Comics
video character library already had a full production-ready package for
every one of the Twelve under precisely disambiguated names (matching
canonical-characters.md's naming-safety rules, e.g. "Philip the Apostle" vs.
"Philip the Evangelist", "James son of Zebedee" vs. "James son of Alphaeus")
-- this was an import task, not a from-scratch creation task, same shape as
the original Jesus/Matthew import.

Imported all 11 remaining disciples as `scope_kind = 'global'` canon
characters (so they're automatically available to Mark 2's casting stage
today, and to every future chapter, without any code change --
`src/pipeline/casting/index.ts`'s canon-character query already includes
every global-scope character): Peter, Andrew, James son of Zebedee, John
son of Zebedee, Philip the Apostle, Bartholomew, Thomas, James son of
Alphaeus, Thaddaeus (Jude), Simon the Zealot, and Judas Iscariot. Each got
the same headshot + 4 motion-pose package as Jesus/Matthew, copied into
`HeartWordData/assets/characters/<slug>/` and sha256-verified against each
character's own `PROVENANCE.md` after copy (not just trusted). 55 new
character_assets rows total (5 each), verified idempotent (a second
`db:seed-characters` run inserted nothing), integrity check clean.

Two real provenance findings surfaced while doing this, both handled rather
than silently papered over:

- **Peter has an explicit, documented v1->v2 promotion** (headshot +
  neutral-standing, exactly like Jesus's case) -- imported the v2 files,
  correctly this time, verified against PROVENANCE.md's stated hash.
- **John son of Zebedee has an *undocumented* v2 candidate set** sitting on
  disk (headshot + all 4 motion poses) that PROVENANCE.md never mentions or
  records as approved -- unlike Peter's case, there's no recorded promotion
  decision for it (see canonical-characters.md's non-destructive-evolution
  rule: a promotion must be a recorded decision). Imported v1 for John,
  matching what's actually documented as approved, and left the orphaned v2
  set as an open question for Dan rather than guessing which one he meant --
  worth a look next time he's touching the character library.

Also fixed a latent bug the last Jesus correction (2026-09-05) left behind:
that fix updated the live database directly but never touched
`import-manifest.json`, which still listed the old v1 paths/hashes under a
version_label that already said 'v2' -- a future `npm run db:seed-characters`
re-run would have matched by path, found no existing row for the (still-v1)
manifest path, and silently re-inserted the stale legacy asset alongside the
corrected one. Manifest now matches the live DB.

One open consideration, not yet acted on: casting's canon-character list for
a project now includes all 20 characters (9 original + 11 new), not just
the ones relevant to that chapter's text. Mark 2 doesn't name any of these
eleven, so they shouldn't appear in its shot plans, but it's worth watching
whether a future casting run ever attributes one of them to an unnamed
"his disciples" reference the text doesn't actually specify by name --
NON_GOALS.md already scopes this correctly, but a larger canon list is a
larger surface for that particular mistake.

Not yet done: voice mapping for any of the eleven (correctly -- per
character-tool.md, voice mapping is only raised as a gap when a specific
chapter's shot plan actually gives a character a line; none of these eleven
speak in Mark 2). Notes on each character record which ones are expected to
need a voice eventually, based on a review of individually-attributed lines
in the Gospels/Acts -- flagged in each character's `notes` field as a
first-pass read, not a verified text search, the same caveat given to Dan
directly when this research was first done.

## Character canon hierarchy formalized: Global/Book scope, Groups, spokesperson (2026-09-06)

Dan asked for two corrections after the disciple import: (1) follow the
Global/Book character hierarchy already established in OpenAI-Code Comics'
own library structure (`Global Character Library` vs. per-book libraries
like `Mark Character Library`), and represent groups (a crowd, the
Pharisees and scribes) as 4+ distinct individual designs that get cloned to
fill out a crowd, with exactly one spokesperson and other members limited
to non-verbal utterances; (2) redo the disciple voice-need research to
check for ANY speaking role (not just solo lines) before ruling one out.

**Schema**: new `character_groups` table (itself Global/Book/Chapter-scoped,
mirroring `characters`) plus `characters.group_id` and
`characters.is_spokesperson`, with a partial unique index enforcing at most
one spokesperson per group at the database level -- verified by attempting
to violate it directly (rejected: `UNIQUE constraint failed:
characters.group_id`). Both new indexes had to be created in `client.ts`
after the column migration runs, not in schema.sql's static text -- on
Dan's already-existing database, `CREATE INDEX ... ON characters(group_id)`
failed outright before the column existed (a real ordering bug caught by
actually running it, not just reading the diff).

**`seed-characters.ts` upsert semantics reconsidered**: identity/canon
fields (name, scope, canon_status, region) and group membership are now
resynced from the manifest on every run, and so is `notes` -- but
`character_versions.status`/`voice_provider`/`voice_id` are still
insert-only, since the live voice-casting UI writes real ElevenLabs values
there that a manifest resync would otherwise silently overwrite. This
closes the exact class of bug found earlier today (a direct DB fix that
never made it back into the manifest) without reopening a worse one.

**Reclassified two Mark 2 "representative" characters** that actually stand
in for recurring, book-wide groups rather than one-chapter figures:
Principal scribe -> book-scoped (Mark, not just chapter 2), spokesperson of
a new "Mark Pharisees and Scribes" group (they object again at 2:16, 2:24,
3:6, 7:1-13...); the crowd turnaround sheet -> book-scoped, spokesperson of
a new "Mark Crowd Witnesses" group. Also linked the four already-distinct
Mark 2 friend characters into a proper "Mark 2 Friends of the Paralytic"
group (chapter-scoped, correctly at 4/4 members, no spokesperson since none
of them speak) -- they were already exactly the "4+ distinct designs"
pattern Dan described, just not yet linked as a group.

Both scribes/crowd groups are honestly flagged as incomplete: each has only
1 of its required 4+ distinct member designs today (the crowd's one asset
is itself a flattened multi-person sheet, not even a true individual
design) -- a Character Tool gap for Dan to fill later, not fabricated here.

**`casting/index.ts` made group-aware**: the canon character list Gemini
sees now tags each group member as either "spokesperson... the only member
who can carry dialogue" or "not its spokesperson... may appear and react
but never carry dialogue," and a resolved `dialogueCharacterName` that
turns out to be a non-spokesperson group member is corrected to
`needsLipSync = false` and flagged, the same distrust-and-flag pattern as
an unresolved character name. Not an active bug for Mark 2 today (both
groups currently have only their spokesperson as a member), but real once
the Character Tool gap above gets filled.

**Docs**: `docs/design/canonical-characters.md` gained "Global vs. Book
Scope" and "Character Groups" sections documenting all of this; a matching
note in `character-tool.md`'s Voice Mapping section points at the new
`is_spokesperson` field. Full suite still green (30/30), typecheck clean,
DB integrity clean, second seed run confirmed idempotent (0/0/0/0 groups).

**Disciple voice research redone properly** (Dan's second ask: check ANY
speaking role, not just solo lines) -- verified against secondary sources
via live web search rather than recalled from training, and corrected two
real mistakes from the first pass:
- **James son of Zebedee**: previously written off as "likely doesn't need
  a voice" because he never speaks solo. Corrected -- he DOES have a
  speaking role, always jointly with John (Mark 10:35-37, Luke 9:54, both
  "James and John" asking something together). A joint line still needs
  his voice. Now marked as needing voice mapping.
- **Matthew (Levi)**: the original manifest note claimed he "speaks in Mark
  2:14-17," which is simply wrong -- that exchange is between Jesus and
  the Pharisees/scribes; Matthew has no individually attributed line
  anywhere in the NT. Corrected the note (the system's actual behavior was
  already right -- no voice was ever assigned to him -- only the
  documentation was misleading).
- **James son of Alphaeus** and **Simon the Zealot** confirmed (now with
  sources, not just recall) to have zero recorded words anywhere in the
  NT -- correctly still flagged as not needing voice mapping.
- Andrew, John son of Zebedee, Philip the Apostle, Bartholomew/Nathanael,
  Thomas, Thaddaeus/Jude, and Judas Iscariot all reconfirmed with specific
  verse citations, notes tightened accordingly.
All corrected notes are live in the database (character_versions.notes),
not just this file -- verified by direct query after the seed run.

## Mark Pharisees and Scribes group completed at 4 members (2026-09-06)

Closed the gap flagged when the character-group hierarchy was formalized
earlier the same day: the "Mark Pharisees and Scribes" `character_groups`
row had only 1 of its required 4+ distinct member designs (the Principal
scribe). Generated 4 new candidate designs with Nano Banana
(`gemini-2.5-flash-image`) via a new one-off script,
`scripts/character-tool/generate-scribe-candidates.ts` -- the first real
image-generation call against `GEMINI_API_KEY` in this codebase (previously
only `src/server/providers/gemini.ts`'s text/JSON planning call existed).
Not folded into `src/providers/gemini/index.ts`'s `GeminiImageProvider`,
since that interface is shaped around rendering a scene shot against
already-canon `CharacterRef`s (see `src/providers/types.ts`'s
`ShotRequest`) -- generating a brand-new character's reference art is a
Character Tool operation, not a shot-generation one, and doesn't fit that
interface as-is.

Took several corrective passes based on Dan's direct review, each a real
design-quality catch, not nitpicking:

- **First draft gave each candidate its own robe color.** Dan redirected:
  all members should share the Principal scribe's black, with *plainer
  construction* (single-layer, no shoulder overlayer, no fringe) signaling
  lower rank instead -- a more legible "antagonist group with one senior
  figure" read in a crowd shot. Recognition between individual members now
  rests on face/beard/build/posture (the recognition hierarchy's own
  strongest cues) plus one accessory each, not color.
- **Three of four candidates initially had no head covering at all**, an
  inconsistency within one group Dan caught immediately.
- **The added head coverings first rendered as South Asian-style wound
  turbans** (rounded turban ball, spiral-wrapped layers) -- wrong region
  and culture for a first-century Levantine/Judean setting. Also initially
  varied in color (charcoal/grey/brown/off-white) across the four, which
  read as "many colored" rather than copying the Principal scribe's own
  headscarf construction as Dan asked. Fixed by locking the prompt to the
  Principal scribe's actual construction (a single cloth draped over the
  crown and shoulders, not wound) and giving all four the same plain dark
  grey fabric (his stripe pattern stays reserved for him).
- **That fix then produced a rigid flat-board/mortarboard artifact** on
  two of the four (worst on the elder/staff candidate, needing 4 regenerate
  attempts total before an explicit "no rigid brim/mortarboard, must drape
  like cloth" instruction reliably fixed it).

Dan approved 3 of the 4 final candidates -- younger/lean, older/stout, and
middle-aged/tablet-bearer. Promoted these into real canon: copied each PNG
into its own `characters/<slug>/turnaround/` folder (sha256-computed, not
assumed), added matching entries to `import-manifest.json` (same
field-shape `seed-characters.ts` already reads), and ran
`npm run db:seed-characters` -- 3 new characters/versions/assets, correctly
0 new groups (reused the existing "Mark Pharisees and Scribes" row).
Verified idempotent (a second run inserted nothing). `character_groups.notes`
updated directly in the database to reflect the group is now complete at 4
members -- `seed-characters.ts` deliberately never resyncs notes for an
already-existing group, so this needed a direct write, same pattern as
earlier corrections in this file. Full test suite still green (30/30),
typecheck clean -- no application code changed, only manifest data and a
new one-off script.

The 4th candidate (elder, tall/thin, walking staff) was generated and fixed
(no more rigid-brim artifact), but Dan decided to leave it out -- the group
stays at its 4 approved members, not 5. Left unpromoted at
`HeartWordData/assets/characters/candidates/mark-pharisees-scribes/
candidate-4-elder-tall-thin.png` rather than deleted, in case it's wanted
later.

## Mark Crowd Witnesses group split into 8 individual characters (2026-09-06)

The other group flagged incomplete alongside the scribes -- and a bigger
gap than that one, per its own notes: its single existing asset
(`characters/mark-2-crowd-witnesses/turnaround/
hatam-crowd-anchors-video-canon-v1.png`) was a flattened sheet of 8
headshots plus 2 group compositions, modeled as ONE character row ("Eight
recurring witnesses + adolescent, Mark 2 (crowd)") rather than 4+ distinct
individual canon characters. Dan also flagged that sheet as stylized/
comic-leaning rather than matching this canon's photorealistic style.

Per Dan's direction, split it apart one figure at a time (extended
`scripts/character-tool/generate-crowd-candidates.ts`, same Nano Banana
approach and candidate-review-before-promotion workflow as the scribes) --
regenerating each of the sheet's 8 people as a standalone realistic
photographic portrait, keeping the same identity cues (headscarf color,
age, build) the original sheet established rather than inventing new
people. All 8 passed review without needing a corrective regenerate pass
(unlike the scribes' head-covering saga) -- the earlier fixes (photographic
realism instruction, Levantine-not-turban head-covering construction, no
rigid-brim artifact) carried over cleanly from that work. Candidate 8 (the
woman with her son) kept both figures in one shot, matching how the
original sheet paired them -- the boy isn't split into his own character
record.

All 8 promoted into real canon: `characters/mark-crowd-<slug>/turnaround/`
folders, matching `import-manifest.json` entries, `npm run
db:seed-characters` (8 new characters/versions/assets, correctly 0 new
groups), idempotent on a second run, full suite still green (30/30),
typecheck clean.

Two structural decisions Dan made once all 8 were reviewed:

- **Spokesperson**: the stern man (`mark-crowd-stern-man`) is now this
  group's spokesperson, not the old composite. His real ElevenLabs voice
  mapping (`voice_id` `TX3LPaxmHKxFdv7VOQHJ`) was transferred from the
  retired composite row rather than re-auditioned -- Dan had already
  approved that voice for this group's spokesperson role during the
  voice-casting work (2026-09-06 earlier entry), and losing it would have
  meant re-picking a voice for no real reason.
- **Old composite retired, not deleted**: `canon_status` set to `rejected`
  and its version `status` to `superseded` -- both in the database AND in
  `import-manifest.json` (identity fields and group membership resync from
  the manifest every seed run, so leaving the manifest saying "approved"
  would have silently undone the retirement on the next
  `db:seed-characters`, the exact class of drift bug caught earlier this
  week with Jesus's asset correction). Its asset file stays on disk as a
  historical reference; the row itself no longer counts as an active group
  member.

Caught and fixed one process slip while doing this: after generating and
copying the first 4 candidates' image files, an earlier response in this
session (mistakenly) reported them as "promoted into real canon" when only
the asset files existed on disk -- no manifest entries or database rows had
actually been created yet. Corrected as part of this same batch (all 8
manifest entries added and seeded together) rather than left inconsistent.

## Stage 4 (media generation) implemented for real, run for all 24 Mark 2 shots (2026-09-06)

Implemented `ImageProvider.generate()` for real in
`src/providers/gemini/index.ts` (previously a stub) -- the same Nano Banana
/ Nano Banana Pro models confirmed against the live Gemini API model list
while building the character-canon candidates earlier today
(`gemini-2.5-flash-image` / `gemini-3-pro-image`). Each call now loads a
representative reference image (headshot, else turnaround, else body-pose)
per visible canon character straight from `character_assets` and attaches
it as an input image alongside the text prompt, so a shot's generated
likeness is grounded in the actual approved canon asset rather than a text
description alone.

Built `src/pipeline/media-generation/index.ts` (stage 4) around that:
for every shot with no existing accepted keyframe on disk, builds a prompt
from the scene's `lighting_continuity`, the shot's `action`/`framing`/
`camera_movement`, and its cast list, then calls the provider with
tier="pro" (Nano Banana Pro) for any `needs_lip_sync` shot and "standard"
otherwise -- a weak keyframe on a lip-synced shot costs a wasted downstream
Kling call, not just a weak still, so the extra cost there is worth it.
Records a `generation_attempts` row and a matching `cost_ledger_entries`
row per call (the first real use of the cost ledger in this codebase --
even `voicing.ts`'s real ElevenLabs calls don't write to it yet, a gap
worth fixing separately). Per-shot try/catch, not one big transaction --
a single Gemini failure shouldn't discard 23 other real, already-paid-for
results; a failure is flagged in `review_notes` and the run continues.
Wired to `POST /api/projects/:id/media-generation` and a new "Media
generation" section in the web app with a keyframe thumbnail under each
shot in the casting list.

**v1 scope is keyframes only, not video** -- deliberately. A `clips` row
means timeline-placed video with a real duration; a still image isn't that
yet. `VideoProvider.generateFinal()` (non-lip-sync shots) and
`LipSyncProvider.sync()` (lip-sync shots, consuming this stage's keyframe
as its `referenceFrame`) are both still separate follow-ups.

**Run for real against the actual Mark 2 project**: all 24 shots, zero
failures, ~$3.56 total (11 standard-tier + 13 pro-tier, since more than
half the shots carry dialogue). Spot-checked several results directly --
genuinely strong photographic likeness, including secondary canon
characters (the Principal scribe's cameo in a wide establishing shot
correctly kept his black robe/grey headscarf design). The per-call cost
figures themselves are rough public-pricing estimates, not reconciled
against a real invoice yet -- flagged in code as needing a real number once
Dan has billing data to calibrate against, same honesty standard as
everywhere else costs are estimated in this codebase.

**Visual style confirmed (2026-09-06, Dan)**: `docs/ARCHITECTURE.md` and
`docs/design/media-generation.md` both described the target visual style as
"Pixar-style 3D" -- flagged above as inconsistent with every approved
character-canon asset (all photorealistic) and unsupported by
PRODUCT_VISION.md itself. Dan confirmed "Pixar-style 3D" was an early,
since-rejected direction, not the real target -- photorealistic (what
stage 4 already generates, and what the whole character canon already is)
is correct. Both docs corrected to remove the stale reference.

Full test suite still green (30/30), typecheck clean.

## Jesus likeness drift flagged in generated keyframes (2026-09-06, Dan)

Dan asked for a direct check on whether Jesus was drifting toward a more
generic/Mediterranean look in stage 4's generated keyframes rather than
holding his specific canon likeness. Checked directly against the canon
headshot: confirmed real -- most visible in the seashore wide shot, where
Jesus's face reads noticeably softer/more generic than his canon reference
(less pronounced Melanesian nose/brow/jaw structure, slightly lighter skin
tone) while the disciples standing right next to him in the *same image*
kept much stronger, correctly Melanesian/Papuan features. Likely cause:
`loadCharacterReferenceImages` in `src/providers/gemini/index.ts` attaches
only one reference image per character -- not enough to lock a specific
face under Gemini's own generative pull toward a more generic prior,
especially at a wider angle. Not yet fixed -- logged here so it isn't lost;
candidate fix is attaching a second reference image per character
(headshot + a body-pose image) and tightening the prompt's likeness-lock
language, then regenerating the affected keyframes.

## VideoProvider.generateFinal() and LipSyncProvider.sync() implemented for real (2026-09-06)

Both remaining stage-4/5 provider methods are now real, not stubs --
requested by Dan the same day the "Pixar-style 3D" references above were
removed (both docs corrected to drop it, confirmed rejected).

**`GeminiVideoProvider.generateFinal()`** (Veo 3.1 Lite,
`src/providers/gemini/index.ts`): confirmed `veo-3.1-lite-generate-preview`
against the live Gemini model list (matching PRODUCT_VISION.md's provider
decision exactly, not the plain or "-fast-" Veo variants also listed).
Follows the exact request/poll/download shape already proven in the prior
pilot's `claude-pilot/gen_veo.py` (`predictLongRunning` + poll, downloading
via `x-goog-api-key` header when the result comes back as a `uri` rather
than inline bytes) -- reused a working pattern instead of guessing at one.
Looks up the shot's own stage-4 keyframe from `generation_attempts` as
Veo's required start image, since `ShotRequest` has no image field of its
own. **Verified end-to-end for real** against an actual Mark 2 shot (the
wide establishing shot, 85d7b634...): produced a real 8-second, ~2.1MB
video, sent to Dan directly for review.

**`KlingLipSyncProvider.sync()`** (Kling.ai's Avatar API,
`src/providers/kling/index.ts`): the real endpoint and field names were
NOT reliably discoverable from Kling's own docs (the doc site is JS-
rendered and unfetchable; third-party mirrors disagreed with each other,
several describing only the unrelated video-to-video `/v1/videos/lip-sync`
endpoint, which requires an existing Kling-generated video, not a static
image). Confirmed the real endpoint and schema empirically instead --
submitting real minimal requests against Dan's real account and reading
back its own validation error messages, the same technique used to
confirm Nano Banana's model names. Real, confirmed shape: `POST
/v1/videos/avatar/image2video` on `api-singapore.klingai.com`, fields
`image` and `sound_file` (both accept a base64 data URI), returning a
`task_id` polled via `GET /v1/videos/avatar/image2video/{task_id}`.

One real interface correction this surfaced: ARCHITECTURE.md's
`LipSyncProvider` sketch had drifted from the real `src/providers/types.ts`
interface -- the doc's code block showed a 4th `headshot` parameter
alongside `referenceFrame` that was never actually in the compiled
interface (only 3 params: `character`, `audio`, `referenceFrame`). The real
Kling endpoint also only takes one `image` field, so there's nowhere to
send a second reference image even if the interface had one. Fixed
ARCHITECTURE.md to match the real interface and real endpoint rather than
the stale aspiration.

**Verification status differs between the two**: Veo's implementation is
fully confirmed end-to-end (a real result file, played back). Kling's
submit and poll code paths are confirmed correct -- submission returned a
real `task_id`, and the exact response schema for a *completed* task
(`task_result.videos[0].url`) was confirmed by reading real prior
successful tasks already on Dan's account (from earlier voice-testing
work, dated late August) via the task-list endpoint discovered along the
way (`GET /v1/videos/avatar/image2video?pageNum=&pageSize=`) -- but the one
test task submitted while building this (task_id 925633323790761989,
Jesus's headshot + a 3-second test tone) was still stuck at `"submitted"`
after 15+ minutes, well past the ~3.5-4 minute completion time every one
of Dan's prior successful tasks actually took. Worth checking Dan's own
Kling dashboard for that task, or just retrying -- may be trial-tier queue
contention rather than a real bug, but flagged rather than assumed.

Both providers' per-call cost figures (`$1.60`/Veo clip, `$0.50`/Kling
avatar task) are rough placeholder estimates, not reconciled against real
billing -- same honesty caveat as the Nano Banana constants.

**Not yet done**: wiring either provider into an actual pipeline stage.
Stage 5's video half (`src/pipeline/voice-lipsync/index.ts`, still a stub)
needs to call `KlingLipSyncProvider.sync()` for the 13 lip-sync shots;
turning the 11 non-lip-sync shots' keyframes into real `clips` rows needs
a new step calling `GeminiVideoProvider.generateFinal()`. Deliberately not
run as a real batch yet -- 11 Veo + 13 Kling calls at ~4 minutes and real
dollars each is a meaningfully bigger spend than stage 4's keyframe batch
was, worth Dan's explicit go-ahead first, especially with the Jesus
likeness-drift issue above still unfixed (better to fix that before
spending on video built from a keyframe that might get regenerated
anyway).

## Canonical-likeness check built and run for real; Jesus's drift fixed (2026-09-06)

Closed the Jesus likeness-drift issue flagged above, and built the
reusable automated check Dan asked for so this doesn't need a human eye
every time. See `src/pipeline/qc/canonical-likeness.ts` and
`likeness-verdict.ts` (pure decision logic, split out after a plain vitest
import of the combined file failed to load -- pulled in `db/client.ts`'s
`node:sqlite` transitively; same reasoning as `coverage.ts`). 11 new tests
in `canonical-likeness.test.ts`, full suite green (52 total).

**The fix**: `loadCharacterReferenceImages` in `src/providers/gemini/
index.ts` now attaches up to two reference images per character (a
headshot/turnaround plus a distinct body-pose image, when both exist)
instead of one, and each character's reference images are now preceded by
an explicit "this is the EXACT face... do not redesign, genericize, or
drift" instruction rather than being handed to the model anonymously.

**The check**: `checkCanonicalLikeness` sends a character's canon
reference and a generated keyframe to Gemini vision, asking it to judge
identity match only (not composition/lighting) on a 0-100 scale;
`runCanonicalLikenessAudit` runs this across every shot/character pair in
a project, flags failures in `review_notes`, invalidates the underlying
`generation_attempts` row (status `retry_modified`, an existing
`GenerationResult` state that exactly fits) so stage 4's normal
reuse-if-exists logic regenerates it, and can optionally re-check
afterward to confirm the fix actually worked rather than assuming it did.
This is one concrete dimension of the "evolving, learned rubric"
`docs/design/automated-quality-control.md` describes and v1 otherwise
defers in full -- built as its own standalone module rather than wired
into stage 7 (still a stub) for the same reason `voicing.ts` runs
standalone: Dan asked for this specific check directly.

**Run for real, three rounds**: first audit found 11 failing shot/
character pairs across 7 shots (the check isn't Jesus-specific -- it
covers every named character) -- including both of Jesus's flagged shots.
Regenerated all 7; a second audit found the same Jesus shot from the
"stuck" wide shot now passing, but surfaced a *new* Jesus failure in a
busy 9-person table scene (visually confirmed real, not noise -- his face
had drifted again in that regeneration). One more regenerate-and-recheck
cycle on that shot fixed it. **Final state: Jesus passes on every shot he
appears in.** Also surfaced (real but explicitly left out of scope for
this fix, since Dan's ask was specifically about Jesus): Peter and
"Friend 1 (older, rust)" still fail severely (scores 5-20) in wide/crowd
shots -- notes consistently say the reference's distinct older, grey-
haired look simply isn't showing up. Unlike Jesus, Peter has a full
multi-image reference package, so this isn't the same "only one reference
image" cause -- looks like a harder, separate problem where Nano Banana
loses a specific older individual's identity in a busy composition. Not
yet investigated further; a real one-run-to-the-next non-determinism was
also observed (an unchanged, previously-passing image scored differently
on a later run) -- single-run verdicts aren't fully reliable at the
borderline (50-68) range, only for clear failures (<30) or clear passes.

## Keyframe review UI added (2026-09-06)

Dan asked how to actually look at the generated keyframes and record
accept/comment decisions. Rather than a one-off tool, extended the
existing web app (the natural long-term home for this, since it's already
where casting/media-generation/voice-casting all live):

- `GET /api/projects/:id/shots` now also returns each shot's latest human
  review note and whether it's resolved.
- `POST /api/projects/:id/shots/:shotId/review` (`{ decision: 'approved' |
  'flagged', comment? }`) writes a `review_notes` row (source `'human'`,
  reusing the same table QC's automated checks already write to, just a
  different source) -- 'approved' is resolved immediately, 'flagged'
  requires a comment and stays unresolved for follow-up.
  Not wired to any pipeline action yet -- approving doesn't do anything
  special, flagging doesn't auto-regenerate; it's a durable, visible
  record for now, not a workflow trigger.
- The "Casting & direction" section's keyframe thumbnails got Approve/Flag
  controls plus a comment box, and a click-to-zoom overlay (click a
  thumbnail for a full-size view, click anywhere to close) since the
  360px inline thumbnails are too small to actually judge a face against.

Verified for real against the running dev server (attached to Dan's own
already-running `npm run dev` on :5173 rather than starting a second one) --
the Browser tool's screenshot capture didn't render pixels for this
externally-attached tab (a tool-side quirk, not an app bug: confirmed via
direct DOM/JS inspection that images loaded with real pixel dimensions and
computed styles were normal), so verification was DOM-driven rather than
visual: clicked a real Approve and a real Flag-with-comment through the
live UI, confirmed both landed as real `review_notes` rows in the
database with the right resolved/unresolved state, confirmed the zoom
overlay opens with the correct image and closes on click, then deleted
the two test rows so they don't pollute Dan's real review data. Full
suite still green (41/41), typecheck clean.

## Story fidelity gaps found and fixed: crowd density, continuity, and a real casting/setting bug (2026-09-06)

Dan reviewed the regenerated keyframes and caught three real, separate
failures in one pass -- exactly the kind of review this project's Goal
Guardian principle exists for:

1. **Mark 2:1-2 says "no room, not even at the door"; the room rendered as
   a modestly-sized gathering.** Nothing told stage 4 HOW crowded
   "crowded" meant.
2. **Shot 1 already showed the roof opening**, even though the friends
   don't cut it open until later in the scene -- a continuity break with
   no mechanism to catch it.
3. **The scene 2 seashore shot dressed everyone in Melanesian/Pacific
   Islander tribal clothing** -- woven grass skirts, bare chests as
   everyday dress, shell/bone arm bands, bare feet -- instead of
   first-century Judean dress.

(3) traced to a real bug in `src/pipeline/media-generation/index.ts`'s own
prompt, not a missing design decision: `docs/PRODUCT_VISION.md`'s "Visual
World and Character Direction" section already states this exactly --
"Hatam/Papuan faces while the physical setting remains first-century
Jerusalem and Galilee... the clothing, trees, and buildings do not need to
be transplanted to modern Papua." The prompt's own style anchor said
"first-century Hatam/Papuan (Melanesian Arfak highland) *setting*",
conflating Papuan CASTING (faces) with the SETTING, and the model read
that license correctly, just not as intended.

**Fixes, addressing both of Dan's questions ("how can casting & direction
identify this" and "how can it be caught in future")**:

- Rewrote the style anchor (`CASTING_AND_SETTING_ANCHOR` in
  media-generation/index.ts) to separate the two explicitly, with a hard
  ban list (no grass/woven skirts, no bare-chest-as-dress, no shell/bone/
  wood jewelry, no face/body paint, no tropical island scenery).
- **Stage 3 (casting) now plans two new fields per shot**: `crowdDensity`
  ('empty'|'sparse'|'moderate'|'packed', schema.sql + coverage.ts's new
  `CrowdDensity` type) grounded in what the verse text actually says, and
  `continuityNotes` (free text) -- the prompt now explicitly asks Gemini
  to read its OWN full shot sequence for a scene before answering, so an
  object introduced in a later shot doesn't already appear earlier and
  vice versa. Verified this actually works on the real data: Gemini
  correctly tracked the roof across 5 shots on its own ("Roof... unopened"
  -> "before making an opening" -> "roof now has a visible open hole" ->
  "beneath the freshly opened roof").
- Stage 4 turns both into explicit generation instructions
  (`CROWD_DENSITY_INSTRUCTIONS`, an "IMPORTANT continuity constraint"
  line).
- **New automated check, `src/pipeline/qc/scene-fidelity.ts`** (+
  `fidelity-verdict.ts` pure logic, 13 tests) -- parallel to
  canonical-likeness.ts but checks everything likeness doesn't: setting/
  costume fidelity to first-century Judea (explicitly NOT penalizing
  Papuan casting, only wrong-culture clothing/props), crowd density match,
  and continuity-constraint violations. Same invalidate-and-optionally-
  regenerate audit loop. On its first real run it also caught something
  neither Dan nor this fix explicitly targeted: Levi not actually standing
  up in a shot whose action said he does -- the check generalizes to
  action-fidelity too, not just the three specific bugs that prompted it.

**A real destructive bug surfaced and fixed along the way**: re-running
casting to get the new fields on the existing Mark 2 project hit
`FOREIGN KEY constraint failed` -- casting's idempotent "delete and
replan shots" logic predates stage 4 existing, and never accounted for
`generation_attempts`/`cost_ledger_entries`/`clips`/`review_notes` now
referencing those shot ids. Fixed with an explicit cascading delete
(`src/pipeline/casting/index.ts`), and the stage's own return now says
plainly when this happens: re-running casting on a project with existing
generated media discards those records (files stay on disk, orphaned,
not deleted) and needs stage 4 re-run afterward. This is real, working-as-
designed behavior now, not silently swallowed.

**Run for real, full loop**: re-ran casting (24 shots -> 26, Gemini split
two beats more granularly once given continuity awareness), regenerated
all 26 keyframes, ran the new scene-fidelity audit (4 failures found,
regenerated, re-checked down to 2 remaining: Levi still seated in one
shot, a doorway partially blocked in another), and re-ran
canonical-likeness for comparison. Setting/costume fidelity is now
consistently ~95/100 across the board (vs. the original tribal-clothing
failure) and **24/26 shots pass the full scene-fidelity check** on this
larger, more heavily-populated regenerated batch. Sent Dan the corrected
crowd/roof/clothing shots directly.

**One real, still-open tension this surfaced**: canonical-likeness's pass
rate dropped to 63/89 (71%) on this batch -- including Jesus failing again
in 2 of the busier shots. The regenerated shots are more heavily
populated (per the crowd-density fix) and busier crowd/wide shots are
fundamentally harder for both the image model to keep every named face
distinct AND for the vision-judge to verify at a distance -- many
failures explicitly say "too small/distant to verify" rather than
describing an actual wrong face. This isn't the same bug the two-image
reference fix solved; it may need a different approach (fewer named
background characters in a single wide shot, or accepting lower likeness
precision specifically where a viewer couldn't resolve individual faces
anyway) -- not yet decided.

Full test suite green (56/56), typecheck clean.

## Second review pass: continuity/costume fixes, disciple timeline, aspect ratio, Critic/Director QC (2026-09-06)

A second real review pass by Dan against the (now landscape-corrected, see
below) keyframes caught several more real, specific issues, each fixed and
regenerated for real rather than just logged:

- **Duplicate Jesus, caught by clothing not just face**: Dan flagged a
  shot with two figures sharing Jesus's exact locked robe combination and
  hair length, one with his face turned away -- my own visual check had
  wrongly dismissed the second figure as "similar clothing, different
  person." Fixed `canonical-likeness.ts`'s `instanceCount` dimension (added
  earlier this session) to explicitly judge duplicates by BOTH face AND
  the character's locked canon clothing/hair markers, since clothing is
  often the clearer signal when a face is turned away or distant -- a
  locked color-block is a deliberate identity marker for this production,
  not incidental styling. Verified against the real image via a direct
  script run: `instanceCount: 1` on the corrected version.
- **A second, separate duplicate/swap failure mode**: a different shot had
  Jesus's face on a figure wearing the WRONG robe color, while another
  disciple wore his correct blue-over-cream -- a clothing/identity SWAP,
  not a duplication. Fixed via an explicit shot-level continuity-notes
  lock ("Jesus wears ONLY his own locked canon robe... no other person may
  wear that combination") rather than a code change, since this is
  shot-specific content, not a systemic prompt bug.
- **Capernaum roof height and construction**: Dan asked me to double-check
  his own estimate that a first-century Capernaum roof was under 10 feet.
  Confirmed with real historical fact (archaeological excavations,
  Loffreda/Corbo's House of Peter work): flat roofs, ~6-7 feet at the
  eaves, built of wood beams + branches/reed matting + packed mud/clay --
  not the tall peaked/thatched structure generated. Fixed via the scene's
  `lighting_continuity` field (architecture is scene-wide, not per-shot).
  The Critic agent (see below) later found this fix was still incomplete
  in one real, well-cited way: the load-bearing rafters themselves can't
  be removed without collapsing the roof, so an opening must show
  rafters still spanning it, not a clean skylight-like hole -- not yet
  applied back to the shot.
- **Paralytic sitting up**: Mark 2's paralytic is being lowered on his mat
  and cannot sit up under his own power -- he was shown upright, hands
  bracing the mat. Fixed via shot-level continuity notes ("must NOT be
  shown upright, leaning, or using his arms"). The Critic also flagged the
  mat itself should read as a soft rollable pallet (Greek *krabattos*),
  not a rigid framed bed, per Mark 2:4's actual word choice -- not yet
  applied.
- **Tax booth shown as an open dining table**: fixed across all three
  shots depicting it via continuity notes describing a real first-century
  roadside customs booth (a small stall with a raised counter, money box,
  ledger, coin scale) -- visibly correct on regeneration, screenshots sent
  to Dan.
- **"Remove 'dusty', brighter/clearer" (Scene 1)**: the scene's shared
  `lighting_continuity` literally said "dusty" -- removed, lighting
  language strengthened ("clean, well-lit, no haze").

**Disciple-timeline gate built** (`src/pipeline/casting/disciple-timeline.ts`
+ 13 tests) after Dan asked: "once Matthew joins the disciples he should
be present in scenes where the disciples are mentioned... how can this be
done and remembered?" `characters.joined_narrative_at` now records each
disciple's real calling verse (Peter/Andrew: Mark 1:16; James/John son of
Zebedee: Mark 1:19; Matthew: Mark 2:14; the remaining seven: Mark 3:13,
where Mark's own text first names the full Twelve as a group -- not
individually earlier). `casting/index.ts` filters the canon-character list
offered to Gemini per scene against this automatically -- "remembered" by
being a database fact every future casting run reads, not a per-run
prompt instruction. One real bug caught before it shipped: filtering
against the scene's START verse wrongly excluded Matthew from his own
calling scene (Mark 2:13-17), since his calling verse (14) is inside that
scene, not before it -- fixed to filter against the scene's END verse
instead, letting Gemini's own text-grounded shot planning place him in
the right shots within the scene. Verified for real: scene 2 (Levi's
calling through the dinner) now correctly includes James, John, Andrew,
and Peter throughout, and Matthew from his calling shot onward.

**Aspect ratio bug found and fixed**: Dan noticed most keyframes were
portrait. Real gap: `GeminiVideoProvider.generateFinal()` already
hardcoded 16:9 for Veo (inherited from the prior pilot's own default,
never actually confirmed for this project), but `GeminiImageProvider.
generate()` (Nano Banana) requested no aspect ratio at all and was
defaulting to mostly-portrait -- a live mismatch between keyframes and
the landscape video they feed into. Dan confirmed 16:9 landscape via
`AskUserQuestion`; documented in `PRODUCT_VISION.md`'s "Visual World and
Character Direction" section (previously undocumented anywhere) and fixed
via `generationConfig.imageConfig.aspectRatio` -- confirmed real and
respected by testing directly against the live API before wiring it in.
All 28 real shots regenerated in correct landscape.

**Critic + Director QC agents built** at Dan's request: "Whenever an image
or video clip is generated it should be reviewed by a critic agent...
uses research on the context of scripture from the internet... The
director agent weighs the input... reported to the producer and logged."
`src/pipeline/qc/critic.ts` runs a REAL web-search-grounded Gemini call
(confirmed working via `tools: [{google_search: {}}]`, empirically tested
before use, same discipline as everywhere else provider behavior was
confirmed this session) against a shot's own action/continuity text,
producing cited findings plus a self-reported severity.
`director-verdict.ts` (pure, 9 tests) weighs that against the two existing
automated checks (canonical-likeness, scene-fidelity) into one of the
same five `GenerationStatus` values `src/providers/types.ts` already
defined (accepted/retry_same/retry_modified/escalate/hold_for_review) --
this is the first code to actually choose between all five, not just
"accepted". `director.ts` wires it together, writes a full report to
`review_notes` (source 'qc') -- the "reported to the producer, logged for
future reference" mechanism, since real push-notification channels stay
the already-known-deferred v1 item (`docs/design/notifications.md`) -- and
writes the decision directly onto `generation_attempts.status`.

**Verified for real, not just built**: ran `runShotReview` against the
real roof/paralytic shot. Genuinely found NEW issues beyond what Dan or I
had caught by eye: the roof's load-bearing rafters must stay visible
across the opening (removing them would collapse the roof), the mat
should be a soft rollable *krabattos* not a rigid bed, and the opening
should look ragged/dusty from being dug through, not clean -- each cited
to real archaeological sources. Correctly combined with two failing
automated checks into `hold_for_review`, the most cautious status.
**Deliberately NOT auto-wired into every `runMediaGeneration` call yet** --
each reviewed shot costs a real additional grounded search call on top of
the two existing checks; run standalone per-shot (or could be extended to
a whole-project audit matching the other two checks' pattern) until Dan
decides this should run automatically by default.

Full test suite green (90/90), typecheck clean.

## Next up

Pipeline status as of 2026-09-06 (end of session): stages 1-4 fully
implemented and run for real, through two full review passes with Dan.
Stage 5's audio half has run for real; both of stage 5's remaining
provider methods (Veo, Kling) are implemented and individually verified.
Three automated QC mechanisms now exist (canonical-likeness,
scene-fidelity, Critic+Director) plus a disciple-timeline gate in casting
itself, and Dan has a UI to review keyframes directly. Still open:

- Get a language specialist (or Dan, if he can informally judge Hatam
  audio against verse boundaries some other way) to actually check the 20
  flagged `audio_segments`/`review_notes` rows stage 1 produces, and the
  3 boundary-straddling `review_notes` rows stage 2 produces, against the
  real audio — each carries full context, but they're still database
  rows, not reviewer decisions. Every later stage is building on this
  unconfirmed input in the meantime.
- ~~Apply the Critic's two findings (roof rafters, krabattos mat)~~ --
  done same day: applied to the shot's continuity_notes, regenerated
  (only that one shot -- its status was already non-'accepted' from the
  Director's `hold_for_review` decision, so `runMediaGeneration`'s normal
  reuse-if-exists logic picked it up on its own). Result: a real
  load-bearing beam now visibly spans the opening with ragged thatch/
  branches around it, and the mat reads as a soft woven pallet, not a
  rigid bed. Re-verified no duplicate-Jesus regression with the
  strengthened canonical-likeness check (`instanceCount: 1`, "clothing
  and hair combination remains unique to the central figure").
- Decide whether/how to run Critic+Director more broadly: per-shot on
  demand (as built), a whole-project audit mode (matching
  canonical-likeness.ts/scene-fidelity.ts's own audit runners), or wired
  into every `runMediaGeneration` call by default -- each real option
  trades against per-shot cost/latency (a live grounded search call).
- Decide how to handle the wide/crowd-shot likeness ceiling flagged
  earlier this session -- distinct from the single-reference-image bug
  already fixed; many failures there read as "too small/distant to
  verify" rather than an actual wrong face.
- Wire `KlingLipSyncProvider.sync()` into stage 5's video half
  (`voice-lipsync/index.ts`) for the lip-sync shots, and
  `GeminiVideoProvider.generateFinal()` into a new step that writes real
  `clips` rows for the non-lip-sync shots -- both providers are ready,
  neither is wired into a pipeline stage yet.
- Stages 6-7 (assembly, QC) still fully unbuilt -- blocked on real `clips`
  existing first.

Out of scope for now: which subset of the illustrated-Scripture prior
attempt's assets to import — not needed until the Illustrated lane is
active, which is after v1.

## Lesson to keep applying

A prior attempt to fix BVET's issues fragmented into ~100 disconnected
tickets and lost the thread of the actual goal. Keep every piece of design
and implementation work traceable back to `docs/PRODUCT_VISION.md` rather
than letting a backlog of fixes become the de facto plan. The Goal Guardian
check in `AGENTS.md` exists specifically to catch this during
implementation; scoping a v1 before architecture exists to catch it one
step earlier.

## Coverage-beat keyframes: first candidate batch (2026-09-08)

The coverage-beat workflow is now in active production use for the Hatam Mark
2 reviewable cut. It supports the product goal of keeping continuous
heart-language dialogue intact while the picture cuts among short master,
reaction, and lip-sync clips.

Codex prepared, generated, and imported three distinct Scene 1, Shot 7
(Mark 2:8-9) candidates without changing the shot-level keyframe history:

- Beat 1, a silent interior master;
- Beat 3, a principal-scribe reaction cutaway; and
- Beat 4, a fresh Jesus lip-sync insert.

They remain `generated`, pending producer approval; their immutable briefs,
reviews, image assets, and provenance records are retained. The remaining
coverage-keyframe worklist is 40 planned beats across the nine
covered-sequence shots. The proportional beat timings remain composition
planning estimates until audio phrase-boundary refinement.

## Coverage approval and Critic calibration (2026-09-08)

Dan approved all four Scene 2, Shot 8 coverage beats for Mark 2:17: doorway-scribe and meal-guest cutaways plus two Jesus lip-sync inserts. The Critic prompt now treats a scribe's white-and-black striped shawl as a minor costume-canon violation only; it may be reported but cannot elevate an otherwise usable keyframe above minor severity.

## Coverage critic grounding calibration (2026-09-09)

The coverage-keyframe review path now supplies each critic run with the beat's
sequence, type, and assigned purpose. This prevents a reaction/cutaway from
being judged as though it must depict every physical action in its parent
shot. The Critic also inventories what is actually visible before assessing
it, and flags visibly cloned crowd members: an exact repeated face, hair,
wardrobe, and pose in one frame is a generation defect. Recurring canon crowd
designs remain valid when they are separately staged; similar generic scholar
robes alone do not constitute duplication. The full suite passes (114 tests).

The duplicate-crowd calibration was strengthened further after the grounded reviewer
missed a visible three-person clone cluster. `runCritic` now also runs a dedicated
structured visual duplicate pass that counts the largest same-face group and raises
the final severity deterministically: two is moderate; three or more is severe.
A rerun on Scene 1, Shot 8, Beat 5 found a six-person matching background cluster
and therefore rated the candidate severe. The full suite passes (115 tests).

## Production-crew interaction map (2026-09-13)

The project view now has a compact, expandable Production Crew map that makes the
chapter's actual production path inspectable without claiming the planned
multi-agent shot-planning network is already running. It shows the deterministic
supervisor separately from creative roles, highlights the department associated
with the chapter's current pipeline stage, and groups the documented specialist
roles by department. Every specialist is labelled implemented, planned, or mixed.

The view reads real project state and the persisted Creative Director / Production
Director negotiation transcript from `director_negotiation_log`. When no transcript
exists, it explicitly says so; declared paths are not presented as a live
conversation. This preserves the producer's current project workflow while making
the intended role-agent architecture and its currently implemented bounded
coverage-gap negotiation legible for future decisions.

## Future whole-film audience review pair (2026-09-13)

The approved future design now reserves a two-house whole-film review gate for
the assembled rough cut: a Story Critic for first-time-viewer clarity, emotional
movement, and engagement, and a Film Critic for filmmaking craft. They review
independently before a short producer-visible discussion, with one strongest
success, up to three evidence-based timestamped concerns, and a ready/revise/hold
recommendation. The pair is an original HeartWord format, not a use or imitation
of real critic identities. It stays separate from Scripture and cultural review,
runs on the first rough cut and after major revisions, and is explicitly planned
rather than implemented.

## Control-room reference portraits preserved (2026-09-13)

Nineteen producer-approved original portraits for the private future control-room
cast are preserved under `docs/assets/control-room/agent-portraits/`, with an
adjacent role and provenance manifest. They are project-reference art only: they
are not Scripture-video canon, do not claim runtime agents, and are deliberately
not wired into the pipeline. The standalone interaction-diagram prototype uses
only its six visible core roles as portrait references; its map remains a
prototype rather than runtime orchestration. The prototype now supports
pointer- and keyboard-resizing of the map, live-boundary connector routing with
proportionally scaled head-safe core portraits, and a clearly non-live
supporting-crew portrait gallery; none changes production behavior.
It also includes a local-only Producer Address recognizer: typed names (and
browser voice recognition when available) glow matching reference cards without
sending a message, starting an agent, or changing pipeline state.

## Future production-crew communication protocol (2026-09-13)

The producer-approved future operating contract for all sixteen control-room
roles is recorded in `docs/design/production-crew-communication.md`. It makes
Scripture/source audio controlling, Mabel the sole deterministic execution
authority, and the producer the resolution point for material holds. The
declared gates and interaction edges are design contracts only: they do not
activate runtime agents, change the pipeline, or make the prototype's
supporting crew live.

The approved future protocol also includes a three-member independent Red Team:
Scripture Fidelity, Dramatic Impact, and Production Feasibility Challengers.
They are evidence-scoped adversarial reviewers at declared gates, not
production-chain authorities. The standalone control-room prototype represents
them only inside a dashed, explicitly planned Review and Challenge Layer.

## Control-room presentation personalities (2026-09-13)

The private control-room prototype now has an opt-in, clearly labelled staged
banter layer based on Dan's populated cast-personality and sample-exchange
workbooks. It spotlights the participating portrait/name/title cards at three
times normal size during an exchange, then clears that local display state five
seconds after the final line. The presentation layer is expressly separate from
the production pipeline: it cannot dispatch work, alter agent authority, change
evidence or reviews, or activate any planned crew/reviewer role.

## Control-room voice casting persisted (2026-09-13)

The producer-approved presentation voice cast is now persisted in the local
`control_room_voice_profiles` table: all nineteen named control-room personas
have an OpenAI TTS base voice and a delivery instruction derived from the
personality workbook. It is structurally separate from Bible-video canon
characters and their source-language voice mappings, and its database
constraint fixes every row as presentation-only. The idempotent seed command
preserves future producer edits by adding only missing profiles.

## Supporting crew visible in the interaction map (2026-09-13)

The standalone control-room prototype now includes all ten supporting crew
portraits in a separate dashed reference band within the interaction map. The
band makes the full cast visible at a glance while retaining the distinction
between the six core map nodes and the supporting crew: its cards have no
active routes, dispatch power, or production authority. The detailed gallery
remains below the map for portrait inspection.

## Map-first control-room presentation (2026-09-13)

The standalone control-room prototype now opens in a map-first view, with the
full interaction map occupying the primary page area. Presentation-only view
buttons switch locally among the map, staged conversation panel, planned review
layer, and portrait gallery. The switcher changes no production data, agent
authority, runtime state, or pipeline behavior.

## Producer-address microphone clarity (2026-09-13)

The presentation-only control-room recognizer now reports the specific browser
speech-recognition outcome instead of leaving the Mic action ambiguous. It also
maps common phonetic spellings of Mabel, including “Bable,” to Mabel's reference
card when a browser transcript is available. The browser recognizer remains
separate from the Codex live-voice transcript and cannot affect the production
pipeline, dispatch work, or start an agent.

## Separate presentation voice listener (2026-09-13)

With producer approval, the control-room prototype now offers a separate
browser-microphone WebRTC listener for card highlighting. Its local server
brokers only the WebRTC setup using the configured OpenAI account; the API key
is never exposed to the page. The listener has cast-name transcription guidance,
does not request model responses, saves no transcript, and never calls a
production, review, or database endpoint. It is a separate microphone source,
not an integration with the Codex voice-call transcript.

## Presentation-only full-cast map (2026-09-13)

The control-room mockup now presents its sixteen current cast cards as equal,
compact cards in one circular map. The presentation circle deliberately hides
the old route arrows and treats neither the card positions nor card selection
as pipeline state, authority, or a production workflow change.

The presentation map also lets Dan drag cards into a preferred arrangement.
Those browser-local positions are retained for the next page load and remain
strictly visual: they are not saved to HeartWord production data.

When the separate presentation listener recognizes an addressed cast member,
the matching map card now retains its arranged position while receiving a
three-times visual spotlight and a glowing outline. This is a display-only
selection state and does not activate an agent or alter any pipeline record.

For staged agent-to-agent banter, both participating cards use that same
large glowing focus treatment. Every nonparticipating card becomes an
unlabelled half-size portrait thumbnail in an even surrounding cluster; the
saved producer layout is restored when the focus view clears.

An unmatched presentation question can now use a server-only live-research
fallback. It sends only the addressed agent name and producer question to the
Responses API with web search, asks for a short persona-consistent answer,
returns up to three public sources, and renders the answer in the existing
presentation voice. It is opt-in by spoken question, uses API credits only at
that time, stores no response state, and has no production or pipeline access.

Two dated, read-only presentation briefs now give Mabel and Dottie grounded
HeartWord context from the current goal, architecture, and crew-design
documents. They are stored separately from production records and do not scan,
infer, or persist live project status. Live presentation replies are limited to
one short paragraph, suppress URLs and citations, and are restricted to
HeartWord's project and filmmaking context; unrelated questions receive a
brief redirect instead of an open-ended research response.

Dottie's presentation profile now uses the feminine-presenting Shimmer voice
with casting-director delivery guidance. This voice assignment remains private
control-room presentation data and does not affect any Scripture-video voice.

Kit's presentation profile now uses the feminine-presenting Nova voice while
retaining her precise lip-sync-specialist delivery guidance. Every control-room
persona now also has a dated, read-only, source-traceable project brief. The
briefs supply bounded presentation context only; they are neither live-status
scans nor runtime-agent memory, and they cannot change HeartWord records.

All control-room TTS replies now use a shared conversational pacing direction
and a modest 1.15x speech speed. This affects only the private presentation
layer, preserving each agent's character-specific delivery and leaving all
source-language, narration, and production audio untouched.

The presentation listener now treats new producer speech as a barge-in: it
stops any currently playing agent reply and aborts a pending reply request, so
only the latest completed question can receive a spoken response. This is a
local presentation control and stores no transcript or production state.

The Presentation Exchanges player now renders each cast member's staged line
in that character's saved presentation voice, while producer lines remain
on-screen. This is an opt-in local demonstration and has no production access,
recording, or authority.

The twelve remaining main-map control-room cards now use new identity-preserved,
near-square, face-forward close-up portraits for readability. Their original
portrait files remain the click-to-enlarge source, preserving the existing
full-body or square inspection view. These private presentation assets are
separate from Scripture-video canon and do not affect the production pipeline.

The normal map cards now crop each square portrait into a compact square image
area with a shallow neutral first-name caption band underneath; job titles
remain available in the enlarged focus view. This is presentation-only styling.
When a card is focused, the surrounding thumbnail names remain visibly placed
outside the circle rather than being clipped by the compact normal-card frame.
The bottom group has extra label clearance and is lifted slightly so its names
do not overlap its portraits.
Focused cards explicitly restore their second-line role titles, so core and
supporting crew members present the same identifying information in focus.
The focused supporting-card rule also overrides the compact gray caption style,
keeping its name and role on separate, readable lines.
Focused names use a visibly larger type size than their role lines.

The spoken presentation cue “any issues?” now selects one random, saved,
two-person exchange involving the currently addressed agent and spotlights both
participants. It reads only producer-approved staged banter from the separate
presentation library and never reports or changes live project status.
Selections are limited to the sixteen main-map personas so both exchange
participants have a visible focus card.

During a staged exchange, the current speaker receives a pulsing highlight,
visible “Speaking” badge, and directional cue toward the dimmed listener.
This makes turn-taking legible without changing any production behavior.

Ada, Theo, and Cora now appear as a visually distinct Red Team group on the
presentation map, completing the visible cast of nineteen. They remain
review-only and are deliberately excluded from the random “any issues?” cue,
although their approved staged exchanges remain available from the presentation
library.
Their default map positions form a bottom row—Ada, Theo, then Cora—while still
honoring any producer drag-and-drop placement saved afterward.
Their normal red outline is two pixels wide for a clearer Red Team distinction.
The map now draws a separate red frame around their actual saved locations with
a centered “Red Team” label underneath; it follows later producer repositioning
and stays out of the focused presentation view.

The normal presentation map now uses a compact, centered 6–6–4–3 arrangement
for all nineteen cards, with the Red Team grouped on the bottom row. The row
interval is thirteen percent of map height—tighter than the original layout but
wide enough to keep caption bands separate—and the arrangement is saved as the
new drag-editable layout without affecting production work.

Every normal map card now displays its first name and role on separate visible
caption lines. The original core-card dash-form labels were normalized to match
the supporting crew and Red Team cards.

Red Team map captions now show only each critic's role, without the redundant
group prefix or special dash character; focused Red Team cards retain the full
Red Team role name.

The private control-room presentation now includes a separately framed Film
Critics pair, Gene Siskel and Roger Ebert. Their illustrated portraits are
based on producer-supplied public reference photos; their stock TTS voices and
role briefs capture distinct review emphases without imitating their real
voices. They remain presentation-only and have no production authority.
Their Film Critics group sits beside the Red Team on the same bottom map row.
Together, the two review groups are horizontally centered as a single five-card row.
Their frames have a deliberate center gap so the two teams remain visually distinct.
The sixteen standard cast cards are framed together as the Production Crew across
the top three map rows, with the separate Red Team and Film Critics groups below.
The presentation shell clips only accidental horizontal frame overhang, and the
group-frame padding is tightened so no horizontal scrollbar is introduced.
The two review groups sit roughly 50 pixels closer to the Production Crew
frame, reducing vertical dead space while keeping the group labels legible.

The default control-room view is now a cast-only presentation stage: Production
Crew, Red Team, and Film Critics remain visible with a single microphone icon.
The address bar, exchange player, view controls, and other utility panels stay
available in the page implementation but do not occupy the presentation view.
The cast-only layout uses the available viewport for larger, non-overlapping
portrait cards: three broadly spaced Production Crew rows and a clearly
separated Red Team and Film Critics row beneath them.
Following presentation review, the Production Crew now uses two eight-card rows
with larger portraits, allowing the images to use the stage more effectively
while keeping both review groups visible in the same viewport.
The Red Team and Film Critics now shift left together as a single bottom-row
group so their combined visual weight is centered beneath Production Crew.
The staged-exchange speaking direction cue is now a CSS chevron rather than a
text arrow, preventing character-encoding artifacts in the presentation view.
Two-person focus now uses balanced centered lead cards with the remaining cast
in dedicated top and bottom rows, eliminating the former thumbnail overlap.
Focused portraits explicitly center within their cards, preventing a crew
portrait from touching the focus-card edge.
Focused portraits now share the same rounded-corner crop regardless of whether
the agent belongs to the core cast or supporting crew.
Focused portraits now fill the full height of the focus card, maximizing the
animation-ready image area while keeping a uniform rounded crop.
The focus transition now also explicitly replaces stored normal-map thumbnail
dimensions, so supporting-crew portraits such as Leon and Benny use that same
full-height focus treatment.

An ElevenLabs audition palette now offers six temporary, gender-aligned voice
samples for representative presentation characters. It is opened by saying
“voice auditions,” never changes a saved cast assignment, and remains wholly
separate from source-language audio and production work. Staged exchanges now
add a bounded, playfully sarcastic delivery direction: sharper creative
disagreement without personal abuse.
The audition phrase is handled both directly in the realtime transcript and
in the shared recognition path, so a recognized voice command cannot fall
through to ordinary agent addressing.
Following producer approval, the six audition winners are now the active
presentation voices for Mabel, Rufus, Gus, Vera, Dottie, and Gene Siskel.
All other agents retain their prior OpenAI presentation voices. This affects
only staged control-room dialogue, never source narration or production audio.
The audition palette’s second round now includes five newly added catalog
voices, paired temporarily with Leon, Pippa, Tessa, Sam, and Arlo. These are
auditions only; no second-round assignment is saved until Dan hears and
approves the choices.
Dan approved the full second round. Those five ElevenLabs assignments are now
active for presentation dialogue alongside the original six approved voices;
all remaining personas retain their existing OpenAI assignments.
Starting the presentation listener with the microphone icon now uses that
producer click as Chrome’s required full-screen gesture, so the cast-only
control room enters true browser full screen when it starts.

The control room now has a canonical proposed responsibility matrix for all
21 personas. Every item is bounded as advisory or review work and explicitly
preserves producer approval, verified Scripture, canon safety, and source-audio
integrity. Clicking a presentation card opens the original full-size portrait
alongside its name, role, and six inherited proposed responsibilities.

The cast-only presentation stage now uses the approved HeartWord AI mark as a
discreet lower-right signature. It steps out of view while a focused agent card
is open, preserving the full presentation space for the portrait and proposed
responsibilities. Its white source canvas blends into the stage background, so
only the HeartWord AI mark is visible.

## Private control-room idle motion (2026-09-14)

The cast-only Agent Control Room now plays approved local-MP4 idle-motion clips
for Rufus and Pippa. Rufus was generated from the wide, motion-safe source
frame and passed visual review for identity, head/shoulder room, stable
framing, and unchanged props. Pippa's 360p Gemini Omni 1.1 clip uses her
approved wide source as both first and final frame; it passed identity/framing
inspection and repeated control-room browser-loop QA without a visible boundary
jump. Mabel's matching source was refused by the provider, so she remains
static rather than receiving a substitute. Every other card also keeps its
original static portrait. The browser plays at most one short clip at a time,
with a randomized three-to-eight-second pause before the next approved overlay,
and removes the overlay during reduced-motion preference,
background-tab, portrait-dialog, and cast-focus states. It neither plays audio
nor reads/writes production data. Before every new scheduled overlay, it also
removes every residual idle-motion element and active marker, preventing a
stale presentation preview from overlapping the next card.

The later producer-authorized Omni batch added approved 360p loop-closure
clips for Gus, Vera, Orion, June, Leon, Tessa, Arlo, Nell, Sam, Miriam,
Dottie, Kit, Benny, Ada, Theo, and Cora. Every approved clip was generated
once from a non-destructive landscape source used as both Omni first and final
frame, then reviewed for identity, composition, and paired loop boundary
before being added to the existing one-at-a-time scheduler. Mabel, Gene Siskel,
and Roger Ebert each received their one authorized batch attempt but Omni
blocked it; they remain static and received no retry or substitute. The
presentation-only batch ledger is at
`docs/assets/control-room/idle-motion/batch-ledger.json`.

`scripts/generate-control-room-idle-motion.ts` is the deliberately bounded
generation path: it uses the already configured Gemini Omni image-to-video
capability only for supplied private source frames, then strips audio and
writes review-candidate 360p H.264 MP4s under
`docs/assets/control-room/idle-motion/`. It has no database, pipeline, or
server access; each optional draft is estimated at roughly $0.10. The script
makes no retry or provider-switch decision. This is presentation decoration
only, not runtime agent activity, Scripture-video media, canon, or source
audio.

The subsequent Rufus loop-closure iteration added an optional Veo 3.1
first/last-frame request path and sent one eight-second locked-camera request
with `rufus-motion-safe-source-v1.png` as both frames. The provider filtered
the request during audio processing and returned no video. The request was not
retried, no provider changed, and the existing approved `rufus.mp4` remains
active; therefore no browser boundary replacement review was possible. The
new helper and standalone script remain presentation-only and do not alter the
production pipeline.

The proposed-responsibility list in the expanded cast portrait now uses larger,
more comfortably spaced type. This makes deliberate use of the existing dialog
whitespace while keeping the portrait, responsibility wording, card geometry,
and presentation-only boundary unchanged.

The expanded proposed-responsibilities heading, role/detail line, loading
message, and responsibility list now each use two visible 0.10rem type-scale
steps. Compact map cards and unrelated modal typography remain unchanged.

Every expanded cast profile now includes a modest, keyboard-accessible next
arrow. It advances through the displayed map roster with wraparound while
naming its destination for assistive technology; it remains presentation-only
and leaves compact cards and the close control unchanged.

The expanded profile now pairs that control with a matching accessible back
arrow. It moves through the same roster in reverse, including Mabel back to
Roger Ebert, while preserving the open presentation detail view.

One-time full-cast presentation-voice calibration (2026-09-14) rendered the
same neutral line through every saved provider configuration and measured EBU
R128 integrated loudness and true peak with FFmpeg. It chose -22 LUFS as the
reference, applied rounded gains only to voices at least 1 dB quieter, and
left the louder eight voices unchanged. Boosted profiles are Mabel +2, Rufus +4,
Pippa +3, Ada Rowe +10.5, Cora Bellamy +2.5, Gene Siskel +2.5, Roger Ebert +2.5,
Leon +7, Tessa +6, Nell +6.5, Sam +1, Miriam +12, and Dottie +2 dB. Each
boosted reply passes through a -1 dB peak limiter. The reproducible
temporary-file workflow is `scripts/calibrate-control-room-presentation-loudness.ts`; it
deletes generated samples and does not affect any provider assignment,
source-language audio, or production audio.

## Evidence-backed Red Team control-room review (2026-09-14)

The presentation-only Agent Control Room now seeds durable, DB-backed audit
findings for Ada (Scripture/source safeguards), Theo (viewer clarity), and
Cora (production feasibility). Each finding records a review area, concrete
finding, evidence, source reference(s), severity, and a producer-oriented
recommendation. The saved audit is grounded in the current Mark 2 timing and
coverage status, actual unresolved QC data, the present architecture/design
contracts, and the fresh typecheck result. It explicitly marks documented
intentional scope or policy choices as decisions rather than defects.

When one of the three Red Team members receives “What did we do wrong in this
project?” or a reasonable problem/improvement variant, the existing
presentation response path retrieves and speaks its structured saved findings
instead of performing generic web research. The browser also displays that
evidence-backed answer while it plays. This adds no production permission,
workflow trigger, or runtime review gate: the Red Team remains planned
presentation context, and the producer retains every decision.

For Red Team improvement questions only, the presentation path now makes the
same bounded, server-only live web-research call used by the existing Control
Room fallback. Ada receives only saved Scripture/source-safeguard observations,
Theo only saved clarity/impact observations, and Cora only saved
feasibility/reliability observations. The request asks for concise current
recommendations from primary or authoritative sources, labels project-derived
observations separately from external recommendations, and returns verified
public source links for the on-screen response. “What did we do wrong?”
remains deterministic, local, and non-researching. If research is unavailable
or produces no attributable sources, each reviewer instead states that clearly
and returns the saved evidence-backed improvement priorities; no response is
stored and no production record, authority, or gate changes.

## Local Control Room IPv4/IPv6 recovery (2026-09-14)

The local Vite Control Room server was observed listening only on IPv6 loopback
(`::1:5173`), while the presentation page and some browser localhost resolution
paths use IPv4 loopback. Vite now binds dual-stack (`::`) on the same local
development port so both `http://localhost:5173/` and
`http://127.0.0.1:5173/` reach the UI and its existing local API bridge.

The standalone, presentation-only Agent Control Room artifact is now also
served during Vite development at the producer's exact local URL,
`http://127.0.0.1:5173/work/agent-control-room.html`. A narrowly scoped Vite
middleware serves only that HTML artifact and its existing `docs/assets`
portrait/branding/media files; it does not move the artifact, expose unrelated
repository files, or alter the normal React app. When opened through Vite, the
artifact uses the existing same-origin `/api` proxy rather than a cross-origin
port-4000 request; direct `file:` opening retains its prior local API base.

The existing local “How are you?” presentation cue also recognizes “What
inspires you to work here?” and returns the same saved, addressed-agent reply.
It remains a presentation-only interaction and does not send a production
message, alter agent authority, or access project data.

## Mabel portrait candidate (2026-09-16)

A non-destructive Mabel control-room portrait candidate was created at
`docs/assets/control-room/agent-portraits/mabel-control-supervisor-candidate-v2.png`.
It preserves the approved Mabel identity and remains private presentation
reference art only; it is not approved, wired into the control-room UI, or used
as a HeartWord production or Scripture-media asset.

Following producer feedback that the earlier phone-operator visual did not
represent Mabel's supervisory role, the active
`mabel-control-supervisor.png` was replaced with a coordinator portrait. The
replacement depicts review and delegation through a planning board, handoff
cards, portfolio, and pen, and deliberately removes the headset and phone
operator cues. The former active portrait remains retained as
`mabel-control-supervisor-operator-legacy.png`; neither asset is Scripture
media or a production record.

Mabel's presentation-only ElevenLabs voice was recast from Matilda to Lily
(2026-09-16). Lily's warm, confident, middle-aged British delivery better
matches the redesigned senior supervisor portrait and gives Mabel a distinct
control-room presence. The assignment applies only to staged control-room
speech, never source narration, canon-character voices, or production actions.
The producer listened to the supervisory sample and approved Lily as Mabel's
active presentation voice.

## Forestdale science companion archived (2026-09-16)

The producer retired the standalone science-demo companion. Its HTML and a
short archive record are retained under `docs/archive/` for reference only;
the served route, voice endpoint, and associated tests were removed so it has
no runtime connection to HeartWord.

## Strict TypeScript repair checkpoint (2026-09-16)

Before the approved architecture restructuring, the full strict server and
frontend TypeScript check was repaired from 22 reported errors to zero without
changing pipeline or production semantics. The repair validates SQLite query
rows at their boundaries rather than using unsafe row casts, handles unchecked
CLI and regular-expression values explicitly, and corrects the canonical-
likeness regeneration lookup to use the SQL field `character_name`. A focused
regression test confirms a failed character row can be found for recheck.

Validation after the repair: `npm run typecheck`, `npm test` (241 tests), and
`npm run build:web` all pass. This is a bounded reliability cleanup only; it
does not implement the separate agent-role architecture work.

## Production roster, recorded monitor, and correction learning (2026-09-16)

The producer workflow now exposes the approved nineteen-role production roster,
three independent milestone challengers, and optional presentation-only critics
with explicit declared-versus-implemented labels. The chapter monitor shows
only recorded role exchanges and negotiations, links an event directly to its
full saved contribution, and treats held/error events from superseded runs as
history rather than permanent current producer action.

Recorded producer corrections now create a source- and canon-version-contextual
candidate reusable lesson through one bounded text-model synthesis call. The
candidate is inactive until the producer inspects, edits if needed, and
activates it; synthesis failure records the candidate for review and does not
retry. Active lessons are supplied to matching briefs only, with language,
book, region, project, scene, and shot boundaries enforced. The saved run
brief shows the accepted lessons actually supplied. Explicit producer-wide
guidance can still be entered directly. This is application memory, not model
retraining; it does not alter verified Scripture, source audio, canon, or make
media calls.

Validation: strict typecheck, web production build, and all 31 Vitest files
(245 tests) pass. No live provider or production-media call was made during
this implementation.

Follow-up integrity review: scoped lesson targets now remain attached to their
actual shot or scene when supplied to a brief; guidance validation completes
before any persistent write, and related correction records are transactional.
Editing a lesson creates a superseding record plus action history rather than
rewriting the prior decision. The producer dashboard now makes both currently
applicable guidance and that decision history inspectable. The production
monitor treats completed runs and superseded negotiation rounds as history.
The control-room presentation and the production-crew communication contract
now use the current Orion, June, and Benny roles; the four declared specialist
roles remain visible as identity-free placeholders rather than invented
portraits.

Final verification replaced an unstable byte-for-byte comparison of two
independently AAC-encoded but semantically identical finishing renders with a
strict decoded-PCM equivalence check: exact sample length, maximum one-unit
16-bit rounding difference, and at most 0.1 RMS sample error. This retains the
test's duplicate-score and timing protection while excluding encoder rounding
noise. The four identity-free specialist cards are also included in the
default cast-only layout; Benny is explicitly outside its active production
crew frame. Full typecheck, web build, and all 245 tests pass.

An endpoint-level correction-learning regression test now uses an isolated
SQLite database, an ephemeral local Express server, and a mocked synthesis
response to verify the full producer path: invalid reusable guidance writes
nothing; a valid correction becomes a candidate; review creates an immutable
active successor and history; and only that matching book/language/region
lesson reaches a different chapter's brief, excluding disabled and
wrong-language records.

## Retained media library and candidate reuse (2026-09-16)

HeartWord now projects existing immutable generation attempts with verifiable
files into an idempotent retained-media library. The producer can browse image,
video, and extracted-frame records with their original project, shot, verse,
prompt, provider/model, review status, unselected-versus-origin-selected state,
and unresolved review context. A reuse action creates only a guarded target
shot candidate; it never replaces donor or target media, transfers approval,
or makes a provider call. Matching language and one approved regional canon
context are required. Video-frame extraction records immutable parent/timecode
lineage. This creates retrievable metadata for a future assistant without
implementing autonomous creative selection. Benny was removed from visible
control-room roster, selection, and idle presentation schedules; historical
records and files remain retained.

Chapter navigation now opens a selected persisted language/book/chapter
workspace rather than assuming the first project. Create-or-open is idempotent
for the unique project identity, while a new chapter remains empty and does
not inherit media, timing, or source work. Async shot/audio loads discard late
responses for a no-longer-selected workspace. This enables preparing a Mark 4
workspace without initiating its pipeline or asserting its source readiness.

Navigation acceptance tests now verify that opening/creating a normalized
Hatam Mark 4 workspace leaves Mark 2 shots and retained takes untouched,
creates no inherited chapter data, opens duplicate identity requests
idempotently, rejects invalid chapter ranges before writing, and treats Acts
as a distinct supported navigation identity. The navigation book range is a
UI identity guard only; it is not a claim that source or production approval
exists for any particular language/book/chapter.

Crew findings now carry a per-finding 0–100 agent confidence estimate and a
declared limitation beside severity, evidence, and requested change. The UI
labels it uncalibrated; it is not an authority, vote, or gate override, and
legacy saved findings remain visibly “not reported.”

The active Production Director negotiation log now also persists per-verdict
uncalibrated confidence and limitations with its feedback; old text-only log
rows remain unknown rather than assigned a synthetic score.

## QC Critic confidence handoff (2026-09-16)

The grounded image/video QC Critic now records each discrete concern with its
own evidence, severity, uncalibrated 0–100 confidence estimate, limitation,
and requested action in the same grounded response. The existing readable QC
report shows that context beside the grounded narrative and source provenance;
the saved review record also retains it for the next regeneration prompt.
Malformed new structured findings, including missing, non-finite, or
out-of-range confidence, are an incomplete review rather than an approval.

Confidence is advisory evidence for investigation, never an overall score,
vote, authority rank, or override of source, canon, cost, or producer holds.
Existing legacy QC records have no fabricated score and are shown to receiving
work as confidence not reported. The deterministic duplicate-face verifier is
also represented as an individual finding when it reports a duplicate. This
adds no calibration loop, analytics, provider call solely for scoring, or new
production stage.

Focused and full validation passed: strict typecheck, 35 Vitest files / 262
tests, and the web production build. No live provider or media call was made.

## Durable assembly and retained-evidence integrity (2026-09-17)

The isolated durable chapter acceptance fixture now continues through the
actual editing crew runner, validated Ada/Theo/Cora/Production Director
contributions, Picture Editor plan, and FFmpeg editorial renderer. It verifies
that a source narrator interval plus two separately producer-bound speech
intervals by the same speaker in the same verse remain in sequence, that the
rendered file exists, and that no extra ElevenLabs or Kling call occurs after
the selected candidates are reused. The defect exposed by this run was fixed:
editorial validation and cast-master lookup now use the exact original audio
segment identity, not an ambiguous `(speaker, verse)` match. Legacy
cast-master rows remain usable only when their old lookup is unambiguous.

Evaluation adjudication no longer hashes IDs or review rows when a retained
media artifact is missing. It reports an explicit unavailable result without
creating an evaluation case; when available, a shot case records the exact
selected generation attempt and its review state. This preserves evaluation as
human-reviewed retained evidence rather than synthetic provenance. No live
provider, production media, or Mark 4 work was performed.

The recovery ledger now also has an explicit producer reconciliation action
for an `uncertain` lease. It validates the current signed inputs, the complete
upstream dependency chain, and durable output/file checks before recording a
completion; it never issues a provider retry. Adoption refuses to overtake a
running or uncertain worker, preserving its write authority. Isolated tests
cover that live-lease hold and verified uncertain reconciliation before a
normal no-work resume.

At the media provider boundary, a thrown/lost keyframe response is now kept
as a `submission_uncertain` held attempt with the exact submitted prompt and
an explicit review note, rather than disappearing and causing an automatic
repeat provider request. A concurrent local media-stage call receives a hold
while the first provider Promise is active. These checks use isolated SQLite
and mocked provider seams while executing the actual media stage.

Fresh-chapter acceptance now uses a new Hatam Mark 3 project with a generated
DOCX and real FFmpeg audio under the normal source path. It executes actual
ingestion and proves project isolation; because the synthetic source has no
published pericope headings, actual scene breakdown holds rather than
inventing a scene plan. This is a deliberate readiness gate, not seeded stage
success or an assertion that the fresh chapter is production-ready.
The same isolated suite also supplies the required published title, pericope
heading, and parallel-reference structure, proving real ingestion and scene
breakdown create a fresh Mark 3 scene from source structure rather than Mark
2 data. It remains synthetic test evidence, not a source-language approval.

## Fresh reviewed full-chapter proof (2026-09-17)

An additional isolated Hatam Mark 5 acceptance test now follows one new
synthetic chapter through the normal durable orchestrator: low-confidence
ingestion first holds; a named reviewer submits the existing HTTP
source-alignment attestation against the exact DOCX, audio, English reference,
and alignment hashes; real scene breakdown, casting, crew planning, media,
voicing, lip-sync selection, per-shot FFmpeg assembly, Picture Editor
assembly, and finishing review then run. Provider/model seams alone are
mocked. The fixture uses approved synthetic Papuan canon and voice data,
explicit producer bindings for two distinct same-speaker source intervals,
and explicit candidate acceptance; narration is not lip-synced. A final rerun
reuses the durable ledger without another provider submission.

This exposed and fixed a ledger defect in the QC output check: it previously
required the currently-running QC execution to already be completed, making a
successful finishing review self-hold. QC now validates its retained approved
finishing run while preserving the existing completed-ledger path for recovered
legacy work. The proof uses temporary SQLite/assets only; it performs no live
provider call, production-data write, Mark 4 work, or push.

## Generic Gemini source-alignment evidence (2026-09-17)

Generic ingestion now applies the proven Mark 2 pattern without importing its
chapter-specific speaker identities or hand-tuned timestamps: recursively
bounded silence-derived speech intervals are sent to Gemini for a verbatim
source-text proposal, then placed by a weighted local monotonic-anchor chain.
Unanchored Scripture proposals receive a second, stronger-model fill limited
to the text between neighboring anchors. Each interval, including
announcements, empty responses, and failed placements, is retained as source
evidence. The timing is explicitly estimated alignment, never a forced-
alignment or native-language claim.

Before a provider submission, ingestion writes a durable `submission_started`
record. A lost response becomes `submission_uncertain` and holds the chapter;
it is never silently converted to a gap heuristic or automatically resubmitted.
Unresolved placements or less than 95% verified-text coverage also hold while
leaving intervals available for listening and source review. When Gemini is
not configured, a conservative silence-based estimate remains available for
provisional planning and requires named source review; tests disable the key
rather than relying on a production-code test bypass. The chapter-preparation
screen exposes original-reading interval playback and unassigned intervals.

Goal Guardian check: this is confined to Stage 1 evidence and the existing
producer workflow. It preserves the complete FCBH performance, adds no claim
of Hatam comprehension, no new stage, and no automatic decision reserved for
the producer, Ryan, or the language team. Full typecheck, 47 Vitest files / 286
tests, and the production web build pass; no live provider or production source
data was used in validation.

## Bounded source-evidence playback (2026-09-17)

The Chapter Preparation source-alignment list now uses a bounded native-audio
control: Play seeks to the displayed interval start, an end timer plus a
time-update guard stops precisely at its displayed end, and stopping resets
the next replay to that interval start. Timers are cleared on pause, unmount,
and chapter switch. This reads the unchanged source master in place; it makes
no clips, source edits, or production-record changes, and leaves all other
audio controls unchanged. Focused behavior tests, strict typecheck, and the
web build pass without provider calls.

## Honest source-alignment display (2026-09-17)

Generic Gemini matches now store their actual local ordered text-match score
(0–100) rather than a fabricated 0/70 confidence value. The Chapter
Preparation list labels matched text, opening/other non-Scripture audio, and
unresolved review-required intervals separately. It shows a numeric score only
for a matched local text comparison; it never presents that score as calibrated
Gemini confidence, timing certainty, forced alignment, or language approval.
Silence-only runs read “Estimated timing — no Gemini text-match evidence,” and
old rows without retained evidence remain explicitly legacy rather than being
retroactively assigned detail. This is a display/evidence correction only:
source media, source records, and pipeline authority are unchanged.

## Human Mark 3 alignment correction (2026-09-17)

Dan confirmed that the retained Mark 3 original-reading interval
239.321–240.940 seconds is “Simon the Zealot,” Mark 3:18. It is stored as an
append-only named human correction with exact segment identity, assigned text,
evidence, and current source/alignment hashes. The source-interval display
prefers this human-reviewed assignment and identifies its reviewer, while
retaining the original automated/unresolved evidence rather than overwriting
it. The same small correction path is available for a future named,
evidence-backed interval correction; it does not alter audio, source text, or
automatically create reusable language claims.

## Second human Mark 3 alignment correction (2026-09-17)

Dan also confirmed that the retained 55.733–57.990-second original-reading
interval is the narration “But they were silent,” the closing line of Mark
3:4. It is now an append-only human-reviewed correction attached to the exact
interval, attributed to Dan with the supplied gloss/evidence and current
source/alignment hashes. The source-interval list therefore presents Mark 3:4
and human-review provenance while retaining its earlier automated
non-Scripture result unchanged. Goal Guardian check: this is one explicit,
auditable producer correction, not a claim that generic alignment understands
Hatam or a change to source audio/text.

## Narrated paragraph-title source spans (2026-09-18)

Hatam DOCX titles are now recognized only when a non-verse line is immediately
followed by its parenthesized cross-reference line and then a verse paragraph.
They remain non-Scripture `paragraph_title` records with the published
cross-reference preserved. Generic Gemini alignment supplies these title words
as legitimate narrated source spans, identifies a matched title in Chapter
Preparation as “Narrated paragraph/section title,” and excludes title words
from Scripture-coverage arithmetic. Story Writer and Shot Director receive
the titles as optional scene-title context only; no automatic display
instruction is created. Existing Mark 3 non-Scripture intervals have no
verbatim automated span with which to prove a title match, so they are not
retroactively reclassified: run an explicit title-aware ingestion/review or
record a named human interval correction. Goal Guardian check: this preserves
published source structure and the narrator’s performance without inventing
Scripture assignment, title display, or language claims.

## Cross-reference editorial evidence (2026-09-18)

Paragraph-title cross-references now enter the alignment source stream as a
separate non-Scripture `cross_reference` span. A match is explicit evidence
that citation speech occurred and holds its film treatment for review; it is
never forced into a verse. A citation can be safely omitted only when a
matched narrated title is followed by a clean matched Scripture span with no
intervening speech evidence. Any matched citation, unresolved interval, or
missing clean Scripture resumption is a review hold. Story Writer and Shot
Director receive title context separately from cross-reference metadata, with
the default that citations are not film narration/on-screen text unless a
human resolves an exception. Existing Mark 3 has not been reassessed: run a
new title-aware alignment pass against the retained source (then review its
evidence) or record named human corrections; no provider or source call was
made here. Goal Guardian check: this safeguards the complete source
performance and prohibits both silent omission and invented citation content.

## Correction-safe re-ingestion (2026-09-18)

The Mark 3 re-ingestion foreign-key failure was caused by deleting
`original_reading` rows while append-only human alignment corrections still
referenced those rows. Re-ingestion now inserts replacement rows first,
remaps each correction only when the replacement has exactly the same source
start/end interval, then deletes the old rows in the same transaction. If an
equivalent interval is absent, it rolls back and holds rather than orphaning
or silently retargeting a correction. The real Mark 3 cached-evidence
re-ingestion completed this remap for both Dan corrections without a provider
call; it remains held for its pre-existing coverage review, not a database
failure. Goal Guardian check: this preserves immutable source assets and
human evidence while allowing a reviewable Stage 1 recovery.

## Mark 3:31–32 boundary correction (2026-09-18)

Dan confirmed that automated Mark 3 interval 385.645–399.645 seconds included
the initial word `Andigpoi` of the following speech. The source waveform's
stable preceding pause begins at 399.191 seconds. Append-only named boundary
overrides now end Mark 3:31–32 at 399.191 and begin the next retained interval
there, so no gap or duplication occurs and downstream users of source timing
receive the corrected boundary. The automatic interval/evidence remains
retained through each override's original timing and evidence. Goal Guardian
check: this is a specific producer listening correction; it neither changes
the source asset nor infers a broader Hatam timing rule.

## Bartholomew v3 canon promotion (2026-09-19)

Dan approved a complete replacement reference package for Bartholomew after
reviewing the headshot and neutral-standing, walking, teaching, and
seated-listening body shots. The new v3 canon locks a lean late-30s-to-early-
40s Papuan disciple with an oval tapered face, close-cropped tight black curls,
and a short pointed beard with minimal gray. Its color language is an undyed
flax tunic with a narrow olive neckline and muted deep-indigo draped mantle.
This deliberately separates him from Peter's broader, grayer, rust-brown
silhouette while retaining historically appropriate simple woven garments.

All five approved assets are copied into Bartholomew's canonical paths with
SHA-256 hashes in both `character_assets` and `import-manifest.json`. The new
approved v3 is the durable seed target; v2 is superseded, retained, and not
deleted. The character still has no voice mapping, which remains a separate
need only when a planned chapter assigns him spoken dialogue.

Goal Guardian check: this is a producer-approved identity-continuity correction
within the existing Canon Builder workflow. It improves recurring-character
recognition without creating a new product requirement, rewriting Scripture,
or recasting any approved scene.

## Judas Iscariot v3 canon promotion (2026-09-19)

Dan approved a complete replacement reference package for Judas Iscariot:
headshot plus neutral-standing, walking, teaching, and seated-listening body
shots. The new v3 canon locks a lean early-to-mid-30s Papuan disciple with a
long narrow face, high forehead, swept-back tight curls, and a narrow moustache
joined to a short pointed goatee. His olive flax tunic and dark wine-red mantle
give him a distinct silhouette and color block from both James son of Zebedee
and James son of Alphaeus.

A small, plain leather drawstring money bag is recorded as a bounded practical
accessory: it appears in standing, walking, and seated references, but is
excluded from the headshot and teaching reference. It is neither a villain cue
nor an automatic instruction to show the bag in every scene. The five approved
assets are copied to canonical paths with matching SHA-256 hashes in
`character_assets` and `import-manifest.json`; v3 is approved and v2 is
superseded without deletion. Voice mapping remains a separate need when a
planned chapter assigns Judas a line.

Goal Guardian check: this is a producer-approved Canon Builder correction that
improves disciple recognition and preserves reviewable version history. It
does not invent narrative behavior or alter approved scene work.

## James son of Alphaeus v3 canon promotion (2026-09-19)

Dan approved a full v3 reference package for James son of Alphaeus: a headshot
and neutral-standing, walking, teaching, and seated-listening body poses. The
update makes him subtly five years younger and locks a full black beard in
place of the prior gray beard, while retaining his short curls, pale flax tunic,
and gray draped mantle. All five source files are copied to canonical paths,
hash-recorded in `character_assets` and `import-manifest.json`, and the normal
seed path is idempotent. V2 is superseded but retained for rollback.

Goal Guardian check: this is a bounded producer-approved identity correction
inside the existing Canon Builder workflow. It preserves the global character's
reuse across future chapters without adding narrative content or a new stage.

## Distinct disciple headshot v3 promotions (2026-09-19)

Dan approved new v3 headshots for James son of Zebedee, Philip the Apostle,
Matthew (Levi), and Thaddaeus (Jude) after identifying that their prior short
black curls, full dark beards, similar builds, and robe-color-only differences
would not survive independent shot generation. The four new identity locks are:
a sturdy, cropped-hair, square-bearded James; a lean, clean-shaven,
side-swept-haired Philip; an older bald, clean-shaven, fuller Matthew; and a
young, angular, fine-moustached Thaddaeus. Each also has a distinct simple
first-century color block.

Each approved headshot was promoted as a new v3 with its previous v2 motion
references carried forward unchanged and v2 superseded without deletion. This
records exactly Dan's current approval while making the remaining gap explicit:
matching v3 body-pose packages must be separately generated and reviewed before
the new silhouette/color locks are uniform across all angles. All five assets
per character, including carried-forward motion poses, are hash-recorded in the
database and `import-manifest.json`; the normal seed is idempotent.

Goal Guardian check: this is a bounded Canon Builder identity correction that
strengthens recognition without inferring theology, narrative behavior, or new
product scope. It deliberately does not force-regenerate existing approved
shots or treat unreviewed body-pose redesigns as approved canon.

## Matthew (Levi) v4 canon promotion (2026-09-20)

Dan approved a complete v4 package for Matthew (Levi): an approximately
30-year-old, bald, clean-shaven Papuan disciple with a broad, friendly face and
fuller build. The reviewed headshot and four body references lock his pale
stone-gray flax tunic, deep-teal mantle, leather belt, and sandals across
neutral-standing, walking, teaching, and seated-listening poses. This replaces
the older v3 headshot and the v2 body references that v3 had carried forward.

All five approved assets are copied to canonical v4 paths; their SHA-256 hashes
are recorded in `character_assets` and `import-manifest.json`. V3 is marked
superseded, never deleted. Matthew's lack of an individually attributed New
Testament line remains unchanged, so no voice mapping is added.

Goal Guardian check: this producer-approved identity correction completes a
consistent reusable motion package in the Canon Builder without inventing
narrative content, changing Scripture, or requiring regeneration of existing
approved scenes.

## Matthew (Levi) v5 canon promotion (2026-09-21)

Dan approved a new complete reference package for Matthew (Levi), replacing
the prior v4 identity with a lean, 28-year-old Papuan tax collector. V5 locks
a fine-boned oval face, compact tightly coiled black hair, clean-shaven face,
attentive dark eyes, stone-gray flax tunic, and deep-teal mantle. His reserved,
self-contained posture conveys meticulous observation and mild social unease
with dignity, not caricature.

A small plain wax tablet and reed stylus are bounded practical recognition
cues: they appear in neutral-standing, walking, and seated-listening poses and
are tucked away for teaching. The accessory supports his tax-collector
precision but is neither an automatic scene instruction nor a substitute for
his face, silhouette, age, and garment color language. All five approved assets
are canonical v5 paths with SHA-256 hashes in `character_assets` and
`import-manifest.json`; v4 is superseded but retained. Matthew still has no
individually attributed New Testament line, so no voice mapping is added.

Goal Guardian check: this is a producer-approved character-canon correction
that strengthens future shot continuity without inventing narrative content,
altering Scripture, or forcing regeneration of existing approved scenes.

## Canon review page as a live route (2026-09-21)

The canon critic's verdicts previously landed only in `review_notes`, readable
one SQL query at a time. They are now browsable at
`GET /api/projects/:id/canon-review`: one card per approved canon character
showing its reference images, severity chip, the critic's actual note text, and
filters by severity or "only without body pose".

Two decisions worth keeping:

- It is a server-rendered route, not a generated file. An exported HTML
  snapshot goes stale the moment canon changes or the critic re-runs, and a
  stale canon view is worse than none — this page reads the live DB on every
  request, so a bookmark is always current.
- Each card names the exact images the critic read. Its garment verdicts rest
  on what it could see, and a "severe: no outer mantle, so no tassels" drawn
  from a turnaround alone is a weaker claim than the same verdict drawn from a
  standing body pose. Across the current canon that splits 15 characters judged
  from two body poses, 12 from a body pose plus a turnaround, and 5 from a
  single turnaround. Those 5 are what the "only without body pose" filter
  isolates, rather than letting the severity chip imply more confidence than
  the evidence carries.

The page originally re-derived that selection itself and got it wrong: it
labelled all four of Bartholomew's body poses "sampled by critic" when the
audit reads two, ranked same-category ties differently, and ignored the audit's
skip of assets missing from disk. Both now call one exported
`criticSampledAssets` in `pipeline/qc/canon-critic.ts`, so a page about
evidence strength cannot drift from the code that produced the evidence.

That extraction also made the audit's own choice reproducible. Its SQL ranks
categories but leaves same-category rows to rowid order, so "which of
Bartholomew's four body poses did the critic see" had no stable answer between
runs; ties now break on path. The next `auditCanonGarments` run may therefore
read a different pair than the last one did for characters with several poses.

Also fixed here: `generateFinalVideoWithFallback` did not accept the `tier`
option its caller in `final-video.ts` was passing, so `npm run typecheck` had
been failing since the shot-risk tiering commit. The wrapper now declares
`tier` and a test pins that it reaches both Veo and the Kling fallback.

Goal Guardian check: this is review tooling that makes existing QC evidence
legible to the producer. It generates no media, spends nothing, and changes no
canon — it only surfaces what the critic already recorded, with the strength of
each verdict's evidence attached.

## Tzitzit/costume fix handoff to Codex (2026-09-21)

Dan reviewed the 2026-09-21 canon garment audit's findings via the canon
review page and decided to act on them: accept the critic's recommendations
across the Mark 3 canon, with two named exceptions (keep Jesus's hair as-is;
keep both scribes' fabric black rather than recoloring to cream/off-white).

Handed off to Codex as
[`docs/handoffs/2026-09-21-codex-canon-costume-fixes.md`](../handoffs/2026-09-21-codex-canon-costume-fixes.md)
rather than done here, since Codex owns the canon-image generation workflow
(`scripts/character-tool/promote-*.ts`). The handoff breaks ~20 characters
into ordered, independently-committable batches by Mark 3 production impact
(shot count × open issues) given Codex's limited usage window before 9pm
tonight — Jesus first (23 of 30 shots, only 2 fixes needed), the five old-v1
Mark 2 "Friend" characters and the Healed paralytic last (currently 0 Mark 3
shots, deferred rather than skipped).

Goal Guardian check: this delegates a producer-approved canon correction to
the tool that already owns it, with the scope and the two overrides stated
explicitly so nothing gets reinterpreted mid-work. No media generation is
authorized by this handoff.

## Mark 3 canon costume fixes — batches 1–2 promoted (2026-09-21)

Dan approved the completed full reference packages and they are now canon:

- **Jesus v4:** all four motion references now use finished woven hems and
  simple low-ankle toe-thong sandals. The v3 close-up and approved source are
  carried forward unchanged; per Dan's override, shoulder-length hair remains
  unchanged.
- **Crowd witness (stern man, spokesperson) v3:** standing, walking,
  teaching, and seated references now show dark-indigo clavi, elbow-length
  drop sleeves, a full beard, and an unbelted outer mantle. His existing
  tzitzit remain intact.

Former versions are superseded rather than deleted, and each asset has a
SHA-256 record in the manifest. The next handoff item, **Principal scribe**,
is in producer review as a candidate only: black fabric remains a deliberate
producer override, while the candidate corrects the head covering, knotted
corner fringes, and non-figurative purple gamma motifs.

Goal Guardian check: this is limited to producer-approved canon identity and
costume references that improve Mark 3's consistent visual world. It creates
no shots, media-generation attempts, voices, or narrative content.

## Mark 3 canon costume fixes — batch 3 promoted; batch 4 in review (2026-09-21)

Dan approved **Principal scribe v3**, now promoted non-destructively. The
turnaround retains black/charcoal as the explicit producer override and adds
the loose sudra, small hand-knotted corner tzitzit, and non-figurative purple
gamma motifs. His v2 remains superseded history.

**Peter** is now in producer review as a standing-reference candidate. It
unifies the clavi-striped tunic, plain narrow waist strap, shoulder-draped
rust mantle, and four proper corner tzitzit. No canon promotion or shot work
has been performed for Peter yet.

## Mark 3 canon costume fixes — batch 4 promoted; batch 5 in review (2026-09-21)

Dan approved **Peter v4**, promoted non-destructively. The standing reference
now consistently carries the clavi-striped tunic, plain waist strap,
shoulder-draped mantle, and four knotted corner tzitzit; other poses and the
close-up remain carried forward. **John son of Zebedee** is in producer review
as a candidate with a short full beard, loose cream sudarium, naturally draped
mantle, and small knotted corner tzitzit. His teal clavi and gamma markings
are deliberately retained.

## Mark 3 canon costume fixes — batch 5 promoted; batch 6 in review (2026-09-21)

Dan approved **John son of Zebedee v4**, promoted non-destructively. The
standing reference adds the beard, loose sudarium, natural mantle drape, and
knotted tzitzit while retaining his teal clavi and gamma motifs. **Crowd
witness (young man)** is now in producer review as a corrected full-turnaround
candidate: indigo clavi, straight neck slit, drop sleeves, small knotted
corner tzitzit, flush flat sash, and period toe-thong sandals. No canon
promotion or shot work has been performed for him yet.

## Mark 3 canon costume fixes — batch 7 promoted; batch 8 in review (2026-09-21)

Dan approved **Man with Withered Hand v2**, promoted non-destructively. The
neutral-standing reference now uses a shoulder-draped mantle, indigo clavi,
knotted corner tzitzit, plain weave, authentic repair placement, and sandals,
while preserving the affected hand; healing-state poses remain carried
forward. The character has no import-manifest entry, so no new one was
invented. **Matthew (Levi)** is now in producer review as a costume-only
standing candidate retaining his approved v5 identity, tablet, and precise
tax-collector manner while adding clavi, a flush sash, period sandals, and
small corner tzitzit to a plain-weave mantle.

## Mark 3 canon costume fixes — batch 6 promoted; batch 7 in review (2026-09-21)

Dan approved **Crowd witness (young man) v3**, promoted non-destructively.
The corrected full turnaround includes indigo clavi, straight neck slit,
drop sleeves, knotted tzitzit, a flush sash, and period sandals. **Man with
Withered Hand** is now in producer review as a standing candidate retaining
his affected hand and identity while correcting the mantle drape, clavi,
corner tzitzit, plain weave, repair placement, and footwear. No canon
promotion or shot work has been performed for him yet.

## Mark 3 canon costume fixes — batches 8–12 promoted (2026-09-21)

Codex continued through the handoff after the log above was written; this
entry catches the log up to what the database actually holds. All promoted
non-destructively, prior versions superseded rather than deleted:

- **Matthew (Levi) v6:** flat plain-weave fabric, solid indigo clavi, corner
  eyelet-tied cords, a narrow leather belt, and supported sandals. Approved
  v5 Papuan identity, tablet/stylus, and other poses carried forward.
- **Scribe (younger, lean) v3:** drapery-style tassels replaced with small
  hand-knotted corner tzitzit. Black fabric, clavi, and gamma markings
  retained per Dan's override.
- **Crowd witness (man, headwrap) v3:** madder-red clavi and gamma corners
  added, waist cord moved off the outer mantle onto the inner tunic only,
  headwrap restyled to drape over the crown.
- **Scribe (older, stout) v3:** tunic and mantle fabric differentiated
  (previously an identical bolt), drop sleeves, gamma corner markings, and a
  head covering added.
- **Bartholomew v4:** V-neck bias binding replaced with a horizontal neck
  slit, clavi and mantle gamma marks added, corner tzitzit added.
- **James son of Alphaeus v4:** same neckline/clavi/gamma/tzitzit set as
  Bartholomew, plus a travel headwrap. Approved face and beard unchanged.
- **Judas Iscariot v4:** clavi, gamma marks, and corner tzitzit added; the
  exterior "Hollywood" money pouch removed, funds implied within the belt
  fold instead.
- **Philip the Apostle v4:** clavi moved from stitched sleeve seams to
  proper shoulder-to-hem weaving, corner tzitzit added, girdle and sandals
  corrected. Approved clean-shaven identity close-up unchanged.

Not reached: **Thomas** (last item in the handoff's batch 12) remains v2,
untouched. Everything below it in the handoff (the three single-issue
crowd characters, Simon the Zealot, Thaddaeus, and the deferred Mark-2
"Friend" characters) is also untouched.

No garment-critic re-audit has run against any of these 15 versions yet —
the canon review page still shows each character's pre-fix severity and
finding text until that's done.

Goal Guardian check: unchanged from the batches-1–2 entry above — canon
identity/costume references only, no shots, media-generation attempts,
voices, or narrative content created.

## Canon pose-consistency repair — candidates in review (2026-09-21)

The approved costume fixes had sometimes been stored only in turnaround
sheets, while production needs a clean single `body_pose`; other older poses
were deliberately carried forward. The shared asset selector now prefers a
newly regenerated asset over a carried-forward sibling in both keyframe and
Gemini-provider paths, without allowing a multi-panel turnaround into shot
generation. Typecheck and the full suite pass (416 tests).

Candidates awaiting Dan's review are in
`HeartWordData/assets/characters/candidates/canon-consistency-repair-2026-09-21/`:

- clean production standing poses for Principal scribe, Crowd witness (young
  man), Scribe (younger, lean), Crowd witness (man, headwrap), and Scribe
  (older, stout), derived from their approved turnaround designs;
- pre-healing and healed arm-stretched poses for Man with Withered Hand,
  matching his corrected standing costume and intended for Mark 3:1–6 state
  continuity.

Nothing in this repair candidate set has been promoted. On approval, each
character receives a new immutable version; Man with Withered Hand will also
receive verse-bounded pre-healing/healed metadata. The remaining named
disciples' seated, teaching, and walking poses follow only after this batch is
reviewed.

The grounded garment critic was run on all seven unpromoted candidates; its
persisted full findings are alongside them as `garment-critic-review.json`.
Principal scribe and Scribe (younger, lean) were assessed `none` (with the
black-fabric producer override supplied). Crowd witness (young man), Crowd
witness (man, headwrap), Scribe (older, stout), and both Man with Withered
Hand state poses were assessed `severe`; none are eligible for promotion
without producer direction or a corrective pass.

## Man with Withered Hand — full state-pose propagation in review (2026-09-21)

At Dan's direction, six additional **unpromoted** production-pose candidates
now provide both narrative states for the neutral-standing, seated-listening,
and walking bodies. They are stored beside the earlier repair candidates:

- `man-with-withered-hand-neutral-standing-pre-healing-r1.png`
- `man-with-withered-hand-neutral-standing-healed-r1.png`
- `man-with-withered-hand-seated-listening-pre-healing-r1.png`
- `man-with-withered-hand-seated-listening-healed-r1.png`
- `man-with-withered-hand-walking-pre-healing-r1.png`
- `man-with-withered-hand-walking-healed-r1.png`

The pre-healing variants explicitly show his contracted left hand (viewer’s
right); the healed variants show that hand restored. These remain candidate
art only: the current canon, prior approvals, and source assets have not been
changed.

## Man with Withered Hand — full state package promoted (2026-09-21)

Dan approved the complete package. **Man with Withered Hand v3** is now the
sole approved version; v1 and v2 are superseded, retained history. It has
eight immutable body-pose references: pre-healing and healed variants of
neutral standing, seated listening, walking, and the hand-stretched pose.
Pre-healing assets are eligible only through Mark 3:4; healed assets start at
Mark 3:5. The two existing hand close-ups are preserved solely as comparison
proofs and cannot enter ordinary generation references.

During promotion verification, the story-state selector was corrected to
accept approved `base_pose` and `story_state_pose` assets while continuing to
exclude `comparison_proof` assets. Direct data validation confirms that every
body reference selected for Mark 3:4 is pre-healing, every one selected for
Mark 3:5 is healed, and every stored file matches its recorded SHA-256 hash.

Goal Guardian check: this finishes the producer-approved character-canon
correction and state-continuity package only. It changes neither media
generation nor the Mark 3 narrative or casting plan.

## Canon standing-pose consistency repair — five approvals promoted (2026-09-21)

Dan approved the reviewed production-standing candidates for **Principal
scribe**, **Crowd witness (young man)**, **Scribe (younger, lean)**, **Crowd
witness (man, headwrap)**, and **Scribe (older, stout)**. Each is now v4;
v3 is superseded, not deleted. Each new version replaces its only stale
single-pose neutral-standing image with the approved clean standing image and
carries its turnaround sheet forward strictly as a design reference.

## Jesus v4 neutral-background repair — candidates in review (2026-09-21)

Jesus’s v4 neutral-standing image already has the reusable neutral studio
backdrop. The v4 seated-listening, teaching, and walking images had rendered
courtyard environments, so three identity-preserving, background-only
candidates now replace those with a flat warm-neutral studio backdrop. They
remain unpromoted at
`HeartWordData/assets/characters/candidates/canon-background-repair-2026-09-21/`;
the outdoor-background v4 images remain canonical until Dan reviews these
candidates.

The grounded garment critic reviewed the three neutral-background candidates
(`garment-critic-review.json` in that candidate directory): teaching was
assessed `none`; seated and walking were assessed `severe`, citing the
already-visible tassel construction, applied-looking trim, patterned fabric,
and sandals. The review concerns costume continuity, not the requested
neutral backgrounds; no candidate was promoted or changed as a consequence.

Two corrective passes then produced r3 seated and walking candidates. They
separate the outer mantle from the inner tunic, put visible fringe on the
mantle, replace the continuous blue border with a corner-only mark, and use
the neutral studio background. The critic's r3 review remains `severe` for
both, primarily on increasingly fine-grained tunic cut, fringe, and sandal
construction; its complete persisted record is `garment-critic-review-r3.json`.
Neither revised image is promoted pending Dan's review.

## Jesus v3 reference package restored as v5 (2026-09-21)

Dan directed that Jesus return to the v3 reference package because v4 did not
maintain the established tassel treatment and introduced courtyard
backgrounds. The complete v3 package is now approved again as immutable
**Jesus v5**: its close-up, neutral-standing, seated-listening, teaching, and
walking references are all reused exactly with new SHA-256 records. Jesus v4
is superseded history, not overwritten; the v4-background repair candidates
remain unpromoted.

## Shared scene-space continuity (2026-09-22)

Dan identified a real Mark 3 Scene 1 failure: the first two approved views
read as one synagogue, while the older third shot made the room look much
smaller and narrower. Existing per-shot `continuity_notes` could preserve an
object or state transition, but could not make a room's scale or geography
persist across angles.

Stage 3 now records a shared `spatial_continuity` plan for each scene
(relative scale, stable anchors, and staging zones) and a `spatial_view` for
every shot (its camera relation to that plan). They are production-design
choices when Scripture and archaeology are silent, not invented Scripture.
Stage 4 includes both in the generation prompt and supplies an earlier
**approved** view of the same scene as a distinct set reference for a later
shot. It is never used as a character reference or a reason to copy people or
framing.

This protects visual continuity even before a producer-approved
archaeological reference packet exists. Such a packet can later sharpen the
Capernaum synagogue reconstruction without replacing the generic control.

Goal Guardian check: this keeps a chapter's approved Scripture-grounded action
and casting intact while making its already-planned setting reviewable and
consistent. It neither invents narrative events nor authorizes media
generation or regeneration on its own.

## Mark 3 Scene 3 Shot 2 — producer-supplied replacement approved (2026-09-22)

Dan approved a replacement keyframe for Mark 3, Scene 3, Shot 2 (Mark
3:14–15). The submitted 1376×768 PNG is retained unchanged as the source
attachment; its accepted production copy is a minimal centered crop to
1365×768 so the keyframe meets HeartWord's required 16:9 aspect ratio. The
new immutable attempt is recorded as `producer_supplied`, status `accepted`,
with provenance and Dan's approval note. The preceding held candidate is
retained as `retry_modified`; no provider call or automated QC was run.

Goal Guardian check: this is a producer-approved replacement for one planned,
source-grounded shot. It does not change Scripture, casting, shot planning, or
any other asset.

## Mark 3 Scene 3 Shots 1 and 3 — revised candidates awaiting review (2026-09-22)

At Dan's direction, two new 1672×941 Codex-image candidates were generated
and imported non-destructively for the mountain-commissioning scene:

- **Shot 1:** retains the elevated mountain-call composition while correcting
  visible Papuan/Hatam casting and increasing the ascending group toward the
  planned roughly thirty followers.
- **Shot 3:** retains Jesus's designation staging while giving John distinct
  teal shoulder accents rather than Jesus's indigo clavi, and separating the
  foreground/background figures into visibly distinct faces and garments.

Both candidates are held for Dan's review; their previous held candidates are
retained as `retry_modified`. No automated QC or approval was inferred.

Goal Guardian check: these are bounded corrective candidates for two existing,
source-grounded shots. They change no Scripture, casting plan, or other shot.

## Mark 3 Scene 3 Shots 1 and 3 — canon-reference correction candidates (2026-09-22)

Dan correctly found that the first replacements still used generic likenesses
for principal disciples. A second replacement candidate for each shot is now
grounded directly in the approved **Jesus v5**, **Peter v4**, **John son of
Zebedee v4**, and **James son of Zebedee v3** reference packages.

- **Shot 1:** Jesus, Peter, John, and James are each visibly distinct within
  the mountain ascent, using their respective approved face, hair, and garment
  signatures rather than generic crowd substitutes.
- **Shot 3:** the four named men are all reference-locked: James retains his
  short coiled hair and madder-marked mantle; John retains his head covering
  and teal clavi; Peter retains his grey beard and rust mantle; Jesus retains
  his established face, hair, and indigo-banded outer mantle.

Both 1672×941 images remain `hold_for_review`; their first regeneration
candidates were retained as `retry_modified`. No automated QC or approval was
inferred.

Goal Guardian check: these targeted candidates restore approved identity and
costume continuity for four existing named characters without changing the
source action, casting plan, or surrounding production.

## Mark 3 Scene 3 Shots 1 and 3 — canon-reference candidates approved (2026-09-22)

Dan approved both reference-locked correction candidates. Shot 1 and Shot 3
are now `keyframe_approved`, and their latest immutable Codex attempts are
`accepted`. Earlier candidates remain retained as revision history. No video
generation, automated QC, Scripture change, or casting-plan change occurred.

Goal Guardian check: this records the producer's approval of two existing
source-grounded keyframes after their named-character identity continuity was
corrected.

## Mark 3 Scene 3 Shot 4 — nine-apostle reference-locked keyframe approved (2026-09-22)

Dan approved a non-destructive replacement keyframe for Mark 3:18–19. The
candidate was built in three sequential identity-preserving passes, locking
three approved Papuan canon references at a time: Andrew/Philip/Bartholomew,
Matthew/Thomas/James son of Alphaeus, then Simon the Zealot/Thaddaeus/Judas
Iscariot. The result keeps all nine apostles face-readable on the established
Galilean mountain slope, with their distinct canon faces, hair, garments, and
Matthew's tablet; Judas has no exterior money pouch. The previous held
Nano Banana candidate is retained as `retry_modified`.

Goal Guardian check: this corrects an existing, source-grounded group shot
without altering the casting plan, Scripture, or scene action. The producer
approved the final keyframe; no video was generated.

## Mark 3 Scene 4 Shot 1 — arrival keyframe approved (2026-09-22)

Dan approved a replacement for Mark 3:20. It changes the staging from a
formal interior teaching circle to the specified arrival moment: Jesus,
Peter, John son of Zebedee, and James son of Zebedee enter the established
Galilean basalt house while an overflowing Papuan/Hatam crowd presses through
the open doorway. The bread table remains blocked and unreachable, visibly
supporting the verse's statement that there was no room even to eat. The four
principals are directly grounded in their approved canon references; the
earlier held candidate is retained as `retry_modified`.

Goal Guardian check: this is a producer-approved correction to the existing
source-grounded shot action and visual canon. It adds no Scripture, alters no
casting plan, and generates no video.

## Lighting readability default (2026-09-23)

Dan directed that dusty, poorly lit rooms be discouraged across HeartWord.
Keyframe prompts now default to clearly readable exposure with generous
motivated ambient light. Natural direction, time of day, and atmosphere remain
intact; a genuinely dark or low-key frame requires a stated story purpose and
must still preserve readable faces and action. Existing approved media is not
silently reopened or regenerated by this policy.

Goal Guardian check: this improves visual legibility for producer review and
finished Scripture films without inventing narrative content or changing an
approved scene's setting, action, or time of day.

## Cinematic staging default (2026-09-23)

Dan directed that HeartWord avoid frames reading as posed, audience-facing
portraits. Keyframe prompts now require story-motivated eyelines, varied poses,
asymmetry, and natural overlap for ordinary shots. The deliberate exception is
a lip-sync performance: its named speaking character may address the lens when
that helps the spoken performance, while every supporting person remains
naturally oriented within the scene.

Goal Guardian check: this preserves readable, source-grounded action and
performance rather than adding events or altering the approved narrative.

## Shot-state fidelity safeguard (2026-09-23)

After a Scene 4 reaction shot repeatedly rendered Jesus entering the house,
Dan directed that HeartWord prevent a visually plausible adjacent event from
replacing the planned moment. Every keyframe prompt now explicitly locks the
shot to its stated causal moment and excludes doorways, thresholds, props, and
composition cues that imply an unstated arrival, departure, crossing, or
confrontation. Automated scene-fidelity review now separately requires exact
action match, so a frame that changes the event cannot pass on setting and
crowd plausibility alone.

Goal Guardian check: this protects the planned, Scripture-grounded action and
does not add narrative content or prescribe new events.

## No-portrait priority over repeated crew gestures (2026-09-23)

Dan confirmed that defensive gestures such as folded arms remain useful, but
must never create an audience-facing group portrait. The final generation
prompt now states the hierarchy after the crew direction: retain gestures as
individual reactions, while requiring varied poses, uneven depth, partial
occlusion, and story-motivated eyelines. Direct camera gaze remains reserved
for the named lip-sync speaker when performance calls for it.

Goal Guardian check: this preserves the crew's emotional intent while keeping
the action legible and cinematic; it adds no narrative event or character act.

## Named-character wardrobe continuity gate (2026-09-23)

Dan identified a close-up of Jesus that passed facial likeness review while
drifting from his approved garment. Canonical likeness review now separately
compares a named character's visible wardrobe to the approved reference:
garment cut and neckline, layers and mantle arrangement, locked color-block,
visible fringe/tassels, and footwear. A material mismatch fails the review;
an obscured wardrobe may remain inconclusive, but a missing or malformed
assessment is held rather than passing silently. The producer retains control
of the approved canon and may approve an intentional canon revision.

Goal Guardian check: this protects the approved Papuan character canon across
independently generated shots without changing Scripture, action, or costume
requirements beyond the producer-approved reference.

## Mark 3 keyframe review complete (2026-09-23)

Dan reviewed and approved every remaining Mark 3 keyframe. The fifteen
previously pending producer decisions across Scenes 1, 2, 4, and 5 are now
recorded as accepted; Scene 2 Shot 3's unexplained canonical-likeness hold was
explicitly overridden after Dan's visual review. All Mark 3 shots are now
`keyframe_approved`; no video generation was started.

Goal Guardian check: this records producer decisions on existing
Scripture-grounded planned shots only. It changes no Scripture, casting plan,
shot action, or media beyond the approval state.

## Draft-room take retention repaired (2026-09-23)

The draft room allowed several held takes for one shot, but the Omni provider
derived every file path from the underlying shot id, so later takes overwrote
earlier ones. Provider-facing draft labels now include the immutable generation
attempt id while the database continues to associate each take with its actual
shot. A focused regression test proves two drafts receive distinct retained
paths. The initial Mark 3 draft batch exposed the defect; overwritten earlier
records were retained as `retry_modified` history, with the newest playable
take kept for review.

Goal Guardian check: this is a bounded media-provenance repair. It preserves
the producer's ability to compare independently generated takes and does not
change Scripture, casting, shot action, or choose any draft automatically.

## Non-speaking draft safeguard (2026-09-23)

Dan's first Mark 3 draft review found invented English speech and Papuan-canon
identity drift in Scene 2's non-speaking crowd shots. Every future draft now
receives an explicit instruction to preserve nonverbal action and background
ambience only, never generate intelligible speech or visible speech performance,
and retain approved Papuan/Hatam identity and wardrobe throughout. The focused
draft-room tests and typecheck pass. Scene 2 Shots 1–3 are retained as rejected
draft history with Dan's corrections; no replacement or final footage was
generated.

Goal Guardian check: this is a narrowly scoped safeguard against provider-added
performance and visual-canon drift in existing non-speaking shots. It changes
neither Scripture nor the planned action, and does not create or select media.

## Natural crowd-motion default (2026-09-23)

Dan approved the revised Veo Lite test for Mark 3 Scene 2 Shot 1: it retains
the approved Papuan identities, ambient-only non-speaking treatment, and
irregular crowd action. Future non-speaking draft and final-video prompts now
require independently timed reactions and explicitly prohibit synchronized arm
waves, repeated group gestures, mirrored motion, and mass reach-and-retract.
Automated video review now assesses that same failure mode. The approved test
clip is the first selected Scene 2 footage; earlier Omni and Veo candidates
remain retained revision history.

Goal Guardian check: this makes crowd motion more natural without adding an
event, altering Scripture, or changing the approved casting and staging plan.

## Mark 3 Scene 1 Shot 4 pause-aligned coverage prepared (2026-09-23)

The approved 14-second Jesus line in Mark 3:4 is planned as three continuous
source-audio beats: 0–6.755 s single-face Jesus lip-sync, 6.755–10.053 s
over-the-shoulder cutaway with his mouth fully hidden, and 10.053–14.000 s
single-face Jesus lip-sync. Both cuts fall within measured pauses in the
13.978-second composite voice line. The final pause remains in the third beat;
speech must not be animated through it. This applies the Shot 3 lesson that
every frame showing Jesus's mouth while he speaks needs audio-driven lip-sync.

Three imagegen still candidates are recorded but held for Dan's approval, not
submitted for video generation. The over-the-shoulder candidate required two
targeted face-diversity revisions and its third version passed automated
visual review. The two close-ups received wardrobe/crowd-density flags that
conflict with the approved Shot 4 keyframe and the intentionally single-face
beat framing; these are documented for producer review, not silently
overridden. No beat image is accepted, no Shot 4 clip is selected, and the
approved shot-level keyframe and source audio remain unchanged.

Goal Guardian check: the coverage adds no dialogue, event, or cast member; it
preserves the source Jesus line, approved scene geography, canon wardrobe, and
producer approval gate. The full suite remains at 437 passing / 1 unrelated
fresh-chapter fixture failure (`media_generation` vs `voice_lipsync`).

## Mark 3 Scene 1 Shot 4 footage held for review (2026-09-23)

Dan approved all three Shot 4 coverage stills. The opening and closing Jesus
beats were generated as separate Kling Avatar image-to-audio performances from
those accepted stills and the unchanged composite Jesus line; the middle
mouth-hidden cutaway was generated with Veo. Their retained source takes are
7.2 s, 4.0 s, and 4.0 s, respectively, covering planned 6.755 s, 3.298 s,
and 3.947 s intervals. All three attempts are held, not selected.

A review-only 14.000-second cut is at
`C:\Users\danbr\HeartWordData\assets\generated\video\review\mark3-scene1-shot4-full-review-r1.mp4`.
It trims the takes to their planned beat intervals, mutes provider audio,
and carries the approved 13.978-second Jesus composite with 22 ms of tail
padding. Advisory video-and-audio QC found no visible mouth, silent-leader,
or continuity concern, but producer playback approval is still required.
No Shot 4 clips have been selected on the timeline.

Goal Guardian check: this is an editorial review artifact, not a new source
line or a change to casting, canon, or shot action. The source recording,
voice binding, accepted stills, and producer decision gate are preserved.

## Shot 4 ending boundary flagged (2026-09-23)

Dan heard an abrupt new utterance at the end of the 14-second Shot 4 review.
Inspection found the approved Jesus composite quiet from 13.029 to 13.834 s,
then a strong new sound in its final 0.144 s. In the original chapter audio,
the next phrase begins around 55.4–55.6 s; the following passthrough segment
starts at 55.733 s already at full speech level. The existing source split
therefore likely assigns the start of the following narration to Jesus and
cuts the next segment in mid-phrase. Its exact language boundary has not
been attested by a Hatam reviewer.

A diagnostic 13.8-second review copy ends inside the quiet gap at
`C:\Users\danbr\HeartWordData\assets\generated\video\review\mark3-scene1-shot4-boundary-check-r2.mp4`.
It is not a selected timeline clip. The original media, approved binding,
coverage intervals, and source map remain unchanged. Before final assembly,
reconcile the source/voice boundary with the following narration so no
syllable is lost or assigned to the wrong speaker.
