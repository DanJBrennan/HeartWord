"""Copy accepted Mark 4 non-speaking takes into the isolated edition assets.

The original HeartWordData database is never opened. This only stages files
referenced by the selected donor picture, verifies bytes and writes a review
manifest. It does not choose trims or approve target correspondence.
"""
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path


CHECKOUT = Path(__file__).resolve().parent.parent
ISOLATED = CHECKOUT / "output" / "mark4-donor-20261024"
ORIGINAL_ASSETS = Path("C:/Users/danbr/HeartWordData/assets")
TARGET = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
DONOR = "8a5659a4-b033-4d5f-80e2-904b217cf8a0"


def contained(base: Path, relative: str) -> Path:
    clean = relative.replace("\\", "/")
    if not clean or Path(clean).is_absolute() or ":" in clean or ".." in Path(clean).parts:
        raise RuntimeError(f"Unsafe picture path: {relative}")
    full = (base / clean).resolve()
    if not full.is_relative_to(base.resolve()):
        raise RuntimeError(f"Picture path escapes its asset root: {relative}")
    return full


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    if not ISOLATED.resolve().is_relative_to(CHECKOUT.resolve()):
        raise RuntimeError("The review data root must stay inside this checkout")
    db = sqlite3.connect((ISOLATED / "db" / "heartword.sqlite").resolve().as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        origin_row = db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition' AND undone=0", (TARGET,)).fetchone()
        if not origin_row:
            raise RuntimeError("The isolated Meyah edition is unavailable")
        origin = json.loads(origin_row["payload"])
        if origin["preflight"]["donor"]["projectId"] != DONOR:
            raise RuntimeError("The selected donor changed")
        selected = {item["shotId"] for item in origin["preflight"]["pictureEvidence"]}
        rows = db.execute("""SELECT ga.id AS attempt_id,ga.shot_id,ga.result_asset_path,ga.provider,sc.sequence
            FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
            WHERE sc.project_id=? AND sh.needs_lip_sync=0 AND ga.operation='generate_final_video'
              AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL AND ga.provider!='legacy_silent_picture'
            ORDER BY sc.sequence,sh.sequence,ga.created_at,ga.id""", (DONOR,)).fetchall()
        candidates = [dict(row) for row in rows if row["shot_id"] in selected]
        if not candidates:
            raise RuntimeError("No selected donor shot has a separate accepted picture take")
        files: dict[str, dict] = {}
        for candidate in candidates:
            relative = candidate["result_asset_path"].replace("\\", "/")
            source = contained(ORIGINAL_ASSETS, relative)
            if not source.is_file():
                raise RuntimeError(f"Accepted donor picture is unavailable: {relative}")
            digest = sha256(source)
            target = contained(ISOLATED / "assets", relative)
            if target.exists():
                if sha256(target) != digest:
                    raise RuntimeError(f"Isolated picture differs from retained source: {relative}")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
                if sha256(source) != digest or sha256(target) != digest:
                    target.unlink(missing_ok=True)
                    raise RuntimeError(f"Accepted picture changed while staging: {relative}")
            files[relative] = {"path": relative, "sha256": digest, "bytes": target.stat().st_size}
            candidate["result_asset_path"] = relative
            candidate["sha256"] = digest
        receipt = {"kind": "isolated_review_assets_only", "targetProjectId": TARGET,
                   "donorProjectId": DONOR, "donorRenderId": origin["preflight"]["donor"]["renderId"],
                   "files": sorted(files.values(), key=lambda item: item["path"]), "candidates": candidates,
                   "scope": "Accepted non-speaking source takes staged for trim review; no target shot or picture selection."}
        path = ISOLATED / "review" / "mark4-meyah-picture-handles.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"receipt": str(path), "files": len(files), "candidates": len(candidates),
                          "bytes": sum(item["bytes"] for item in files.values())}))
    finally:
        db.close()


if __name__ == "__main__":
    main()
