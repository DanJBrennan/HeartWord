# Canonical Characters

## Why

Every character (Jesus, disciples, recurring figures) needs to look consistent
across scenes and across chapters, and needs to look like the community the
production is made for — not a generic or default AI rendering. This is a
reusable asset library, built once per target community, that both the
Illustrated Scripture lane (see `docs/design/illustrated-scripture.md`) and
the video/casting stage draw from.

## What a canon character is

- A named, reusable character definition (appearance, build, distinguishing
  features) that can be referenced by the casting stage for any scene.
- Culturally appropriate to the target community — e.g. Hatam/Papuan (Melanesian
  Arfak highland) casting for Hatam-speaking viewers, rather than a default/
  generic style. Visual style should be settled per community.
- Stable enough to survive many scenes/chapters without drifting in
  appearance.
- Built via the Character Creation & Editing Tool described in
  `docs/PRODUCT_VISION.md`: a headshot, multiple body/pose images, voice
  mapping with live audio test, and an AI-suggested starting description.

## Recognition Hierarchy

A recurring character must stay recognizable across many independently
generated shots, without relying on a name label anywhere in the artwork
(HeartWord never places character-name text in generated media — see
Scripture and Language Principles in `docs/PRODUCT_VISION.md`). A prior
attempt at this project's illustrated canon converged on a clear ordering of
identity cues, strongest first:

1. **Silhouette first: stable face, hair, and beard shape.** This carries
   most of the recognition weight, especially in a crowd or a wide shot.
2. **Stable age, body build, and posture.**
3. **A stable robe/clothing color-block and drape** — a consistent "color
   language" per character.
4. **At most one restrained, period-appropriate accessory** — an accessory
   supports recognition but must never be the only thing carrying it, and
   must not be swapped between characters.

Locking these traits per character (and recording them on the character
record, not just implied by a reference image) is what lets a generation
provider — or a different provider later — reproduce the same character
consistently. A character record should make it easy to see, at a glance,
which traits are locked.

## Naming and Identity Safety

Several New Testament names are shared by multiple distinct people. A canon
character record must resolve to one precise, disambiguated identity, and
prompts, filenames, and notes should always use the precise form rather than
the bare name. Known confusion pairs to disambiguate explicitly include:

- John son of Zebedee vs. John the Baptist vs. John Mark
- James son of Zebedee vs. James son of Alphaeus vs. James brother of Jesus
- Philip the Apostle vs. Philip the Evangelist
- Ananias husband of Sapphira vs. Ananias of Damascus vs. Ananias the high
  priest
- Herod the Great vs. Herod Antipas vs. Herod Agrippa I vs. Agrippa II
- Mary mother of Jesus vs. Mary Magdalene vs. Mary of Bethany vs. Mary mother
  of James vs. Salome vs. an unnamed woman who should not be conflated with
  any of them

This list should grow as new books are produced, rather than being treated as
complete.

## Evolving a Character Without Losing Continuity

Character canon should improve over time (a better reference sheet, a
corrected likeness) without silently breaking continuity with everything
already produced against the old version. The workflow that worked
previously:

1. Generate a candidate revision (e.g. "v2") alongside the current canon
   asset. Never overwrite the canon asset in place.
2. Review the candidate side by side against the original against explicit
   criteria (does it read as the intended community rather than drifting
   toward a generic default; did role/identity clarity survive; is age/
   gender/role variety preserved where relevant).
3. Only promote a candidate to be the preferred asset once it clearly passes
   review. A promotion is recorded as a decision (old asset -> new preferred
   asset), not a deletion — both remain available for comparison and
   rollback, and existing approved shots are not force-regenerated just
   because canon moved forward.

## Open questions

- How character reference assets are stored/versioned so media generation can
  pull a consistent likeness scene after scene.
- How new communities/languages bootstrap their own character library without
  starting from zero each time (shared rigs/bases vs. fully bespoke per
  community).
- How the Illustrated Scripture canon and the video canon relate: the prior
  attempt treated illustrated/comic characters as the primary, first-approved
  identity and treated video characters (realistic) as a derived translation
  of that same semi-realistic illustrated identity that must not redesign it and
  must retain a provenance link back to it. Whether HeartWord keeps that same
  direction, or unifies the two into one canon, is an open decision — see
  `docs/design/illustrated-scripture.md`.

## Related

- `docs/design/media-generation.md` — how a cast character actually gets
  rendered into a scene.
- `docs/design/illustrated-scripture.md` — the comic/illustrated-Scripture
  lane's character and lettering strategy.
