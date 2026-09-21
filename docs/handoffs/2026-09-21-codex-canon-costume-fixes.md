# Codex handoff — Mark 3 canon costume fixes

**Date:** 2026-09-21
**Purpose:** work through the canon garment critic's findings (full audit run
2026-09-21, see `docs/plans/CURRENT_GOAL.md`) and correct the flagged
characters' reference art. This is a handoff for the Canon Builder's existing
promotion workflow, not authorization to touch shot planning, media
generation, or anything outside `characters` / `character_versions` /
`character_assets`.

**Time-boxed.** You have very little usage before 9pm tonight. The batches
below are ordered by production impact (Mark 3 shot count × how many issues
are open), cheapest and highest-impact first, so if you only get through
Batch 1 or 2 that is real, committed progress — do not try to rush through
the whole list. Stop at any batch boundary; each is independently promotable
and committable.

## Dan's two explicit overrides — do not "fix" these

1. **Leave Jesus's hair alone.** The critic flagged "shoulder-length hair" as
   historically inaccurate and recommended trimming it shorter. Dan wants
   Jesus's hair kept as-is. Apply Jesus's other two fixes (Batch 1) but skip
   the hair note entirely.
2. **Keep both scribes' fabric black.** The critic flagged the jet-black
   tunic/mantle on *Principal scribe* and *Scribe (younger, lean)* as
   historically wrong (black = mourning attire; scribes should read
   off-white/cream) and recommended recoloring to natural wool. Dan wants
   the fabric to stay black. Apply each scribe's other fixes but skip the
   color-scheme recommendation.

Aside from those two, Dan is open to the recommendations — accept them as
written, including secondary issues beyond the four categories he named
(tzitzit, sandals, V-neck, clavi/gamma): drape, belting, sleeve cut, footwear,
headwear, and beard/grooming notes are all in scope where flagged.

## Workflow (same as the existing `scripts/character-tool/promote-*.ts`
pattern — read `promote-garment-fixes-3.ts` and `promote-thomas.ts` for two
real examples before starting)

1. Generate a corrected reference image (or images — usually just the
   motion-neutral-standing pose per the existing batches' documented
   limitation; regenerate more poses only if you have budget left) per
   character, addressing every fix bullet below **except** the two overrides.
2. Save candidates under
   `HeartWordData/assets/characters/candidates/<some-batch-name>/`.
3. Write (or extend) a `scripts/character-tool/promote-*.ts` script: bump
   `version_label`, copy the candidate into the canonical asset path, insert
   the new `character_versions` row, mark the prior version superseded (never
   delete it), record `character_assets` rows with SHA-256 hashes. Follow
   `import-manifest.json` conventions already used by prior promotions.
4. In each script's own comment, name exactly which fixes you addressed and
   which pose(s) were regenerated vs. carried forward unchanged — the prior
   batches are strict about this, and the canon review page (below) reads
   this history.
5. After promoting a batch, optionally re-run the audit on just those
   characters (or the full canon — full cost was $0.40 for all 32 on
   2026-09-21) to confirm severity dropped. `auditCanonGarments` writes both
   the `review_notes` row and a `cost_ledger_entries` row automatically.
6. Check your work at `GET /api/projects/0b386bfc-7919-4f40-91af-e198508a8267/canon-review`
   — bookmarkable, always current, shows exactly which images the critic
   read and the full finding text per character.
7. Update `docs/plans/CURRENT_GOAL.md` with what you completed and commit.
   Do not touch `generation_attempts` / media generation — Mark 3 has not
   been authorized for spend yet.

---

## Batch 1 — Jesus (23 of 30 Mark 3 shots; moderate; 2 fixes, hair excluded)

Highest blast radius in the chapter, and the cheapest fix — the tzitzit,
clavi, and gamma motifs on the current v3 are already correct.

- Clean up the frayed/raw hem and sleeve cuffs into finished woven edges —
  ancient looms produced selvedge edges, not the "gritty rustic" frayed trope.
- Replace the ankle-wrapping "gladiator" sandal straps with a simple
  1st-century single-strap sandal (sole anchored at instep and heel tab, no
  multi-turn leg wrapping).
- **Skip:** the hair-length recommendation. Leave hair as-is.

## Batch 2 — Crowd witness (stern man, spokesperson) (8 shots; moderate)

- Add clavi: two dark vertical woven stripes (madder-red, dark brown, or
  indigo) down the plain brown tunic. Tzitzit are already correct — no
  change needed there.
- Secondary (apply if budget allows): shorten the tunic sleeves to
  elbow-length drop-sleeves (currently anachronistic long wrist-length set-in
  sleeves); move the leather belt so it cinches only the inner tunic, not the
  outer mantle; add a full beard (currently clean-shaven/light stubble).

## Batch 3 — Principal scribe (7 shots; severe; color excluded)

- Refine tzitzit from thick upholstery-tassel styling to simple hand-knotted
  wool corner fringes.
