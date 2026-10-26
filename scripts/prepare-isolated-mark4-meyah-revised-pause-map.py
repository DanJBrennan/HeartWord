"""Project Dan's requested pause revision without changing the approved edit."""
from __future__ import annotations

import hashlib
import html
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assert root.is_relative_to(checkout) and "heartworddata" not in str(root).lower()
review = root / "assets" / "review"
main_path = review / "meyah-mark4-main-shot-review-20261025" / "proposal.json"
storm_path = review / "meyah-mark4-storm-shot-review-20261025" / "assembly-ready-proposal.json"
old_path = review / "meyah-mark4-crew-pause-review-20261025" / "report.json"
rows = json.loads(main_path.read_text(encoding="utf8"))["rows"] + json.loads(storm_path.read_text(encoding="utf8"))["rows"]
old = json.loads(old_path.read_text(encoding="utf8"))
assert len(rows) == 147 and old["proposedPauseCount"] == 8 and old["addedDurationMs"] == 8067
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
db = sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True)
mapping = json.loads(db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])
assert len(mapping["shots"]) == 147 and mapping["planHash"] == "34bdfedd82b4b7dead32019850877115e69a7935c578b42b988ec90d17c696e7"
order_audit = json.loads((review / "meyah-mark4-approved-order-audit-20261026" / "report.json").read_text(encoding="utf8"))
assert not order_audit["ambiguousRepeatedDonorMatches"] and len(order_audit["approvedToCurrentPlacement"]) == 147
approved_mapping = [mapping["shots"][current - 1] for current in order_audit["approvedToCurrentPlacement"]]
assert all(row["donorShotId"] == mapped["donorShotId"] for row, mapped in zip(rows, approved_mapping))

# Use the picture already adjacent to the exact source edge. The old crew's
# suggested shot was sometimes many seconds away and cannot cover that pause
# without changing the approved story order.
adjacent_placements = [2, 21, 39, 69, 89, 107, 117, 138]
notes = [
    "Extends the empty-boat mood shot by 0.767 s. Dan previously asked to preserve that opening footage exactly; this specific change needs review.",
    "Hold the good-soil picture at the 4:8 boundary; the crew's crowd-reaction shot occurs after the later 4:9 quotation.",
    "Continue the silent private-group view immediately after the 4:12 quotation.",
    "Use Peter's wordless reflection at the next source boundary; the crew's proposed grove wide shot occurs much earlier.",
    "Continue the attentive-listener view already ending at the 4:25 boundary.",
    "Begin the Peter-and-John listening view before the 4:30 source resumes; never extend Jesus's speaking mouth.",
    "Hold the branch-listener view at the 4:32 boundary; the proposed private grove view occurs later.",
    "Begin the wordless Jesus-awakening picture after Peter's plea, before the 4:39 narration resumes.",
]
items = []
title_ms = 4000
offset = 0
for number, (pause, placement, note) in enumerate(zip(old["rows"], adjacent_placements, notes), 1):
    boundary = pause["sourceEndMs"]
    selected = rows[placement - 1]
    mapped = approved_mapping[placement - 1]
    assert mapped["targetShotId"] and selected["targetStartMs"] <= boundary <= selected["targetEndMs"]
    shot = db.execute("SELECT needs_lip_sync,action FROM shots WHERE id=?", (mapped["targetShotId"],)).fetchone()
    assert shot and shot[0] == 0 and shot[1] == selected["action"], (number, placement, shot, selected["action"])
    suggested = []
    for source in pause["coverage"]:
        matches = [(i + 1, row) for i, (row, materialized) in enumerate(zip(rows, approved_mapping)) if materialized["targetShotId"] == source["shotId"]]
        assert len(matches) == 1
        old_placement, old_row = matches[0]
        suggested.append({"placement": old_placement, "shotId": source["shotId"],
                          "distanceFromBoundaryMs": max(old_row["targetStartMs"] - boundary, boundary - old_row["targetEndMs"], 0)})
    thumb = selected.get("keyframe")
    if not isinstance(thumb, str) or not (root / "assets" / thumb).is_file():
        thumb = None
    screen_start = title_ms + boundary + offset
    duration = pause["durationMs"]
    items.append({"number": number, "afterSegmentId": pause["afterSegmentId"], "afterVerse": pause["afterVerse"],
                  "sourceBoundaryMs": boundary, "durationMs": duration, "screenStartMs": screen_start,
                  "screenEndMs": screen_start + duration, "cumulativeAddedMs": offset + duration,
                  "crewPurpose": pause["purpose"], "originalCrewSuggestion": suggested,
                  "revisedPlacement": placement, "revisedShotId": mapped["targetShotId"],
                  "revisedAction": selected["action"], "revisedSourceWindowMs": [selected["targetStartMs"], selected["targetEndMs"]],
                  "thumbnail": thumb, "editorialNote": note,
                  "mediaExtensionRequired": True, "producerReviewRequired": True})
    offset += duration
