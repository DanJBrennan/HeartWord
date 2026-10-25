# Meyah Mark 4 source-row reconciliation candidate

Status: **read-only proposal; no source rows changed**. This uses the retained
40-entry Gemini-based verse navigation manifest (hash
`ad61775feba7e8f8d65f9914cf6d47b1ca58385a728cdbcaf4bddcc85c60ad4c`)
for contiguous approximate verse groups. The source hash is
`7947e9038f1cc0e74df68d934b0dbeba271a2ea27481165021ae207b2751b2c6`;
the current original-row alignment hash is
`c01572ecb92dde388500c31bab5613df600a0b8bb832deb74a8aa35fe8966217`.
The separately verified 13-entry speech manifest carries the precise voice
cutoffs. Internal verse edges remain navigation aids, as Dan requested.

The 40 proposed rows would cover the source from 0 through 805.685 seconds.
The listening PCM ends at 805.668 seconds; the final 17 milliseconds of the
original recording remain in the last source row. The spoken heading remains
its own 0–4.094-second interval. The published reference-only markers after
4:5 and 4:18 receive no invented audio rows or words.

Start with the manifest's contiguous row map and revise only these boundaries:

| Boundary after | Manifest (s) | Candidate (s) | Evidence |
| --- | ---: | ---: | --- |
| 4:5 → 4:7 | 94.734 | 92.729 | Midpoint between Dan's v5 last word (92.504) and v7 first word (92.954); printed v6 marker is unspoken. |
| 4:7 → 4:8 | 112.530 | 109.580 | Dan's verified v7 end; Gemini's v7–8 phrase spans both verses, so the navigation edge remains approximate. |
| 4:14 → 4:15 | 276.911 | 278.515 | Midpoint between Dan's verified v14 end (278.194) and first v15 Gemini anchor (278.835). |
| 4:33 → 4:34 | 648.195 | 651.038 | Midpoint between Dan's verified v33 end (650.718) and first v34 Gemini anchor (651.358). |
| 4:36 → 4:37 | 700.844 | 702.410 | Midpoint between Dan's verified v36 end (702.203) and v37 start (702.617). |
| 4:38 → 4:39 | 751.776 | 755.248 | Midpoint between the verified disciples quote end (754.976) and narrator-only v39 start (755.519). |
| 4:39 → 4:40 | 774.886 | 776.241 | Midpoint between the reviewed narrated passage end (775.486) and first v40 Gemini anchor (776.996). |

The proposed boundaries contain all 12 currently verified verse-archive
windows within their named rows. The 4:38 *archive* window covers only the
disciples' quote, while the proposed 4:38 *row* also retains its narrator
lead-in. The 4:39 row remains original narration. The v21–23 and v24–25
Jesus windows are one continuous voice performance across their verse edge.

Application needs an inspectable before/after source-row record, an isolated
backup, and a review-manifest bridge so Dan's saved WAVs, revision history,
v39 narrator decision, and targeted word answers remain readable after the
alignment hash changes. Do not use ordinary re-ingestion: it would clear
project QC notes in the current implementation. This proposal does not attest
the whole chapter, cast a voice, select target shots, or spend provider credits.
