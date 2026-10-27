# Meyah Mark 4:38 Peter face-targeted take

Dan approved the version-3 Peter keyframe, which shows Peter looking toward
the sleeping Jesus in the storm, and authorized his approved mapped voice for
the 4:38 quotation. The isolated target shot is
`5b3d1b76-e839-45c6-8067-676a5002d623`; its reviewed source speech is
746.695–754.976 s (8.281 s). The selected cast clip is 8.266 s.

The retained Kling v2.6 Pro image-to-video base is attempt
`e54a8e1d-31e5-479c-b088-0067b1f63fe1`, task
`943912530055934563`, SHA256
`965c34bc6281b438d5f52cc7a2b103c09440d9e89c4821c131e5db85a1cffd6e`.
Kling identified two actual faces. Its retained thumbnail for face `0` is
Peter; face `1` is Jesus. Codex inspected the first 8.281 seconds of the base:
Peter stays close to camera, reaches toward Jesus, and Jesus remains asleep.
The face thumbnails, contact, selection rationale, and exact base task are in
`output/mark4-donor-20261024/review/meyah-mark4-peter-v38-face-review-20261027/`.

The face-targeted Kling audio2video result is attempt
`4f69296f-7b8c-476f-b276-e6f1b9f3449b`, task
`943914559809665778`, SHA256
`adff513613436eb14d8755c3d3fa3147ee57ec33ad2b98f6e6aef8a1b5db14f2`.
It is 9.967 s long. Codex reviewed a one-second picture contact over the
needed 8.281 s: Peter's mouth shape changes during the line; the two faces,
costumes and storm composition hold; Jesus's eyes remain closed. Decoded
Kling audio and the approved Meyah Peter cast audio were compared at 8 kHz
over the first 8.266 s. The best lag was **0 ms** and normalized signal
correlation was **0.99931**, confirming that the returned audio uses the
approved performance without an audible-timing shift. The contact is retained
at `output/mark4-donor-20261024/review/meyah-mark4-peter-v38-sync-contact-20261027/contact.jpg`.

Codex selected only the source-bound 8.281-second clip through the normal
`acceptLipSyncCandidate` gate, recording the review as Codex editorial QC
under Dan's delegation of routine visual decisions. The clip ID is
`5afc868f-e9de-4c28-af38-6a6c6b60bc16`. The raw base, full lip-sync
result, source audio, face thumbnails, sidecars, pre-submission and
preselection SQLite backups, reservations, charges, and review notes remain
in the isolated Meyah data root. No live HeartWord database or Mark 5 Prep
state was opened.
