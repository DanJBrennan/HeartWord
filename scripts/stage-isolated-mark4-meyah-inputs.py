"""Copy exact Mark 4 Meyah and approved-canon inputs into the isolated root.

Live HeartWordData and the supplied Meyah text are read only. This does not
create a Meyah project, bind source, accept a voice, or call a provider.
"""
import hashlib
import json
import shutil
import sqlite3
import sys
from pathlib import Path

CHECKOUT = Path(__file__).resolve().parent.parent
ROOT = CHECKOUT / "output" / "mark4-donor-20261024"
TARGET = (ROOT / "assets").resolve()
SOURCE = Path(r"C:\Users\danbr\HeartWordData\assets").resolve()
SUPPLIED_MEYAH = Path(r"C:\Users\danbr\OneDrive\Documents\OpenAI-Code Comics\assets\Meyah\Mark\Mark 4.docx").resolve()
DB_PATH = ROOT / "db" / "heartword.sqlite"
PROJECT_ID = "8a5659a4-b033-4d5f-80e2-904b217cf8a0"
RENDER_ID = "deefa536-62f9-41b3-bbac-e9e8fb244206"
SOURCE_FILES = [
    "source/meyah/text/Mark/Mark 4.docx",
    "source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3",
    "source/english-esv/text/Mark/Mark 4.docx",
]

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def contained(root: Path, relative: str) -> Path:
    result = (root / relative.replace("\\", "/")).resolve()
    if not result.is_relative_to(root):
        raise ValueError(f"Unsafe asset reference: {relative}")
    return result

def main():
    if sys.argv[1:] not in (["--check"], ["--apply"]):
        raise SystemExit("Use exactly --check or --apply")
    if ROOT.is_symlink() or DB_PATH.is_symlink() or not DB_PATH.is_file():
        raise ValueError("Expected the fixed isolated donor database")
    if sha(contained(SOURCE, SOURCE_FILES[0])) != sha(SUPPLIED_MEYAH):
        raise ValueError("HeartWord's Meyah Mark 4 text differs from Dan's supplied document")
    db = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    try:
        picture = json.loads(db.execute("SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?", (RENDER_ID,)).fetchone()[0])
        selected = sorted({item["shotId"] for item in picture if item.get("shotId")})
        bindings = db.execute(f"""SELECT DISTINCT cv.id, a.source_path FROM shot_utterance_bindings b
            JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id
            JOIN character_versions cv ON cv.id=b.character_version_id
            LEFT JOIN composite_audio_source_map m ON m.original_segment_id=b.source_audio_segment_id AND m.voice_version_id=cv.id
            LEFT JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=sc.project_id
            WHERE sc.project_id=? AND sh.id IN ({','.join('?' for _ in selected)})""", (PROJECT_ID, *selected)).fetchall()
        versions = sorted({row[0] for row in bindings})
        if len(versions) != 2:
            raise ValueError("Expected the selected Jesus and Peter voice versions")
        files = set(SOURCE_FILES)
        for _, cast_path in bindings:
            if cast_path:
                files.add(cast_path.replace("\\", "/"))
        for version in versions:
            for (path,) in db.execute("SELECT path FROM character_assets WHERE character_version_id=? AND asset_role='scene_reference'", (version,)):
                files.add(path.replace("\\", "/"))
        if len(files) < 20:
            raise ValueError("Expected chapter sources, cast masters and approved visual references")
        manifest = []
        for relative in sorted(files):
            source = contained(SOURCE, relative)
            target = contained(TARGET, relative)
            if not source.is_file():
                raise FileNotFoundError(source)
            digest = sha(source)
            if target.exists() and sha(target) != digest:
                raise ValueError(f"Isolated asset conflicts with live source: {relative}")
            status = "already_present" if target.exists() else "ready_to_copy"
            if sys.argv[1:] == ["--apply"] and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                if sha(target) != digest:
                    target.unlink()
                    raise ValueError(f"Copy hash failed: {relative}")
                status = "copied"
            manifest.append({"path": relative, "sha256": digest, "status": status})
        if sys.argv[1:] == ["--apply"]:
            review = ROOT / "review"
            review.mkdir(parents=True, exist_ok=True)
            (review / "staged-meyah-and-canon-inputs.json").write_text(json.dumps({"files": manifest,
                "sourceTextMatchesSuppliedDocument": True, "liveDataWasReadOnly": True}, indent=2), encoding="utf-8")
        print(json.dumps({"status": "staged" if sys.argv[1:] == ["--apply"] else "ready",
            "files": len(manifest), "copied": sum(item["status"] == "copied" for item in manifest),
            "voiceVersions": versions, "sourceTextSha256": sha(SUPPLIED_MEYAH)}))
    finally:
        db.close()

if __name__ == "__main__":
    main()