assert offset == 8067

pauses_by_boundary = {item["sourceBoundaryMs"]: item for item in items}
projected = [{"kind": "approved_title", "sourceStartMs": None, "sourceEndMs": None,
              "screenStartMs": 0, "screenEndMs": title_ms, "durationMs": title_ms}]
inserted = set()
offset = 0
source_cursor = 0
for placement, (row, mapped) in enumerate(zip(rows, approved_mapping), 1):
    start, end = row["targetStartMs"], row["targetEndMs"]
    assert start == source_cursor and end >= start
    piece_start = start
    for boundary in sorted(b for b in pauses_by_boundary if start <= b <= end and b not in inserted):
        if boundary > piece_start:
            projected.append({"kind": "approved_picture", "placement": placement, "targetShotId": mapped["targetShotId"],
                              "treatment": mapped["treatment"], "sourceStartMs": piece_start, "sourceEndMs": boundary,
                              "screenStartMs": title_ms + piece_start + offset, "screenEndMs": title_ms + boundary + offset,
                              "durationMs": boundary - piece_start})
        pause = pauses_by_boundary[boundary]
        projected.append({"kind": "proposed_wordless_pause", "pauseNumber": pause["number"],
                          "targetShotId": pause["revisedShotId"], "sourceStartMs": boundary, "sourceEndMs": boundary,
                          "screenStartMs": title_ms + boundary + offset,
                          "screenEndMs": title_ms + boundary + offset + pause["durationMs"],
                          "durationMs": pause["durationMs"]})
        offset += pause["durationMs"]
        piece_start = boundary
        inserted.add(boundary)
    if end > piece_start or start == end:
        projected.append({"kind": "approved_picture" if start < end else "approved_omission", "placement": placement,
                          "targetShotId": mapped["targetShotId"], "treatment": mapped["treatment"],
                          "sourceStartMs": piece_start, "sourceEndMs": end,
                          "screenStartMs": title_ms + piece_start + offset, "screenEndMs": title_ms + end + offset,
                          "durationMs": end - piece_start})
    source_cursor = end
assert len(inserted) == 8 and source_cursor == 805685 and offset == 8067
assert sum(piece["durationMs"] for piece in projected) == title_ms + source_cursor + offset == 817752
assert all(left["screenEndMs"] == right["screenStartMs"] for left, right in zip(projected, projected[1:]))
report = {"kind": "review_only_meyah_mark4_revised_pause_map", "projectId": project,
          "status": "proposal_only_not_applied", "producerDirection": "Dan: Prepare a revised pause map",
          "sourceMapHash": mapping["planHash"], "sourceCrewRunId": old["runId"],
          "approvedOrderAudit": "meyah-mark4-approved-order-audit-20261026/report.json",
          "orderCorrectionPrerequisite": True,
          "sourceProposalHashes": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (main_path, storm_path, old_path)},
          "titleDurationMs": title_ms, "sourceDurationMs": source_cursor, "pauseDurationMs": offset,
          "projectedFilmDurationMs": title_ms + source_cursor + offset, "pauseCount": len(items),
          "sourceAudioChanged": False, "acceptedPictureChanged": False, "databaseWrites": 0,
          "providerRequests": 0, "liveDatabaseOpened": False,
          "caveat": "Every pause requires verified extra picture handle or new silent coverage. The first conflicts with Dan's earlier exact opening-footage preservation; no pause is approved or saved.",
          "items": items, "projectedTimeline": projected}
