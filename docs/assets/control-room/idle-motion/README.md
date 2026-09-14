# Control-room idle motion

`rufus.mp4` is the one active, short, silent, private presentation asset for
the standalone Agent Control Room. It was generated from
`rufus-motion-safe-source-v1.png`, then passed visual review for stable wide
framing, full head/shoulder clearance, preserved illustrated identity, and
unchanged props. These assets are not HeartWord Films media, Scripture-video
canon, source audio, runtime-agent output, or production records. Every other
card remains a static portrait.

The existing provider refused Mabel's first constrained image-to-video request
and its one permitted retry from `mabel-motion-safe-source-v1.png`, so Mabel
intentionally remains static. The original Rufus attempt was rejected because
it reframed the portrait and cropped his eyes/head; that output was removed.
No substitute or invented animation is used.

To make a candidate for visual review, use the configured Gemini key locally:

```powershell
npx tsx scripts/generate-control-room-idle-motion.ts rufus
```

The script makes one restrained three-second image-to-video candidate per named
source with an estimated Gemini Omni draft cost of about $0.10 each. It removes
generated audio, writes a named `*-candidate-v1.mp4` as MP4/H.264 at 360px high
with fast-start metadata, and intentionally has no database, pipeline, or
server access. It continues to any separately named source after a provider
refusal but never retries a source or switches providers. Do not rename a
candidate to an active asset or add it to the page's `clips` list until its
identity, framing, stillness, loop boundary, and card crop have been visually
approved.

The browser-side scheduler is ready for approved local assets and bounds them
to one card at a time, at irregular intervals. It does not load or play clips
when the user requests reduced motion, the tab is hidden, a portrait dialog is
open, or a cast-focus presentation is active.
