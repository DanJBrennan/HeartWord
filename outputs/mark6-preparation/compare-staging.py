"""Metadata comparison only; extended paths avoid false missing-file reports."""
import json
import os
from pathlib import Path

root = Path(r"\\?\C:\HeartWordBackupTemp")
destination = Path(r"\\?\C:\Users\danbr\OneDrive\Documents")
results = []
for top in root.iterdir():
    if not top.is_dir(): continue
    result = {"folder": top.name, "matchingSizeFiles": 0, "different": [], "missing": [], "errors": []}
    for folder, dirs, files in os.walk(top, followlinks=False):
        for name in files:
            path = Path(folder) / name
            other = destination / path.relative_to(root)
            try:
                relative = str(path.relative_to(root))
                if not other.is_file(): result["missing"].append({"file": relative, "bytes": path.stat().st_size})
                elif path.stat().st_size != other.stat().st_size:
                    result["different"].append({"file": relative, "stagingBytes": path.stat().st_size, "otherBytes": other.stat().st_size})
                else: result["matchingSizeFiles"] += 1
            except OSError as error:
                result["errors"].append({"file": str(path.relative_to(root)), "error": str(error)})
    results.append(result)
    print(json.dumps({"folder": top.name, "matchingSizeFiles": result["matchingSizeFiles"],
        "different": len(result["different"]), "missing": len(result["missing"]), "errors": len(result["errors"])}), flush=True)
out = {"readOnly": True, "fileContentsRead": False, "extendedPaths": True,
    "hashEqualityVerified": False, "comparisons": results,
    "limitation": "Equal sizes are not proof of byte equality or cloud availability; different files may be newer originals."}
path = Path(__file__).parent / "staging-metadata-extended-20261031.json"
path.write_text(json.dumps(out, indent=2), encoding="utf-8")