out = review / "meyah-mark4-revised-pause-map-20261026"
out.mkdir(parents=True, exist_ok=True)
(out / "proposal.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

def clock(ms: int) -> str:
    return f"{ms // 60000:02}:{(ms % 60000) / 1000:06.3f}"

cards = []
for item in items:
    image = f'<img src="/media/{html.escape(item["thumbnail"])}" alt="Reviewed adjacent picture">' if item["thumbnail"] else '<div class="noimage">Preview pending</div>'
    old_places = ", ".join(f'#{old_item["placement"]} ({old_item["distanceFromBoundaryMs"] / 1000:.3f}s away)'
                           for old_item in item["originalCrewSuggestion"])
    cards.append(f'''<article id="pause-{item['number']}"><div class="picture">{image}</div><div class="content">
      <h2>{item['number']}. After {html.escape(item['afterVerse'] or 'spoken chapter heading')} · +{item['durationMs']/1000:.3f}s</h2>
      <p><b>Source edge:</b> {clock(item['sourceBoundaryMs'])} · <b>Proposed screen time:</b> {clock(item['screenStartMs'])}–{clock(item['screenEndMs'])}</p>
      <p><b>Adjacent picture #{item['revisedPlacement']}:</b> {html.escape(item['revisedAction'])}</p>
      <p><b>Why revise:</b> {html.escape(item['editorialNote'])}</p>
      <p class="old">Crew originally suggested {old_places}. {html.escape(item['crewPurpose'])}</p>
      <p class="hold">Extra picture must be verified before use. This is a planning proposal.</p></div></article>''')
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meyah Mark 4 revised pause map</title><style>body{{margin:0;background:#eef2ef;color:#1d3338;font:16px/1.45 system-ui,sans-serif}}main{{max-width:1350px;margin:auto;padding:2rem}}.intro{{background:white;padding:1.2rem;border-radius:12px;border:1px solid #cbd8d2}}article{{display:grid;grid-template-columns:minmax(220px,330px) 1fr;background:white;border:1px solid #ccd8d2;border-radius:12px;overflow:hidden;margin:1rem 0}}.picture{{background:#20383b;min-height:185px;display:grid;place-items:center}}img{{width:100%;height:100%;object-fit:cover}}.noimage{{color:#d4dfd9}}.content{{padding:1rem 1.3rem}}h1{{margin-top:0}}h2{{margin:.2rem 0 .7rem;font-size:1.25rem}}p{{margin:.55rem 0}}.old{{color:#586766}}.hold{{color:#864d16;background:#fff4dc;padding:.45rem .6rem}}@media(max-width:760px){{article{{grid-template-columns:1fr}}.picture{{max-height:220px}}}}</style><main>
<h1>Meyah Mark 4 · revised pause map</h1><div class="intro"><p><b>Review only.</b> Eight wordless pauses add 8.067 seconds. The complete 13:25.685 source recording, four-second approved title, Dan-approved 147-row picture order and all exact speech boundaries remain intact. The projected screen length is <b>{clock(report['projectedFilmDurationMs'])}</b>.</p><p>The saved stage-3 shot order first needs the separate <a href="/media/review/meyah-mark4-approved-order-audit-20261026/index.html">approved-order correction</a>. This preview maps target IDs back onto your approved paper edit without changing the database. The previous crew's suggested coverage was sometimes far from the proposed audio boundary. Each card places the pause on an adjacent non-speaking picture instead. None has an approved extra video handle yet. Pause 1 would extend the empty-boat opening, which conflicts with Dan's earlier instruction to preserve the opening footage exactly; it requires an explicit editorial decision before application.</p><p>The <a href="proposal.json">machine-readable timeline</a> projects every source picture and pause to an exact screen clock. No database, source audio, media or approved timing has changed.</p></div>{''.join(cards)}</main>'''
(out / "index.html").write_text(page, encoding="utf8")
db.close()
print(json.dumps({"pauseCount": len(items), "addedDurationMs": offset, "projectedFilmDurationMs": report["projectedFilmDurationMs"],
                  "projectedPlacements": len(projected), "url": "http://127.0.0.1:4002/media/review/meyah-mark4-revised-pause-map-20261026/index.html"}, indent=2))
