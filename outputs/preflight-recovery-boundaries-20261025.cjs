const fs = require("node:fs"), path = require("node:path");
const location = "outputs/disaster-backup-boundary-metadata-20261025.json";
const prior = JSON.parse(fs.readFileSync(location,"utf8"));
const ancestors = new Map();
for (const root of prior.roots) for (let p=path.dirname(path.resolve(root));;p=path.dirname(p)) {
  if (fs.existsSync(p)) {
    const stat=fs.lstatSync(p);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error("Unsafe recovery ancestor: "+p);
    ancestors.set(p,{path:p,directory:true,symbolicLink:false,ino:String(stat.ino),dev:String(stat.dev)});
  }
  if (path.dirname(p)===p) break;
}
fs.copyFileSync(location,location.replace(".json","-"+Date.now()+".json"),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(location,JSON.stringify({at:new Date().toISOString(),roots:prior.roots,ancestors:[...ancestors.values()],contentRead:false},null,2));
