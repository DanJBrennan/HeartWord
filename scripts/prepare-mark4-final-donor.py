"""Prepare Dan's approved final Mark 4 map in this checkout's isolated data copy.

Reads the tracked review pack; never opens HeartWordData or a provider. It adds
scene-correct legacy shots and accepted donor-reference keyframe attempts while
preserving every historical row/status. The fixed-root normalizer runs later.

Usage: python scripts/prepare-mark4-final-donor.py --check|--apply
"""
import csv
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

CHECKOUT = Path(__file__).resolve().parent.parent
ROOT = CHECKOUT / "output" / "mark4-donor-20261024"
DB_PATH = ROOT / "db" / "heartword.sqlite"
ASSETS = ROOT / "assets"
REVIEW = ROOT / "review"
PACK = CHECKOUT / "docs" / "production" / "mark4-shot-map-2026-10-25"
PROJECT_ID = "8a5659a4-b033-4d5f-80e2-904b217cf8a0"
RENDER_ID = "deefa536-62f9-41b3-bbac-e9e8fb244206"
FINAL_SHA = "b207b4c0109d70e85fab40ccb9253e7973c4cd38213333307153d417fda8aa6a"
KEY = "language-edition:mark4:prepare-final-donor:2026-10-25"
ALIAS_DIR = "generated/editorial/language-editions/mark4-donor-keyframes"
APPROVAL = "Dan Brennan approved the 114-placement final Mark 4 shot map as drafted on 2026-10-25 and chose the original v34 keyframes as scene-specific donor references. Their prior held-review scope remains unchanged."

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def asset(relative: str) -> Path:
    root = ASSETS.resolve()
    path = (root / relative.replace("\\", "/")).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Asset escaped isolated root: {relative}")
    return path

def stable_id(kind: str, value: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"heartword:{RENDER_ID}:{kind}:{value}"))

def row_key(row: dict) -> tuple[int, int]:
    return int(row["firstFrame"]), int(row["lastFrame"])

def evidence():
    map_path = PACK / "first-shot-map-DRAFT.tsv"
    rows = list(csv.DictReader(map_path.open(encoding="utf-8"), delimiter="\t"))
    aliases = json.loads((PACK / "approved-legacy-imports.json").read_text(encoding="utf-8"))
    history = list(csv.DictReader((PACK / "historical-speaking-keyframes.tsv").open(encoding="utf-8"), delimiter="\t"))
    if len(rows) != 114 or len(aliases["imports"]) != 14 or len(history) != 15 or aliases["schemaVersion"] != 1:
        raise ValueError("Approved Mark 4 review pack has an unexpected shape")
    if rows[0]["evidenceClass"] != "replaceable_title" or row_key(rows[0]) != (0, 95):
        raise ValueError("The source-language title is not isolated")
    cursor = 0
    for row in rows:
        first, last = row_key(row)
        if first != cursor or last < first or last > 13483:
            raise ValueError(f"Review map gap or overlap at frame {cursor}")
        cursor = last + 1
    if cursor != 13484:
        raise ValueError("Final review map is incomplete")
    legacy = {row_key(row): row for row in rows if row["evidenceClass"].startswith("legacy_")}
    specs = {row_key(item): item for item in aliases["imports"]}
    if legacy.keys() != specs.keys():
        raise ValueError("Legacy shot specification differs from the approved picture map")
    selected = {row["proposedShotId"] for row in rows if row["proposedShotId"]}
    speaking = {item["donorShotId"] for item in history}
    if len(selected) != 84 or not speaking.issubset(selected):
        raise ValueError("Original keyframes do not cover the selected donor speaking shots")
    if sha(asset("generated/chapter/Markus-4.mp4")) != FINAL_SHA:
        raise ValueError("The exact final Mark 4 picture changed")
    for item in history:
        if item["approvalScope"] != "held_motion_lipsync_review_only":
            raise ValueError("Historical approval scope changed")
        for stem in ("keyframe", "audio"):
            if sha(asset(item[f"{stem}Path"])) != item[f"{stem}Sha256"]:
                raise ValueError(f"Historical {stem} changed for {item['v45Beat']}")
    return rows, legacy, specs, history, sha(map_path)

def source_shot_id(row: dict) -> str | None:
    category = row["evidenceClass"]
    if category == "legacy_cross_scene_import":
        found = re.search(r"Original donor shot ([0-9a-f-]{36})\.", row["reviewEvidence"])
        if not found:
            raise ValueError("Cross-scene source identity is missing")
        return found.group(1)
    if category == "legacy_cross_chapter_import":
        found = re.search(r"([0-9a-f-]{36})\.mp4$", row["retainedPatchSource"])
        if not found:
            raise ValueError("Cross-chapter source identity is missing")
        return found.group(1)
    return None

