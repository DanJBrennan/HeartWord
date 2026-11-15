"""Render a reviewable set-view candidate. Never save/alter the input .blend.

blender --background --disable-autoexec set.blend --python snapshot_set.py -- request.json
The stage wrapper pins the request to the existing accepted production run.
"""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


request = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
source = Path(bpy.data.filepath).resolve()
if digest(source) != request["sourceSha256"]:
    raise ValueError("Set model changed after preparation")
camera_spec = request["camera"]
for field in ("positionM", "targetM"):
    if len(camera_spec[field]) != 3 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in camera_spec[field]):
        raise ValueError("Camera vectors require three finite metre values")
for field in ("lensMm", "sensorWidthMm", "metersPerBlenderUnit"):
    if not isinstance(camera_spec[field], (int, float)) or not math.isfinite(camera_spec[field]) or camera_spec[field] <= 0:
        raise ValueError("Explicit positive lens/sensor/scale required")
output = Path(request["output"])
metadata_path = Path(str(output) + ".json")
if output.exists() or metadata_path.exists():
    raise ValueError("Snapshot output already exists")
scale = camera_spec["metersPerBlenderUnit"]
position = Vector(camera_spec["positionM"]) / scale
target = Vector(camera_spec["targetM"]) / scale
if (target - position).length < 0.000001:
    raise ValueError("Camera and target coincide")
scene = bpy.context.scene
camera = bpy.data.objects.new("HeartWordSnapshotCamera", bpy.data.cameras.new("HeartWordSnapshotCamera"))
scene.collection.objects.link(camera)
camera.location = position
camera.rotation_euler = (target - position).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = camera_spec["lensMm"]
camera.data.sensor_width = camera_spec["sensorWidthMm"]
camera.data.sensor_fit = "HORIZONTAL"
scene.camera = camera
# A headless snapshot must not require an interactive graphics context. Cycles
# CPU also avoids Intel OpenGL driver crashes seen during the full suite.
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(output)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
if digest(source) != request["sourceSha256"]:
    raise ValueError("Set model changed during render; hold snapshot")
dependencies = []
for path in sorted(set(bpy.utils.blend_paths(absolute=True, packed=True, local=False))):
    dep = Path(path)
    dependencies.append({"path": str(dep), "sha256": digest(dep) if dep.is_file() else None})
metadata = {**request, "blenderVersion": bpy.app.version_string, "source": str(source),
            "renderer": "Cycles CPU, 16 samples",
            "outputSha256": digest(output), "dependencies": dependencies,
            "cameraMatrixWorld": [list(row) for row in camera.matrix_world],
            "coordinateConvention": "Right handed Z up; camera local -Z forward, +Y up; positions/target in declared set-world metres",
            "status": "candidate", "authority": "Camera view only; no new canon, archaeology or hidden-geometry approval"}
with metadata_path.open("x", encoding="utf-8") as stream:
    json.dump(metadata, stream, indent=2)
print("HEARTWORD_SET_SNAPSHOT " + str(output))
