# Hatam Mark 4 final donor evidence — 2026-10-24

Status: read-only media audit plus one exact final-cut attestation in an
ignored isolated database backup. No production database, media or provider
job was changed.

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

The final MP4 and five chunks were copied, without changing their originals,
to the ignored isolated worktree folder
`output/mark4-donor-20261024/assets/legacy-mark4/`. Every copied SHA-256
matched its source:

| Isolated file | SHA-256 |
| --- | --- |
| `Markus-4.mp4` | `b207b4c0109d70e85fab40ccb9253e7973c4cd38213333307153d417fda8aa6a` |
| `chunk00.mp4` | `55dbaa70bdfa4486b25024f89b9b50373d264665c75de43b7df395fa442ad383` |
| `chunk01.mp4` | `fba0150be2fe808ba4d1fe8b08d13f0044571af1c54e6ef37410970322ac40a1` |
| `chunk02.mp4` | `a09b61b53d2cd4176291382d1500d6bc84141a0456771780afffdfffc5568594` |
| `chunk03.mp4` | `e18ef678502c157bc6e13b6279316242c8c9e411ece5d97255935763ab3a9f36` |
| `chunk04.mp4` | `1cc249e80d64b67156d204b92011a6a47d9ce81255cf5b6728f95239543cbd14` |

An earlier registered base cut has 161 picture placements pointing to 89
distinct retained assembled files. All 89 files exist and each path maps
unambiguously to one saved generation attempt and shot. Those records preserve
useful verse and speaker context, but later edits changed the cut, so the
earlier placement list cannot simply be labeled as the final timeline.

The live legacy database has no decision linked to that exact render ID. A
consistent SQLite online backup was saved at
`output/mark4-donor-20261024/db/heartword.sqlite` inside this worktree (ignored
by Git). It passed `PRAGMA quick_check` and foreign-key checking. Only that
copy received a `producer_decision` row, ID
`0574dc9c-e28c-43a5-b670-d818ff3dc030`, binding Dan's final-output
statement to render `deefa536-62f9-41b3-bbac-e9e8fb244206` and the exact
film SHA-256. The row expressly excludes field-release and target-language
approval. Read-only preflight against the copy now recognizes the producer
selection. Its three remaining holds are the unnormalized recipe, absent
final-shot identities and speaking-voice evidence that depends on those
identities. The live database still has zero exact decision rows. The isolated
attestation does not fill in missing edit data or authorize copying a mixed
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
the five silent chunks and the retained source clips/patch records. Dan
authorized making new keyframes and local LTX video where the longer target
recording needs more visual coverage. The verified chunks already contain the
exact final picture without Hatam audio. The historical Hatam soundtrack
recipe remains pinned for provenance, while Meyah source audio supplies the
new timing and words; reconstructing the old mix is not a prerequisite.

Any normalized copy must retain the original custom recipe verbatim as
provenance, document every derived slice and gap, and prove target source-audio
coverage independently. The live render and recipe stay unchanged. No real
Meyah project, audition or Avatar request was created by this audit.

### Isolated final-picture normalization path

`scripts/normalize-mark4-final-donor.ts` is fixed to this checkout's ignored
`output/mark4-donor-20261024` database and asset root. It cannot target the
live database by command-line argument. The exact final MP4 has also been
copied inside that root at its registered `assets/generated/chapter/Markus-4.mp4`
path; the five silent chunks remain at `assets/legacy-mark4/chunk00.mp4`
through `chunk04.mp4`. No plan has been applied yet.

The input is a **human-reviewed** JSON document, not inferred from the old
Hatam timeline:

```json
{
  "schemaVersion": 1,
  "renderId": "deefa536-62f9-41b3-bbac-e9e8fb244206",
  "expectedOriginalTimelineSha256": "a754c96659bdf280de5ec4a4a81f0673864d1d327078d1e002b5f986e75d7ce6",
  "reviewer": "named producer",
  "evidence": "reference to the reviewed final-picture shot map",
  "placements": [
    {"shotId":"retained donor shot ID","startFrame":0,"endFrame":123,"reason":"visual and Scripture correspondence"}
  ]
}
```

The example placement is incomplete and cannot be applied. A real plan must
cover every frame 0–13,483 in order, split at each five-chunk boundary, name a
retained donor shot and explain the correspondence. The utility verifies exact
film/chunk hashes, video-only streams and frame counts, accepted donor
keyframes, the isolated producer decision, and gap-free placement. It retains
the old recipe verbatim in an append-only command before storing the normalized
timeline in the **isolated copy** and linking imported silent chunks to donor
shots as zero-cost historical media. The original live manifest is not changed.
Run `npx tsx scripts/normalize-mark4-final-donor.ts <reviewed-plan.json>` only
after the reviewed map and its required isolated assets are complete.

For comparison during that review, the isolated
`review/earlier-cut-shot-inventory-NOT-FINAL.tsv` lists all 161 placements in
the older registered base cut with each uniquely linked donor shot, action and
verse when present. It is a reference for finding candidates, not a final-cut
map: v66–v73 changed timing and replaced pictures after that base render.
A read-only 4 fps, 32 × 18 grayscale frame comparison against that earlier
film was retained as `review/final-to-earlier-cut-visual-matches-CANDIDATE.tsv`.
Only 233 of 2,247 final samples reached correlation 0.85; the median best
match was 0.528. Grading, different cuts and repeated visual motifs make the
nearest-frame match too weak to promote to a shot identity automatically. The
candidate sheet is search aid only and was not fed to the normalizer.