def make_plan(db: sqlite3.Connection, rows: list[dict]) -> dict:
    original = db.execute("SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?", (RENDER_ID,)).fetchone()
    if not original or isinstance(json.loads(original[0]), list):
        raise ValueError("The selected render no longer has its original legacy recipe")
    placements = []
    for row in rows:
        first, last = row_key(row)
        if row["evidenceClass"] == "replaceable_title":
            placements.append({"kind": "replaceable_title", "startFrame": first, "endFrame": last, "reason": row["reviewEvidence"]})
        else:
            shot_id = row["proposedShotId"] or stable_id("legacy-shot", f"{first}-{last}")
            placements.append({"shotId": shot_id, "startFrame": first, "endFrame": last, "reason": row["reviewEvidence"]})
    return {"schemaVersion": 1, "renderId": RENDER_ID,
            "expectedOriginalTimelineSha256": hashlib.sha256(original[0].encode("utf-8")).hexdigest(),
            "reviewer": "Dan Brennan", "evidence": APPROVAL, "placements": placements}

def extract_frames(legacy: dict, destination: Path):
    frames = [(first + last) // 2 for first, last in sorted(legacy)]
    expression = "+".join(f"eq(n,{frame})" for frame in frames)
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(asset("generated/chapter/Markus-4.mp4")),
                    "-vf", f"select='{expression}'", "-vsync", "0", str(destination / "alias-%02d.png")], check=True)
    result = {}
    for index, bounds in enumerate(sorted(legacy), 1):
        source = destination / f"alias-{index:02d}.png"
        if not source.is_file():
            raise ValueError(f"Final-film keyframe missing for {bounds}")
        result[bounds] = source
    return result

