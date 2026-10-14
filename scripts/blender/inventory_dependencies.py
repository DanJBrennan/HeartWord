"""Read-only disaster inventory. Run Blender with --background --disable-autoexec.
blender --background --disable-autoexec --python this.py -- DATA_ROOT REPORT.json
Never saves, modifies, relinks, renders or executes an embedded script.
"""
import json
from pathlib import Path
import sys
import bpy

root, report = map(Path, sys.argv[sys.argv.index("--") + 1:])
projects = []
for source in sorted(root.rglob("*.blend")):
    try:
        bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
        paths = sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False)))
        dependencies = []
        for path in paths:
            p = Path(path).resolve()
            dependencies.append({"path": str(p), "exists": p.is_file(), "bytes": p.stat().st_size if p.is_file() else None,
                                 "insideData": p.is_relative_to(root.resolve())})
        projects.append({"project": str(source), "dependencies": dependencies,
                         "addons": sorted(bpy.context.preferences.addons.keys()),
                         "engine": bpy.context.scene.render.engine})
    except Exception as error:
        projects.append({"project": str(source), "error": str(error)})
with report.open("x", encoding="utf8") as output:
    json.dump({"blenderVersion": bpy.app.version_string, "root": str(root), "projects": projects,
               "limitations": "Read-only path inventory; sequences, caches and addon availability need original editor validation. Packed media remains in each blend."}, output, indent=2)
print("Disaster inventory:", len(projects), "Blender projects")
