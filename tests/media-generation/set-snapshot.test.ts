import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const blender=process.env.BLENDER_PATH ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
it.skipIf(!existsSync(blender))("renders a real pinned set view with exact camera provenance and leaves its Blender source untouched",()=>{
  const root=mkdtempSync(join(tmpdir(),"hw-set-snapshot-")),model=join(root,"fixture.blend"),output=join(root,"view.png"),spec=join(root,"request.json");
  const run=(args:string[])=>execFileSync(blender,["--background","--disable-autoexec","--python-exit-code","1",...args],{windowsHide:true,stdio:"pipe",timeout:90000});
  const modelJson=JSON.stringify(model).replaceAll("\\\\","/");
  run(["--python-expr",`import bpy; bpy.ops.mesh.primitive_cube_add(); bpy.ops.wm.save_as_mainfile(filepath=${modelJson})`]);
  const hash=()=>createHash("sha256").update(readFileSync(model)).digest("hex"),before=hash();
  writeFileSync(spec,JSON.stringify({sourceSha256:before,sourceRecordRef:"synthetic-fixture-only",reason:"Test exact camera without changing building",output,camera:{positionM:[0,-5,2],targetM:[0,0,0],lensMm:35,sensorWidthMm:36,metersPerBlenderUnit:1}}));
  run([model,"--python",resolve("scripts/blender/snapshot_set.py"),"--",spec]);
  expect(existsSync(output)).toBe(true);expect(hash()).toBe(before);
  const provenance=JSON.parse(readFileSync(`${output}.json`,"utf8"));
  expect(provenance).toMatchObject({sourceSha256:before,status:"candidate",camera:{lensMm:35,sensorWidthMm:36,positionM:[0,-5,2]},blenderVersion:expect.any(String)});
  expect(provenance.cameraMatrixWorld).toHaveLength(4);
  expect(()=>run([model,"--python",resolve("scripts/blender/snapshot_set.py"),"--",spec])).toThrow();
},120000);
