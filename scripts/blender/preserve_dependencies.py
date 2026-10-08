"""Save a portable COPY with dependencies; never save over the producer original.

blender --background --disable-autoexec edit.blend --python this.py -- --out NEW_DIR
Use a directory under HeartWordData/assets when importing into a chapter package.
Absolute source paths are mirrored under NEW_DIR; original relative relationships
are retained after make_paths_relative. Unsupported paths fail before a lock is made.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

import bpy


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preserve():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = Path(bpy.data.filepath).resolve()
    destination = Path(args.out).resolve()
    if not source.is_file() or destination.exists():
        raise ValueError("Open an existing .blend and choose a new bundle directory.")
    before = sha(source)
    for image in bpy.data.images:
        if image.source in {"SEQUENCE", "TILED"}:
            raise ValueError("Explicit sequence/UDIM inventory is required before preserving: " + image.name)
    for clip in bpy.data.movieclips:
        if clip.source == "SEQUENCE":
            raise ValueError("Explicit movie-clip sequence inventory is required: " + clip.name)
    paths = sorted({Path(p).resolve() for p in bpy.utils.blend_paths(absolute=True, packed=True, local=False) if p})
    # A directory, UDIM pattern or absent sequence member is never guessed.
    missing = [str(p) for p in paths if not p.is_file()]
    if missing:
        raise ValueError("Missing/unsupported Blender dependencies: " + "; ".join(missing))
    # Linked libraries may themselves contain absolute references. Hold those
    # until they have been made portable in their own editor; never silently
    # rewrite another library or resolve by ambiguous basename matching.
    for library in bpy.data.libraries:
        library_path = Path(bpy.path.abspath(library.filepath)).resolve()
        for block in list(bpy.data.images) + list(bpy.data.sounds) + list(bpy.data.movieclips) + list(bpy.data.fonts) + list(bpy.data.volumes) + list(bpy.data.cache_files):
            if block.library == library and getattr(block, "filepath", "") and os.path.isabs(block.filepath):
                raise ValueError("Linked library contains an absolute dependency: " + str(library_path) + ": " + block.filepath)
    bpy.ops.file.make_paths_relative()
    remaining = [p for p in bpy.utils.blend_paths(absolute=False, packed=True, local=False) if p and not p.startswith("//")]
    if remaining:
        raise ValueError("Dependencies could not be made relative (possibly cross-drive): " + "; ".join(remaining))
    def mirrored(path):
        drive = path.drive.rstrip(":").replace("\\", "_") or "root"
        return destination / drive / Path(*path.parts[1:])
    output = mirrored(source)
    for path in paths:
        target = mirrored(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with path.open("rb") as original, target.open("xb") as copy:
            shutil.copyfileobj(original, copy)
        if sha(target) != sha(path):
            raise ValueError("Dependency changed during copying: " + str(path))
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), copy=True, relative_remap=False)
    if sha(source) != before:
        raise ValueError("Original Blender file changed during preservation.")
    dependencies = [{"path": Path(os.path.relpath(mirrored(p), output.parent)).as_posix(), "sha256": sha(mirrored(p)), "sourceOriginal": str(p)} for p in paths]
    # Package path traversal is intentionally forbidden, so put the dependency
    # lock at the bundle root and use a root-relative inventory there. The
    # per-blend lock supplies an explicit bundleRoot for those relationships.
    payload = {"schemaVersion": 1, "portable": True, "blenderVersion": bpy.app.version_string,
               "blendSha256": sha(output), "sourceOriginal": str(source), "sourceSha256": before,
               "bundleRoot": Path(os.path.relpath(destination, output.parent)).as_posix(),
               "files": [{**item, "path": mirrored(p).relative_to(destination).as_posix()} for p, item in zip(paths, dependencies)],
               "enabledAddons": sorted(bpy.context.preferences.addons.keys()),
               "limitations": "Cross-drive paths, absent files, UDIM patterns, and absolute linked-library media hold export. Required addons/caches must be supplied explicitly."}
    with Path(str(output) + ".dependencies.json").open("x", encoding="utf8") as lock:
        json.dump(payload, lock, indent=2)
    print(json.dumps({"blend": str(output), "dependencies": len(paths), "blenderVersion": bpy.app.version_string}))


preserve()
