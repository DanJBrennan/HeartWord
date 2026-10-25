# Hatam Mark 4 final donor evidence — 2026-10-24

Status: read-only feasibility audit for the isolated language-edition work.
No production database, media, approval row or provider job was changed.

## Producer selection and exact bytes

Dan stated on 2026-10-24 that `Markus-4.mp4` was the final Hatam Mark 4
output and was renamed for easier distribution. This identifies the selected
film. It does not claim that a historical database `heldForReview` field was
updated, or grant field-release approval to a future Meyah edition.

The current registered render is
`deefa536-62f9-41b3-bbac-e9e8fb244206`, project
`8a5659a4-b033-4d5f-80e2-904b217cf8a0`, at
`generated/chapter/Markus-4.mp4`. The file has 13,484 frames at 24 fps,
1280 × 720 H.264 picture, AAC audio and a 561.833 second saved render clock.
Its SHA-256 is
`b207b4c0109d70e85fab40ccb9253e7973c4cd38213333307153d417fda8aa6a`.
The retained `mark4-autonomous-overnight-final-v73-storm-and night-ending.mp4`
has the same SHA-256 and byte length (222,492,777). `Markus-4.zip` contains
only the MP4, not an editable project archive.

## Surviving edit evidence

The v73 database manifest is a historical custom patch recipe over v72. It
records five picture replacements and an ending/music description; its audio
JSON names the v72 mixed program as a base. The full picture and separate
source/cast/music placements are not an executable chapter manifest. The
retained `scratch/claude-takeover/v66` through `v73` scripts and manifests,
the final visual chunks, replacement clips and the ending audio calculation
provide more detail outside that row. These assets require validation on an
isolated copy before they can become a new ordered, editable recipe.

Five retained visual chunks have only video streams. Their decoded frame
counts are 3,106 + 3,498 + 3,386 + 1,483 + 2,011 = **13,484**, exactly
the saved final picture frame count. They are the v68 chunk 0, v72 chunks 1–2,
v71 chunk 3 and v73 chunk 4 named by the saved patch process. This establishes
complete picture coverage at chunk level. A read-only FFmpeg framemd5 decode
compared all 13,484 frames of these five chunks in order against the final
`Markus-4.mp4`: **13,484/13,484 pixel hashes matched**, with no mismatch.
The audit output is disposable local evidence at
`C:/Users/danbr/AppData/Local/Temp/hw-mark4-picture-audit-20261024`.
This proves the final picture can be assembled exactly from retained silent
media; it does not establish shot-level editorial identity or reconstruct the
Hatam soundtrack.

An earlier registered base cut has 161 picture placements pointing to 89
distinct retained assembled files. All 89 files exist and each path maps
unambiguously to one saved generation attempt and shot. Those records preserve
useful verse and speaker context, but later edits changed the cut, so the
earlier placement list cannot simply be labeled as the final timeline.

Read-only preflight of the current final render still holds for four reasons:
the legacy database has no decision linked to that exact render ID; the final
recipe is not normalized; the final shot identities are not present in its
manifest; and the selected speaking voices cannot be pinned until those shots
are identified. The producer's new final-output statement resolves which film
to select. It does not fill in missing edit data or authorize copying a mixed
Hatam soundtrack into Meyah.

The Meyah source document's `6 (4:5)` and `19 (4:18)` entries remain
reference-only questions for source listening review. They are not words to
invent or duplicate.

The managed Meyah Mark 4 recording probes at 805.685 seconds (about 13:26),
versus 561.835 seconds (about 9:22) for the finished Hatam program. Its
recording alone is roughly 244 seconds longer than the entire donor film.
This is a lower bound on the additional target picture clock before target
opening/ending treatment. It is not an automatic instruction to create four
minutes of provider media: actual speech, pauses, safe reuse and new coverage
must be planned from the reviewed target alignment. Slowing words, looping
causal action or reusing mixed Hatam sound is outside the accepted workflow.

## Next isolated check

Represent the now-proven final picture as reviewed shot-level placements using
the five silent chunks and the retained source clips/patch records. Where
individual source-clip lineage remains unresolved, a bounded legacy fallback
could derive silent picture slices from the final MP4; this requires Dan's
product decision because the earlier handoff explicitly excluded the mixed
finished film as a picture stem. The verified chunks are preferable because
they already contain the exact final picture and no Hatam audio.

Any normalized copy must keep the original render and its custom recipe
unchanged, document every derived slice and gap, and prove target source-audio
coverage independently. No real Meyah project, audition or Avatar request was
created by this audit.
