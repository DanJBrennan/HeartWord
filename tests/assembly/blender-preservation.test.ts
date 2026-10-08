import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { exportChapterPackage, restoreChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
const blender = process.env.BLENDER_PATH ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
it.skipIf(!existsSync(blender))("restores a Blender texture and linked library under another root without the originals", () => {
  const root = mkdtempSync(join(tmpdir(), "heartword-blender-package-"));
  const assets = join(root, "assets"), source = join(root, "original-blender"), bundle = join(assets, "portable-set");
  mkdirSync(source); mkdirSync(assets);
  const create = join(root, "create.py");
  writeFileSync(create, `import bpy\nfrom pathlib import Path\np = Path(${JSON.stringify(source)})\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name = 'LinkedBuilding'\nbpy.ops.wm.save_as_mainfile(filepath=str(p / 'library.blend'))\nbpy.ops.wm.read_factory_settings(use_empty=True)\nwith bpy.data.libraries.load(str(p / 'library.blend'), link=True, relative=True) as (source, target):\n    target.objects = ['LinkedBuilding']\nbpy.context.collection.objects.link(target.objects[0])\nimage = bpy.data.images.new('Texture', width=2, height=2)\nimage.filepath_raw = str(p / 'texture.png')\nimage.file_format = 'PNG'\nimage.save()\nimage.filepath = '//texture.png'\nimage.use_fake_user = True\nbpy.ops.wm.save_as_mainfile(filepath=str(p / 'scene.blend'))\n`);
  const run = (args: string[]) => execFileSync(blender, ["--background", "--disable-autoexec", ...args], { stdio: "pipe", timeout: 60000 });
  const db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  try {
    run(["--python", create]);
    run([join(source, "scene.blend"), "--python", resolve("scripts/blender/preserve_dependencies.py"), "--", "--out", bundle]);
    // Locate the copied scene using the helper's deterministic mirrored path.
    const drive = resolve(source).slice(0, 1), copied = join(bundle, drive, resolve(source).slice(3), "scene.blend");
    expect(existsSync(copied)).toBe(true);
    db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
    for (const [path, bytes] of [["source/hatam/mark-2/mark-2-text.docx", "source"], ["reference/english/mark-2/mark-2-text.docx", "reference"]]) {
      const file = join(assets, path!); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes!);
    }
    const packageDir = join(root, "package"), restored = join(root, "restored");
    const manifest = exportChapterPackage(db, root, "p", packageDir, { extraFiles: [copied] });
    expect(manifest.files.some(f => f.path.endsWith("library.blend"))).toBe(true);
    expect(manifest.files.some(f => f.path.endsWith("texture.png"))).toBe(true);
    restoreChapterPackage(packageDir, restored);
    renameSync(source, join(root, "offline-original-blender")); renameSync(assets, join(root, "offline-original-assets"));
    const scene = manifest.files.find(f => f.path.endsWith("scene.blend"))!;
    const verify = join(root, "verify.py");
    writeFileSync(verify, "import bpy\nfrom pathlib import Path\npaths = bpy.utils.blend_paths(absolute=True, packed=True, local=False)\nassert len(paths) >= 2, paths\nassert all(Path(p).is_file() for p in paths), paths\nassert bpy.data.objects.get('LinkedBuilding') is not None\nprint('RESTORED_BLENDER_DEPENDENCIES_OK')\n");
    expect(run([join(restored, scene.path), "--python", verify]).toString()).toContain("RESTORED_BLENDER_DEPENDENCIES_OK");
  } finally { db.close(); if (resolve(root).startsWith(resolve(tmpdir(), "heartword-blender-package-"))) rmSync(root, { recursive: true, force: true }); }
}, 120000);