def main():
    if sys.argv[1:] not in (["--check"], ["--apply"]):
        raise SystemExit("Use exactly --check or --apply")
    if ROOT.is_symlink() or DB_PATH.is_symlink() or not DB_PATH.is_file() or ROOT.resolve() != ROOT:
        raise ValueError("The fixed isolated donor root/database is not an ordinary checkout path")
    rows, legacy, specs, history, map_hash = evidence()
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        existing = db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?", (PROJECT_ID, KEY)).fetchone()
        if existing:
            raise ValueError("The isolated donor was already prepared; inspect its saved command before retrying")
        exact_note = "Dan Brennan approved all fifteen held canonical Jesus keyframes for the next held motion/lip-sync review stage; no chapter placement is authorized."
        note = db.execute("SELECT id FROM review_notes WHERE project_id=? AND source='human' AND note=?", (PROJECT_ID, exact_note)).fetchall()
        if len(note) != 1 or any(item["approvalNoteId"] != note[0]["id"] for item in history):
            raise ValueError("The original limited producer keyframe decision changed")
        scenes = {int(row["sequence"]): row["id"] for row in db.execute("SELECT id,sequence FROM scenes WHERE project_id=?", (PROJECT_ID,))}
        if sorted(scenes) != list(range(1, 8)):
            raise ValueError("Unexpected donor scene structure")
        jesus = db.execute("SELECT id FROM characters WHERE name='Jesus' AND canon_status='approved' AND region='Papuan'").fetchall()
        if len(jesus) != 1:
            raise ValueError("Approved Papuan Jesus identity is ambiguous")
        for bounds, row in legacy.items():
            spec = specs[bounds]
            source_id = source_shot_id(row)
            if source_id:
                parent = db.execute("SELECT sc.project_id,sc.sequence,sh.needs_lip_sync,sh.dialogue_character_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?", (source_id,)).fetchone()
                if not parent or (row["evidenceClass"] == "legacy_cross_scene_import" and (parent["project_id"] != PROJECT_ID or parent["sequence"] == spec["sceneSequence"])) or (row["evidenceClass"] == "legacy_cross_chapter_import" and parent["project_id"] == PROJECT_ID):
                    raise ValueError(f"Legacy picture source changed at {bounds}")
                if bool(parent["needs_lip_sync"]) != bool(spec["needsLipSync"]) and row["evidenceClass"] == "legacy_cross_scene_import":
                    raise ValueError(f"Speaking disposition changed at {bounds}")
            if spec["sceneSequence"] not in scenes or not spec["action"].strip() or not spec["verseRef"].startswith("Mark 4:"):
                raise ValueError(f"Legacy scene/action is incomplete at {bounds}")
        for item in history:
            absent = db.execute("SELECT 1 FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted'", (item["donorShotId"],)).fetchone()
            if absent:
                raise ValueError("A historical speaking keyframe was already accepted; review before adding another")
        plan = make_plan(db, rows)
        if sys.argv[1:] == ["--check"]:
            print(json.dumps({"status": "ready", "placements": len(plan["placements"]), "legacyShots": len(legacy), "historicalKeyframes": len(history), "mapSha256": map_hash}))
            return

        REVIEW.mkdir(parents=True, exist_ok=True)
        backup = REVIEW / "heartword.before-final-map-preparation.sqlite"
        if backup.exists():
            raise ValueError("An earlier preparation backup already exists; inspect it before applying")
        saved = sqlite3.connect(backup)
        try:
            db.backup(saved)
        finally:
            saved.close()
        if backup.stat().st_size < 100_000_000:
            raise ValueError("Isolated donor backup is unexpectedly small")
        now = int(time.time() * 1000)
        prepared = []
        with tempfile.TemporaryDirectory(prefix="heartword-mark4-legacy-") as temp:
            extracted = extract_frames(legacy, Path(temp))
            db.execute("BEGIN IMMEDIATE")
            try:
                for bounds in sorted(legacy):
                    first, last = bounds
                    row, spec = legacy[bounds], specs[bounds]
                    source_id = source_shot_id(row)
                    shot_id = stable_id("legacy-shot", f"{first}-{last}")
                    dialogue_id = jesus[0]["id"] if spec["needsLipSync"] else None
                    provenance = {"finalFrames": [first, last], "sourceShotId": source_id,
                                  "sourcePath": row["retainedPatchSource"], "mapEvidence": row["reviewEvidence"]}
                    db.execute("""INSERT INTO shots(id,scene_id,sequence,action,verse_ref,framing,camera_movement,
                        needs_lip_sync,dialogue_character_id,coverage_plan,continuity_notes,status,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,'single_clip',?,'planned',?)""",
                        (shot_id, scenes[spec["sceneSequence"]], 20000 + first, spec["action"], spec["verseRef"],
                         spec["framing"], spec["cameraMovement"], int(spec["needsLipSync"]), dialogue_id,
                         "Approved final-cut legacy alias; " + json.dumps(provenance, ensure_ascii=False), now))
                    if row["evidenceClass"] == "legacy_cross_scene_import" and source_id:
                        cast = [record["character_id"] for record in db.execute("""SELECT s.character_id FROM shot_characters s
                            JOIN characters c ON c.id=s.character_id WHERE s.shot_id=? AND c.canon_status='approved' AND c.region='Papuan'""", (source_id,))]
                    else:
                        cast = []
                    if spec.get("addApprovedCharacter") == "Jesus" or spec["needsLipSync"]:
                        cast.append(jesus[0]["id"])
                    for character_id in sorted(set(cast)):
                        db.execute("INSERT INTO shot_characters(shot_id,character_id)VALUES(?,?)", (shot_id, character_id))
                    relative = f"{ALIAS_DIR}/f{first:05d}-f{last:05d}.png"
                    target = asset(relative)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists() and sha(target) != sha(extracted[bounds]):
                        raise ValueError(f"Existing legacy keyframe differs at {bounds}")
                    if not target.exists():
                        target.write_bytes(extracted[bounds].read_bytes())
                    frame_hash = sha(target)
                    db.execute("""INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
                        VALUES(?,?,'legacy_final_frame','verified_v73_final_picture','generate',?,'accepted',?,0,?)""",
                        (stable_id("legacy-keyframe", f"{first}-{last}"), shot_id,
                         f"Exact final-film reference frame {(first + last) // 2}; Dan approved the picture map. Original source: {row['retainedPatchSource']}", relative, now))
                    prepared.append({"shotId": shot_id, "frames": [first, last], "sceneSequence": spec["sceneSequence"],
                                     "sourceShotId": source_id, "keyframePath": relative, "keyframeSha256": frame_hash,
                                     "needsLipSync": spec["needsLipSync"]})
                for item in history:
                    db.execute("""INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
                        VALUES(?,?,'legacy_producer_reference','v34_original_keyframe','generate',?,'accepted',?,0,?)""",
                        (stable_id("v34-keyframe", item["donorShotId"]), item["donorShotId"],
                         f"Original {item['v45Beat']} keyframe, hash {item['keyframeSha256']}; historical note {item['approvalNoteId']} approved held motion/lip-sync review only. Dan's 2026-10-25 decision accepts this original as a scene-specific donor reference for the selected final film, without changing old rows.",
                         item["keyframePath"], now))
                sequence = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM edit_commands WHERE project_id=?", (PROJECT_ID,)).fetchone()[0]
                payload = {"schemaVersion": 1, "renderId": RENDER_ID, "mapSha256": map_hash, "approval": APPROVAL,
                           "historicalNoteId": note[0]["id"], "legacyShots": prepared,
                           "originalKeyframes": [{"beat": item["v45Beat"], "shotId": item["donorShotId"],
                               "path": item["keyframePath"], "sha256": item["keyframeSha256"]} for item in history]}
                db.execute("""INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone)
                    VALUES(?,?,?,'prepare_edition_donor_picture',?,?,?,0)""",
                    (stable_id("command", KEY), PROJECT_ID, sequence, json.dumps(payload, ensure_ascii=False), KEY, now))
                db.commit()
            except BaseException:
                db.rollback()
                raise
        plan_path = REVIEW / "approved-final-picture-plan.json"
        plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"status": "prepared", "legacyShots": len(prepared), "originalKeyframes": len(history),
                          "plan": str(plan_path), "backup": str(backup), "mapSha256": map_hash}))
    finally:
        db.close()

if __name__ == "__main__":
    main()
