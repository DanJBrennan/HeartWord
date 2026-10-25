# Retained Mark 4 picture handles for the Meyah edition

Read-only audit of accepted, non-speaking donor video takes. The isolated
database was queried for the final-picture shot IDs and accepted video
attempts; 59 distinct candidate files were probed from the existing
`C:/Users/danbr/HeartWordData/assets` media folder without changing that
database. All 59 files were readable. The fixed-root
`scripts/stage-isolated-mark4-meyah-picture-handles.py` then copied their exact
bytes into the isolated managed asset root and verified SHA256 on both sides.
Its receipt is `output/mark4-donor-20261024/review/mark4-meyah-picture-handles.json`
(SHA256 `59a957c7f42f731a53ad1f086ae9498fb997297a58d7306abc174c34f021ed21`).
It lists 59 files, 60 accepted attempt candidates and 388,590,158 staged
bytes. These takes have **not** been reviewed for new trims.

| Scene | Longer Meyah source than donor cut | Non-speaking donor shots | Shots with separate accepted takes | One-take candidate surplus |
| --- | ---: | ---: | ---: | ---: |
| 1 | 23.9 s | 16 | 10 | 29.2 s |
| 2 | 34.5 s | 7 | 6 | 6.6 s |
| 3 | 69.4 s | 12 | 11 | 9.5 s |
| 4 | 57.5 s | 6 | 5 | 13.2 s |
| 5 | 36.5 s | 5 | 5 | 13.6 s |
| 6 | 10.8 s | 10 | 7 | 16.4 s |
| 7 | 11.2 s | 15 | 14 | 16.5 s |

For each unique non-speaking shot, “candidate extra” is the positive part of
the longest accepted take's probed duration minus that shot's total duration
in the final Hatam picture. A repeated shot is counted once. This is a
**rough one-take comparison**, not an approved edit or an exhaustive footage
limit: the longer portion might not be continuous, scene-correct, visually
acceptable, or available after the selected in/out point. Other accepted
takes or fresh Meyah Avatar footage may add picture. The comparison signals
that scenes 2–5 need particular shot-level attention, because their source
duration increase greatly exceeds this simple surplus measure. Scenes 1, 6
and 7 may be closer to extension-first, subject to picture review. Preserve
the approved opening
and closing mood footage and replace only the localized title text.

Before an accepted handle is reused, select a specific in/out range in the
target correspondence, review the picture against the Meyah passage and keep
the film's original source audio out of the target track.
