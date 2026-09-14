# Control-room idle motion

`rufus.mp4` and `pippa.mp4` are the active, short, silent, private presentation
assets for the standalone Agent Control Room. Rufus was generated from
`rufus-motion-safe-source-v1.png`, then passed visual review for stable wide
framing, full head/shoulder clearance, preserved illustrated identity, and
unchanged props. These assets are not HeartWord Films media, Scripture-video
canon, source audio, runtime-agent output, or production records. Every other
card remains a static portrait. Pippa was generated at 360p with Gemini Omni
1.1's two-image interpolation request, using
`pippa-motion-safe-source-v1.png` as both first and final frame. It passed
identity/framing inspection and repeated control-room browser-loop review with
no visible boundary jump.

The producer-authorized Omni batch subsequently approved matching 360p,
same-first-and-last-frame clips for Gus, Vera, Orion, June, Leon, Tessa, Arlo,
Nell, Sam, Miriam, Dottie, Kit, Benny, Ada, Theo, and Cora. Each has a
non-destructive wide source, one silent locked-camera Omni attempt, and paired
first/last-frame review before entering the same one-at-a-time scheduler.
Mabel, Gene Siskel, and Roger Ebert remain static: their one batch attempt was
blocked by the provider, with no retry or substitute. The durable per-person
record is [`batch-ledger.json`](batch-ledger.json).

The existing provider refused Mabel's first constrained image-to-video request
and its one permitted retry from `mabel-motion-safe-source-v1.png`, so Mabel
intentionally remains static. The original Rufus attempt was rejected because
it reframed the portrait and cropped his eyes/head; that output was removed.
No substitute or invented animation is used.

On 2026-09-14, the bounded Veo 3.1 loop-closure attempt supplied
`rufus-motion-safe-source-v1.png` as both the first and last frame for an
eight-second, silent, locked-camera Rufus candidate. Veo's audio processing
filtered that single request before it produced any video. No retry was made,
no provider was changed, and `rufus.mp4` remains the active approved fallback.
`scripts/generate-rufus-loop-closure.ts` preserves that policy: it can only
write a separately named candidate for visual review and has no pipeline,
database, or server access.

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
open, or a cast-focus presentation is active. Before beginning each new clip,
it removes every residual idle-motion overlay and active marker, so a stale
presentation preview cannot overlap a scheduled card.