- Replace the embroidered four-legged animal figure on the mantle with an
  authentic purple Γ (gamma) motif or notched corner band — animal imagery is
  a hard aniconism violation for a scribe, not a style note.
- Add a head covering (*sudra*/cloth wrap) — currently bareheaded.
- **Skip:** the black-to-cream color recommendation. Keep the fabric black.

## Batch 4 — Peter (5 shots; severe)

- The two reference images conflict and must be unified: keep the
  clavi-striped tunic from Image 1 (historically correct), discard the plain
  tunic from Image 2, and standardize one waist belt across all images
  (currently a broad wrapped sash in one image, a narrow belt in the other).
- Replace the unwoven warp fringe with proper four-corner knotted tzitzit
  (a dark blue *tekhelet* thread is a nice-to-have, not required).
- Fix the mantle drape: it currently wraps around the hips like a Roman toga;
  it should drape over one or both shoulders like a Jewish *tallit*/*me'il*.

## Batch 5 — John son of Zebedee (5 shots; moderate)

- Restyle the tassels from thick beaded/curtain-fringe tassels to authentic
  hand-knotted woolen cords. Clavi and gamma motifs are already excellent —
  no change needed there.
- Add a full beard — currently clean-shaven, a significant error for a
  Galilean Jewish disciple (Leviticus 19:27 grooming norm).
- Add a head covering — currently bareheaded outdoors.
- Loosen the mantle drape so it hangs as an organic wrapped rectangle rather
  than a rigid tailored tabard/apron.

## Batch 6 — Crowd witness (young man) (4 shots; severe)

- Replace the modern buckled Birkenstock-style slide sandals with a
  multi-strap toe-thong leather sandal.
- Add clavi: two narrow madder-red or dark indigo vertical stripes on the
  currently-plain off-white tunic.
- Replace the loose unknotted threads with proper knotted four-corner
  tzitzit.
- Secondary: replace the tailored keyhole neckline and set-in sleeves with a
  simple horizontal neck slit and unshaped drop-shoulder sleeves; replace the
  braided rope belt with a flat woven cloth sash or plain leather strap.

## Batch 7 — Man with Withered Hand (4 shots; severe)

- Replace the continuous raw-fringe shawl edge with proper four-corner
  knotted tzitzit.
- Add clavi (vertical madder-red or indigo stripes) to give the outer
  garment period-appropriate ornamentation.
- Replace the damask/jacquard-textured fabric with plain-weave or twill
  texture — machine-patterned fabric didn't exist in this era.
- Fix the drape: currently hangs open like a modern scarf/cardigan; should
  wrap the torso and drape over one shoulder like a proper mantle.
- Add sandals — currently barefoot, atypical for a man in a public/synagogue
  setting.
- Secondary: replace the isolated circular "distress" holes with
  seam/hem-area wear and patching, which reads more authentically.

## Batch 8 — Matthew (Levi) (3 shots; severe)

- Add four-corner knotted tzitzit to the outer wrap — currently only has
  warp fringe with no actual corner tassels.
- Add clavi (purple, dark blue, or reddish-brown vertical stripes) to the
  currently-plain tunic.
- Replace the modern jacquard/embossed cloak texture with plain-weave or
  twill wool.
- Replace the modern buckled open-toe sandals with a single-toe-thong,
  multi-layer sole sandal.
- Replace the narrow modern belt with a wide woven cloth sash or plain
  leather band (no long dangling tail).
- Secondary: replace fitted/set-in sleeves with natural drop-shoulder
  sleeves; the wax-tablet stylus prop is a very minor/optional fix (give it a
  flat spatula end like a real Roman *stilus*) — skip if short on time.

## Batch 9 — Scribe (younger, lean) (3 shots; severe; color excluded)

- Only one real fix needed: scale the tassels down from thick
  drapery-tie-back styling to simple hand-knotted wool threads. Clavi and
  gamma corner markings are already correct.
- **Skip:** the black-to-cream color recommendation. Keep the fabric black.

## Batch 10 — Crowd witness (man, headwrap) (3 shots; moderate)

- Add clavi (madder-red or purple woven bands) and notched gamma corner
  marks to the currently-plain mantle. Tzitzit are already correct.
- Un-belt the outer mantle from the waist cord — the belt should cinch only
  the inner tunic; the mantle should hang loose.
- Restyle the headwrap: currently wound tight around the throat like a
  modern cowl/*shemagh*; should drape flat over the crown, held by a loose
  cord.

## Batch 11 — Scribe (older, stout) (3 shots; moderate)

- Replace the narrow tailored set-in sleeves with wide natural drop-shoulder
  sleeves.
- De-match the tunic and mantle — they currently share one identical
  charcoal fabric bolt, which reads as a modern matching suit. Differentiate
  them (e.g. natural/undyed tunic against the dark mantle) while keeping the
  mantle's own color as-is otherwise.
- Add notched/gamma corner markings to the currently-plain charcoal mantle.
- Add a head covering — currently bareheaded. Tzitzit and clavi are already
  correct.

## Batch 12 — the five one-shot severes (Bartholomew, James son of Alphaeus,
Judas Iscariot, Philip the Apostle, Thomas)

Lower total impact (1 Mark 3 shot each) but each is a hard severe. Do these
last if time allows; each is self-contained.

**Bartholomew:**
- Add four-corner knotted tzitzit — currently missing entirely.
- Remove the anachronistic V-neck bias-tape neckline; replace with a plain
  horizontal woven slit.
- Add clavi (madder-red or dark indigo) and gamma/notch corner motifs to the
  currently-plain mantle.
- Secondary: replace the narrow tailed belt with a wide woven sash; replace
  set-in sleeves with natural drop-shoulder sleeves.

**James son of Alphaeus:**
- Add four-corner knotted tzitzit — currently missing entirely (a "major
  omission" per the critic).
- Add clavi and gamma corner weaves to the currently-plain beige fabric.
- Replace the keyhole/V-notch neckline with a simple straight horizontal
  slit; replace narrow set-in sleeves with wide natural drop-shoulder
  sleeves.
- Secondary: add a head wrap for outdoor travel (currently bareheaded).

**Judas Iscariot:**
- Add four-corner knotted tzitzit — currently missing entirely.
- Add clavi (madder-red or dark stripes) to the currently-plain green tunic,
  and gamma/notch corner markings to the mantle.
- Replace the dangling exterior "Hollywood" money pouch with coins tucked
  into a belt fold, per Matthew 10:9/Mark 6:8 — no visible exterior purse.
- Secondary: add a head covering (currently bareheaded); replace the wide
  tailed belt with a plain woven sash.

**Philip the Apostle:**
- Replace the continuous pom-pom hem fringe with four distinct knotted
  corner tzitzit.
- Move the clavi from stitched armhole/sleeve seams to two continuous
  woven lines running from shoulder to hem (an "implementation defect," not
  a concept error — clavi are already the right idea).
- Replace the wide wrapped "cummerbund" sash with a narrow leather strap or
  thin cord girdle.
- Replace the modern cross-strap sandals with a toe-loop/thong sandal
  construction.
- Secondary: replace tailored inset sleeves with natural drop-shoulder
  sleeves; soften the modern barbershop haircut/beard-edge styling.

**Thomas:**
- Replace the curtain-pom-pom tassel row with four proper knotted corner
  tzitzit (gamma marks on the mantle are already authentic — keep them).
- Fix the clavi: both stripes belong on the tunic, symmetric, one per
  shoulder — currently asymmetric in one reference image and incorrectly
  placed onto the mantle in another. Remove any clavus from the mantle
  entirely.
- Replace the keyhole/V-notch neckline with a simple straight horizontal
  slit.
- Replace the modern flip-flop-style sandals with a multi-layer ox-hide sole
  and cross-ankle thong construction.
- Secondary: restyle the modern dreadlocks to a simpler period-appropriate
  cut (this is not the Jesus-hair override — Thomas's hair is open to
  change).

---

## Lower priority — small single-issue fixes (1 Mark 3 shot each)

Do these opportunistically if time remains after Batch 1–12; each is a single
narrow fix.

- **Crowd witness (woman with child):** replace the modern
  Birkenstock-style slide sandals (both figures) with period-accurate
  strap sandals.
- **Crowd witness (young woman):** replace the modern keyhole neckline and
  tailored set-in sleeves with a straight horizontal neck slit and natural
  drop-shoulder sleeves. Sandals and fabric tone are already fine.
- **Crowd witness (older woman, rust headscarf):** genuinely optional — the
  critic itself says plain undyed wool is "entirely plausible" for a crowd
  witness. Add clavi or gammadia only if you want additional visual
  distinction; skip otherwise.

## Minor severity — skip unless all else is done

- **Simon the Zealot:** the only note is a decorative headband being a
  cinematic trope rather than a historical practice (bareheaded or a
  *sudarium* would be more accurate). Very low priority.
- **Thaddaeus (Jude):** refine the tassels from bulky curtain-tassel styling
  to knotted threads, and confirm the underlying model has both tunic clavi
  (one is currently obscured/possibly missing on the far side). Very low
  priority.

## Explicitly out of scope for this handoff

- **Friend 1–4 and Healed paralytic** (all severe, all missing clavi): these
  are old v1 Mark 2 assets currently cast into **zero** Mark 3 shots. Real
  defects, but not blocking anything right now — leave them for a future
  pass unless Dan says otherwise.
- Anything in `generation_attempts` / media generation. Mark 3 has 0 spend so
  far and stays that way until Dan explicitly authorizes it.
- Voice mapping, scene breakdown, or shot casting — canon art only.
