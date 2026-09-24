# Capernaum synagogue exterior location candidate

Dan requested an outdoor view of the Capernaum synagogue in Jesus's time,
using Nano Banana Pro, then asked for corrected first-century doors. The
current 16:9 PNG candidate is
`HeartWordData/assets/generated/keyframes/capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r4-pivot-doors-16x9.png`.
It is a **location-reference candidate**, not a selected shot or a replacement
for any approved Mark 3 timeline media.

The first generation (`...-r1.png`) showed a low, small building that could
not plausibly contain the approved Scene 1 synagogue interior. The second
Nano Banana Pro generation (`gemini-3-pro-image`) used that approved interior
keyframe as a set reference, specifically for room scale, roof height,
basalt masonry, high daylight openings, and doorway construction — not for
its people. The 1376×768 provider image was center-cropped to 1365×768 for
the project's 16:9 video framing. The exact final prompt is retained in
`scripts/generate-capernaum-synagogue-exterior.ts`; a JSON sidecar beside
each raw provider result records its model and estimated cost. The provider
returned JPEG-encoded bytes despite its `.png` filename; the cropped final
is an actual PNG.

Dan then flagged the second candidate's modern-looking main door leaves.
Nano Banana Pro's first targeted door edit (`...-r3-pivot-doors.png`) removed
the diagonal bracing but invented a freestanding pivot post out in the path;
it is retained as a rejected attempt. The narrower second edit is
`HeartWordData/assets/generated/keyframes/capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r4-pivot-doors-16x9.png`.
It keeps the established building and view, with plain vertical-plank leaves,
no visible diagonal braces or metal hinges, and discreet outer-jamb pivots
rather than an exposed post. The exact edit instruction and raw provider
result are retained in `scripts/revise-capernaum-synagogue-doors.ts` and the
revision's JSON sidecar. This is still a location-reference candidate,
not a timeline selection.

The dark-basalt public-building treatment follows the first-century basalt
remains and local construction, while deliberately excluding the ornate
white-limestone synagogue that belongs to the much later Byzantine phase.
The first-century facade is not archaeologically established in detail, so
the image is a plausible production reconstruction, not a claim of an exact
historical elevation. The revised main doorway follows the project's
pivot-peg construction rule; the earlier r2 doorway did not pass that check.

References:

- [Custodia di Terra Santa's Capernaum excavation summary](https://www.custodia.org/en/sanctuaries/capernaum/)
- [Nazareth Village's first-century synagogue entrance reconstruction](https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/entrance/)
