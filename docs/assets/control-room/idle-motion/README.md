# Control-room idle motion

No idle-motion asset is active yet. This folder is reserved for optional,
short, silent, private presentation assets for the standalone Agent Control
Room. They are not HeartWord Films media, Scripture-video canon, source audio,
runtime-agent output, or production records. Every card currently remains a
static portrait.

The existing provider refused Mabel's first constrained image-to-video request.
It produced a technically valid Rufus MP4, but visual review rejected it because
the output reframed the portrait and cropped his eyes/head. Those attempts are
not retained as presentation assets, and no substitute or invented animation is
used.

To make a candidate for visual review, use the configured Gemini key locally:

```powershell
npx tsx scripts/generate-control-room-idle-motion.ts rufus
```

The script makes one restrained three-second image-to-video candidate with an
estimated Gemini Omni draft cost of about $0.10. It removes generated audio,
writes `rufus-candidate.mp4` as MP4/H.264 at 360px high with fast-start
metadata, and intentionally has no database, pipeline, or server access. Do
not rename a candidate to an active asset or add it to the page's `clips` list
until its identity, framing, stillness, loop boundary, and card crop have been
visually approved.

The browser-side scheduler is ready for approved local assets and bounds them
to one card at a time, at irregular intervals. It does not load or play clips
when the user requests reduced motion, the tab is hidden, a portrait dialog is
open, or a cast-focus presentation is active.
