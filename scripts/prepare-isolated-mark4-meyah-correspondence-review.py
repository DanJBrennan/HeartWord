"""Build a read-only donor-picture and Meyah-audio review page in the isolated copy.

The page suggests only picture treatment. It does not assign exact target
utterance windows, approve target shots, or write to the database.
"""
import hashlib
import html
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote


CHECKOUT = Path(__file__).resolve().parent.parent
ROOT = CHECKOUT / "output" / "mark4-donor-20261024"
PROJECT = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
DONOR = "8a5659a4-b033-4d5f-80e2-904b217cf8a0"
REVIEW = "10bfa028-92db-4826-bc14-a62760dca5bc"
OUT = ROOT / "assets" / "review" / "meyah-mark4-correspondence-20261025"


def media(path):
    return "/media/" + "/".join(quote(bit) for bit in path.replace("\\", "/").split("/"))


def clock(ms):
    return f"{ms // 60000}:{(ms // 1000) % 60:02d}.{ms % 1000:03d}"


def main():
    if not ROOT.resolve().is_relative_to(CHECKOUT.resolve()):
        raise RuntimeError("Review output is outside the isolated checkout")
    db = sqlite3.connect(f"file:{ROOT / 'db' / 'heartword.sqlite'}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        review = db.execute("SELECT source_hash,alignment_hash FROM source_alignment_reviews WHERE id=? AND project_id=?", (REVIEW, PROJECT)).fetchone()
        if not review:
            raise RuntimeError("Named approved source map is unavailable")
        receipt = json.loads((ROOT / "review" / "meyah-mark4-source-map-approval.json").read_text(encoding="utf-8"))
        if (review["source_hash"], review["alignment_hash"]) != (receipt["sourceHash"], receipt["alignmentHash"]):
            raise RuntimeError("Approved source map changed")
        origin = json.loads(db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition'", (PROJECT,)).fetchone()[0])
        evidence = origin["preflight"]["pictureEvidence"]
        picture = json.loads((ROOT / "review" / "approved-final-picture-plan.json").read_text(encoding="utf-8"))
        if picture["renderId"] != origin["preflight"]["donor"]["renderId"]:
            raise RuntimeError("Final-picture map and edition origin differ")
        handle_receipt = json.loads((ROOT / "review" / "mark4-meyah-picture-handles.json").read_text(encoding="utf-8"))
        if (handle_receipt["targetProjectId"], handle_receipt["donorProjectId"], handle_receipt["donorRenderId"]) != (PROJECT, DONOR, picture["renderId"]):
            raise RuntimeError("Staged picture handles belong to another edition")
        handles = defaultdict(list)
        checked = set()
        for candidate in handle_receipt["candidates"]:
            path = candidate["result_asset_path"]
            if path not in checked:
                full = (ROOT / "assets" / path).resolve()
                if not full.is_relative_to((ROOT / "assets").resolve()) or hashlib.sha256(full.read_bytes()).hexdigest() != candidate["sha256"]:
                    raise RuntimeError("A staged donor picture handle changed")
                checked.add(path)
            handles[candidate["shot_id"]].append({"attemptId": candidate["attempt_id"], "path": path, "sha256": candidate["sha256"]})
        audio = db.execute("SELECT audio_path FROM project_source_bindings WHERE project_id=?", (PROJECT,)).fetchone()[0]
        film = db.execute("SELECT result_asset_path FROM chapter_renders WHERE id=?", (picture["renderId"],)).fetchone()[0]
        if hashlib.sha256((ROOT / "assets" / film).read_bytes()).hexdigest() != origin["preflight"]["donor"]["renderSha256"] or hashlib.sha256((ROOT / "assets" / audio).read_bytes()).hexdigest() != origin["preflight"]["target"]["audio"]["sha256"]:
            raise RuntimeError("Pinned film or Meyah source audio changed")
        shots = {r["id"]: dict(r) for r in db.execute("""SELECT sh.id,sh.action,sh.verse_ref,sh.framing,sh.needs_lip_sync,
            sh.dialogue_character_id,sc.sequence AS scene FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
            WHERE sc.project_id=?""", (DONOR,))}
        keyframes = defaultdict(list)
        for entry in evidence:
            keyframes[entry["shotId"]].append((entry["keyframePath"], entry["keyframeSha256"]))
        scenes = [dict(r) for r in db.execute("SELECT sequence,verse_start,verse_end FROM scenes WHERE project_id=? ORDER BY sequence", (PROJECT,))]
        source_rows = [dict(r) for r in db.execute("SELECT verse_ref,start_ms,end_ms FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms", (PROJECT,))]
        manifest = json.loads((ROOT / "assets" / "source-listening-review" / PROJECT / "speech-manifest.json").read_text(encoding="utf-8"))
        notes = [json.loads(r[0].split("\n", 1)[1]) for r in db.execute("SELECT note FROM review_notes WHERE project_id=? AND source='human' AND note LIKE 'Source listening review v1%' ORDER BY created_at,rowid", (PROJECT,))]
        # The manifest hash is the digest of the file, not a member of its JSON.
        manifest_hash = hashlib.sha256((ROOT / "assets" / "source-listening-review" / PROJECT / "speech-manifest.json").read_bytes()).hexdigest()
        current = {r["itemId"]: r for r in notes if r["manifestHash"] == manifest_hash}
        turns = []
        for item in manifest["items"]:
            saved = current.get(item["id"])
            if not saved or not saved["verified"]:
                raise RuntimeError(f"Speech review is missing: {item['id']}")
            turns.append({"id": item["id"], "verseRef": item["verseRef"], "speaker": item["speakerName"], "startMs": saved["startMs"], "endMs": saved["endMs"], "narrationOnly": item["id"] == "speech-jesus-v39"})
        if len(turns) != 13:
            raise RuntimeError("Unexpected speech review count")
        per_scene = defaultdict(list)
        title = []
        turn_by_scene = {1: "speech-jesus-v3-v8", 2: "speech-jesus-v11-v12", 3: "speech-jesus-v13-v20",
                         4: "speech-jesus-v21-v23 / speech-jesus-v24-v25", 5: "speech-jesus-v26-v29",
                         6: "speech-jesus-v30-v32"}
        for entry in picture["placements"]:
            if entry.get("kind") == "replaceable_title":
                title.append(entry)
                continue
            shot = shots.get(entry.get("shotId"))
            if not shot:
                raise RuntimeError("A final-picture shot is missing from the donor")
            keys = keyframes[shot["id"]]
            if not keys:
                raise RuntimeError(f"Pinned keyframe missing for {shot['id']}")
            key, key_hash = keys.pop(0)
            if not (ROOT / "assets" / key).is_file() or hashlib.sha256((ROOT / "assets" / key).read_bytes()).hexdigest() != key_hash:
                raise RuntimeError(f"Pinned keyframe asset changed: {key}")
            treatment = "reuse picture"
            if shot["needs_lip_sync"]:
                treatment = "new Meyah Avatar"
            if shot["verse_ref"].lower() == "mark 4:39" and shot["needs_lip_sync"]:
                treatment = "new silent coverage: Meyah narrates this action"
            turn_id = None
            if shot["needs_lip_sync"] and treatment == "new Meyah Avatar":
                if shot["scene"] == 1:
                    turn_id = "speech-jesus-v9" if "4:9" in shot["verse_ref"] else "speech-jesus-v3-v8"
                elif shot["scene"] == 7:
                    turn_id = "speech-disciples-v38" if "4:38" in shot["verse_ref"] else "speech-jesus-v40"
                else:
                    turn_id = turn_by_scene[shot["scene"]]
            per_scene[shot["scene"]].append({**entry, **shot, "keyframe": key, "treatment": treatment,
                "acceptedHandleCandidates": handles.get(shot["id"], []),
                "turnId": turn_id, "durationMs": round((entry["endFrame"] - entry["startFrame"] + 1) / 24 * 1000)})
        if len(title) != 1 or sum(map(len, per_scene.values())) != 113:
            raise RuntimeError("The approved 114-placement picture map is incomplete")
        scene_data = []
        for scene in scenes:
            lo = int(scene["verse_start"].split(":")[1]); hi = int(scene["verse_end"].split(":")[1])
            members = [r for r in source_rows if r["verse_ref"] and lo <= int(r["verse_ref"].split(":")[1].split("-")[0]) <= hi]
            if not members:
                raise RuntimeError("Target source scene has no rows")
            entries = per_scene[scene["sequence"]]
            donor_ms = sum(p["durationMs"] for p in entries)
            target_ms = members[-1]["end_ms"] - members[0]["start_ms"]
            scene_data.append({**scene, "targetStartMs": members[0]["start_ms"], "targetEndMs": members[-1]["end_ms"],
                "targetDurationMs": target_ms, "donorDurationMs": donor_ms, "differenceMs": target_ms - donor_ms,
                "donorSpeakingMs": sum(p["durationMs"] for p in entries if p["needs_lip_sync"]),
                "targetDirectSpeechMs": sum(t["endMs"] - t["startMs"] for t in turns if not t["narrationOnly"] and lo <= int(t["verseRef"].split(":")[1].split("-")[0]) <= hi),
                "shots": entries})
        data = {"kind": "read_only_draft", "sourceReviewId": REVIEW, "sourceHash": receipt["sourceHash"], "alignmentHash": receipt["alignmentHash"],
            "donorRenderId": picture["renderId"], "donorVideo": film, "targetAudio": audio,
            "title": {"donorFrames": title[0], "targetText": ["Markus 4", "Meyah"]}, "turns": turns, "scenes": scene_data,
            "warnings": ["Donor picture timings are not Meyah shot timings.", "Suggested treatments are a visual inventory, not an approved target correspondence.", "Exact per-shot Meyah speech windows and new coverage beats still need review."]}
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "inventory.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        scene_html = []
        for scene in scene_data:
            quoted = [t for t in turns if int(t["verseRef"].split(":")[1].split("-")[0]) >= int(scene["verse_start"].split(":")[1]) and int(t["verseRef"].split(":")[1].split("-")[0]) <= int(scene["verse_end"].split(":")[1])]
            turns_html = "".join(f"<li>{html.escape(t['id'])}: {clock(t['startMs'])}–{clock(t['endMs'])} {'narration only' if t['narrationOnly'] else 'direct speech'} <button class='audio-play' data-start='{t['startMs']}' data-end='{t['endMs']}'>Listen</button></li>" for t in quoted)
            rows = []
            for p in scene["shots"]:
                img = media(p["keyframe"])
                turn_label = f"<br><small>Candidate source turn: {html.escape(p['turnId'])}</small>" if p["turnId"] else ""
                late_note = "<br><small>Final-cut position follows two 4:41 reactions; check Meyah source order.</small>" if p["scene"] == 7 and p["startFrame"] == 13030 else ""
                handle_links = "".join(f"<li><a href='{media(handle['path'])}' target='_blank' rel='noopener'>View accepted take</a> <small>{html.escape(handle['attemptId'])}</small></li>" for handle in p["acceptedHandleCandidates"])
                handle_html = f"<details><summary>{len(p['acceptedHandleCandidates'])} separate accepted take(s)</summary><ul>{handle_links}</ul><small>Candidate only; inspect the usable trim before selecting it.</small></details>" if handle_links else ""
                rows.append(f"<tr><td><img loading='lazy' src='{img}' alt='Donor shot still'></td><td>{p['startFrame']}–{p['endFrame']}<br>{p['durationMs']/1000:.2f}s<br><button class='video-play' data-start='{p['startFrame']/24:.3f}' data-end='{(p['endFrame']+1)/24:.3f}'>Play cut</button></td><td><b>{html.escape(p['verse_ref'] or '')}</b><br>{html.escape(p['action'] or '')}<br><small>{html.escape(p['framing'] or '')}</small></td><td>{html.escape(p['treatment'])}{turn_label}{late_note}{handle_html}</td></tr>")
            scene_html.append(f"<section id='scene-{scene['sequence']}'><h2>Scene {scene['sequence']} · {html.escape(scene['verse_start'])}–{html.escape(scene['verse_end'])}</h2><p>Meyah source {clock(scene['targetStartMs'])}–{clock(scene['targetEndMs'])} ({scene['targetDurationMs']/1000:.1f}s) · donor picture {scene['donorDurationMs']/1000:.1f}s · difference <b>{scene['differenceMs']/1000:+.1f}s</b>. Direct speech {scene['targetDirectSpeechMs']/1000:.1f}s; old visible speaking picture {scene['donorSpeakingMs']/1000:.1f}s.</p><button class='audio-play' data-start='{scene['targetStartMs']}' data-end='{scene['targetEndMs']}'>Listen to scene</button><details><summary>Reviewed speech turns</summary><ul>{turns_html}</ul></details><table><thead><tr><th>Donor frame</th><th>Final cut</th><th>Source-grounded shot</th><th>Initial treatment</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>")
        page = f"""<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Mark 4 → Meyah shot correspondence review</title>
<style>body{{margin:0;background:#121b23;color:#ecf3f4;font:16px/1.5 system-ui,Segoe UI,sans-serif}}main{{max-width:1280px;margin:auto;padding:22px}}h1{{margin:.2em 0}}h2{{margin-top:1.8em}}p{{max-width:80ch}}a{{color:#83d7ee}}.notice{{border-left:4px solid #f9bd67;background:#2d2b26;padding:12px 16px}}.player{{position:sticky;top:0;z-index:2;background:#13232d;padding:12px;display:flex;gap:16px;align-items:center;box-shadow:0 4px 12px #0009}}.player video{{width:270px;max-height:152px}}.player audio{{width:360px}}button{{background:#257b92;border:0;color:white;border-radius:5px;padding:6px 10px;cursor:pointer}}button:hover{{background:#2f9ab3}}section{{border-top:1px solid #435561;padding-top:8px}}table{{border-collapse:collapse;width:100%;margin-top:12px}}th,td{{border-bottom:1px solid #364b58;padding:9px;vertical-align:top;text-align:left}}th{{position:sticky;top:176px;background:#223642}}td img{{width:160px;max-height:95px;object-fit:contain;background:#000}}td:nth-child(2){{white-space:nowrap}}small{{color:#b5c8cc}}@media(max-width:800px){{.player{{position:static;display:block}}.player video{{width:100%}}.player audio{{width:100%}}th{{position:static}}td img{{width:100px}}}}</style>
<div class='player'><video id='donor' controls preload='metadata' src='{media(film)}'></video><div><b>Final Hatam picture</b><br>Click a donor shot's “Play cut.”</div><audio id='meyah' controls preload='metadata' src='{media(audio)}'></audio><div><b>Meyah source</b><br>Click a scene or speech turn to listen.</div></div><main><h1>Mark 4 → Meyah: picture correspondence draft</h1><p class='notice'>Read-only editorial inventory. Dan approved the 40-row Meyah source map for scene planning and the 114-placement final Hatam picture map. The per-shot Meyah timing, new coverage, voice binding and target picture treatment still need a separate review. The 4:38 quotation is distinct from its narrator lead-in; 4:39 is narration only.</p><p>The opening lake and empty-boat mood shots remain as Dan directed. The four-second title changes to <b>Markus 4</b> / <b>Meyah</b>. Picture differences below compare scene durations, not missing footage: longer Meyah speaking performances can use existing cutaways while new Avatar takes and passage-grounded coverage fill the rest.</p><nav>{' · '.join(f"<a href='#scene-{s['sequence']}'>Scene {s['sequence']}</a>" for s in scene_data)}</nav>{''.join(scene_html)}<p>Source review <code>{REVIEW}</code>. Generated from the isolated database and pinned donor picture recipe. <a href='inventory.json'>Machine-readable inventory</a>.</p></main>
<script>const video=document.getElementById('donor'),audio=document.getElementById('meyah');let timer=null;function play(el,start,end){{video.pause();audio.pause();if(timer)clearInterval(timer);el.currentTime=start;el.play();timer=setInterval(()=>{{if(el.currentTime>=end){{el.pause();clearInterval(timer);timer=null}}}},20)}}document.querySelectorAll('.video-play').forEach(b=>b.onclick=()=>play(video,Number(b.dataset.start),Number(b.dataset.end)));document.querySelectorAll('.audio-play').forEach(b=>b.onclick=()=>play(audio,Number(b.dataset.start)/1000,Number(b.dataset.end)/1000));</script></html>"""
        (OUT / "index.html").write_text(page, encoding="utf-8")
        print(json.dumps({"url": f"http://127.0.0.1:4002{media('review/meyah-mark4-correspondence-20261025/index.html')}", "scenes": len(scene_data), "placements": sum(len(s["shots"]) for s in scene_data), "targetScenesMs": sum(s["targetDurationMs"] for s in scene_data), "donorPictureMs": sum(s["donorDurationMs"] for s in scene_data)}))
    finally:
        db.close()


if __name__ == "__main__":
    main()
