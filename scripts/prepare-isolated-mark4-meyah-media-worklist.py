"""Read-only target shot worklist from Dan's approved correspondence and timing."""
from __future__ import annotations

import html
import json
import sqlite3
from collections import Counter
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assets = root / "assets"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
main = json.loads((assets / "review" / "meyah-mark4-main-shot-review-20261025" / "proposal.json").read_text(encoding="utf8"))["rows"]
storm = json.loads((assets / "review" / "meyah-mark4-storm-shot-review-20261025" / "assembly-ready-proposal.json").read_text(encoding="utf8"))["rows"]
rows = main + storm
draft = json.loads((root / "review" / "meyah-mark4-full-correspondence-draft.json").read_text(encoding="utf8"))["correspondence"]
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    record = db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1", (project_id,)).fetchone()
    if not record:
        raise SystemExit("The reviewed target shots are missing")
    mapped = json.loads(record[0])["shots"]
    if len(rows) != 147 or len(mapped) != 147 or len(draft) != 147:
        raise SystemExit("The approved picture and materialized target map differ in length")
    if any(a["donorShotId"] != b["donorShotId"] or a["treatment"] != b["treatment"] for a,b in zip(draft,mapped)):
        raise SystemExit("Materialized target shots differ from the reviewed correspondence")
    used = set()
    items = []
    for number, editorial in enumerate(rows, 1):
        treatment = editorial["pipelineTreatment"]
        if treatment not in ("needs_coverage", "replace_avatar"):
            continue
        candidates = []
        for i, choice in enumerate(draft):
            if i in used or choice["donorShotId"] != editorial["donorShotId"] or choice["treatment"] != treatment:
                continue
            if treatment == "replace_avatar":
                speech = editorial.get("targetSpeech") or {}
                if choice.get("targetStartMs") != speech.get("startMs") or choice.get("targetEndMs") != speech.get("endMs"):
                    continue
            elif choice.get("addedForEdition"):
                if choice.get("addedAction") != editorial.get("addedAction"):
                    continue
            elif editorial.get("addedForEdition"):
                continue
            candidates.append(i)
        if len(candidates) != 1:
            raise SystemExit(f"Editorial row {number} has {len(candidates)} exact target matches")
        index = candidates[0]
        used.add(index)
        target = mapped[index]
        shot_id = target["targetShotId"]
        if not shot_id:
            raise SystemExit("A selected picture lost its target shot")
        shot = db.execute("SELECT action,verse_ref,needs_lip_sync FROM shots WHERE id=?", (shot_id,)).fetchone()
        cast = [x[0] for x in db.execute("SELECT c.name FROM shot_characters sc JOIN characters c ON c.id=sc.character_id WHERE sc.shot_id=? ORDER BY c.name", (shot_id,))]
        key = db.execute("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' ORDER BY created_at DESC LIMIT 1", (shot_id,)).fetchone()
        motion = db.execute("SELECT ga.result_asset_path FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id WHERE c.shot_id=? AND ga.operation='generate_final_video' AND ga.provider='ltx_local' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1", (shot_id,)).fetchone()
        if treatment == "needs_coverage" and shot[2]:
            raise SystemExit("A silent coverage beat incorrectly needs lip sync")
        items.append({"placement": number, "scene": editorial.get("scene", 7), "verseRef": shot[1], "action": shot[0],
                      "targetStartMs": editorial["targetStartMs"], "targetEndMs": editorial["targetEndMs"],
                      "durationMs": editorial["durationMs"], "treatment": treatment, "targetShotId": shot_id,
                      "cast": cast, "acceptedTargetKeyframe": key[0] if key else None,
                      "acceptedLocalLtx": motion[0] if motion else None,
                      "pictureReady": bool(key and (treatment == "replace_avatar" or motion))})

counts = Counter(item["treatment"] for item in items)
if counts != {"needs_coverage": 35, "replace_avatar": 29}:
    raise SystemExit("Unexpected target media worklist counts")
summary = {"kind": "read_only_isolated_meyah_mark4_media_worklist", "projectId": project_id,
           "reviewedPicturePlacements": 147, "editableTargetShots": 145, "retainedPicturePlacements": 81,
           "newSilentCoverageShots": 35, "silentCoverageDurationMs": sum(x["durationMs"] for x in items if x["treatment"] == "needs_coverage"),
           "silentCoverageNeedingTenSecondLtx": sum(x["durationMs"] > 8000 for x in items if x["treatment"] == "needs_coverage"),
           "targetAvatarShots": 29, "approvedPeterKeyframes": sum(bool(x["acceptedTargetKeyframe"]) for x in items if x["verseRef"] == "Mark 4:38"),
           "targetLtxVideosAccepted": sum(bool(x["acceptedLocalLtx"]) for x in items),
           "status": "picture_generation_pending_target_planning_gate", "items": items}
out = assets / "review" / "meyah-mark4-media-worklist-20261025"
out.mkdir(parents=True, exist_ok=True)
(out / "worklist.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
table = "".join(f"<tr><td>{x['placement']}</td><td>{x['scene']}</td><td>{html.escape(x['verseRef'] or '')}</td><td>{x['durationMs']/1000:.3f}s</td><td>{'LTX coverage' if x['treatment']=='needs_coverage' else 'Kling Avatar'}</td><td>{html.escape(', '.join(x['cast']) or 'No named character')}</td><td>{html.escape(x['action'])}</td><td>{'Keyframe accepted' if x['acceptedTargetKeyframe'] else 'Keyframe pending'}{' · LTX accepted' if x['acceptedLocalLtx'] else ''}</td></tr>" for x in items)
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 media worklist</title><style>body{{margin:0;background:#eff1ed;color:#1b343e;font:15px/1.45 system-ui,sans-serif}}main{{max-width:1400px;margin:auto;padding:2rem}}.stats{{display:flex;gap:1rem;flex-wrap:wrap}}.stats p{{background:#fff;padding:.8rem 1rem;border-radius:8px;border:1px solid #ccd4d2}}table{{border-collapse:collapse;background:white;width:100%}}th,td{{padding:.5rem;border:1px solid #d5dcda;text-align:left;vertical-align:top}}th{{background:#e7f0ed;position:sticky;top:0}}td:nth-child(7){{min-width:24rem}}.scroll{{overflow:auto}}small{{color:#54656a}}</style><main><h1>Meyah Mark 4 · target media worklist</h1><p>This is a read-only inventory of the approved target correspondence. The 81 retained picture placements are prepared locally after new coverage is ready. No media generation is started by this page.</p><div class="stats"><p><b>35</b> silent coverage shots<br><small>187.517 seconds total</small></p><p><b>5</b> need a 10-second LTX request<br><small>All others fit eight seconds</small></p><p><b>29</b> visible speaking shots<br><small>New Meyah Kling Avatar takes</small></p><p><b>1</b> approved target keyframe<br><small>Peter 4:38 version 3</small></p></div><div class="scroll"><table><thead><tr><th>#</th><th>Scene</th><th>Verse</th><th>Target length</th><th>Media path</th><th>Reviewed cast</th><th>Approved action</th><th>Current state</th></tr></thead><tbody>{table}</tbody></table></div></main></html>'''
(out / "index.html").write_text(page, encoding="utf8")
print(json.dumps({k:v for k,v in summary.items() if k != "items"} | {"url":"http://127.0.0.1:4002/media/review/meyah-mark4-media-worklist-20261025/index.html"}, indent=2))
