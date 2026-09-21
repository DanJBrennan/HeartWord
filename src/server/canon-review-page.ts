import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { criticSampledAssets } from "../pipeline/qc/canon-critic.js";
import { getDataDir } from "../db/client.js";

/**
 * Renders the canon review page from the live database on each request,
 * so the producer has a bookmarkable URL that is never stale rather than
 * a generated file someone has to remember to rebuild.
 *
 * Reference images are served by their real /media paths (the same static
 * route the app already exposes over HEARTWORD_DATA_DIR/assets) rather
 * than inlined, which keeps the page small and lets the browser cache
 * them between visits.
 *
 * The page deliberately surfaces WHICH images the garment critic actually
 * sampled. It reads at most two per character, preferring body poses, so a
 * "no mantle, no tassels" verdict reached from a turnaround alone is not
 * the same evidence as one reached from two full-body poses -- see
 * pipeline/qc/canon-critic.ts.
 */
interface CanonRow {
  id: string; name: string; scope_kind: string; region: string;
  joined_narrative_at: string | null; versionId: string; version_label: string;
  notes: string | null; voice_id: string | null;
}

/** Whether a character asset's file is actually on disk. Injectable so the
 *  tests can describe a canon without writing image files; production
 *  resolves it against the real asset directory, because the critic skips
 *  what it cannot open and this page must report what it really saw. */
export type AssetExists = (relativePath: string) => boolean;

const assetOnDisk: AssetExists = (relativePath) => existsSync(join(getDataDir(), "assets", relativePath));

export function renderCanonReviewPage(db: DatabaseSync, projectId: string, exists: AssetExists = assetOnDisk): string {
  const characters = db.prepare(
    `SELECT c.id, c.name, c.scope_kind, c.region, c.joined_narrative_at,
            cv.id AS versionId, cv.version_label, cv.notes, cv.voice_id
     FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
     WHERE c.canon_status = 'approved' ORDER BY c.name`
  ).all() as unknown as CanonRow[];

  const assetStmt = db.prepare("SELECT category, path FROM character_assets WHERE character_version_id = ? ORDER BY category, path");
  const reviewStmt = db.prepare(
    "SELECT note FROM review_notes WHERE subject_type='character_version' AND subject_id=? AND source='qc' ORDER BY created_at DESC LIMIT 1"
  );
  const overrideStmt = db.prepare(
    "SELECT note FROM review_notes WHERE subject_type='character_version' AND subject_id=? AND source='human' ORDER BY created_at"
  );
  const supersededStmt = db.prepare("SELECT version_label FROM character_versions WHERE character_id=? AND status='superseded' ORDER BY created_at");
  const shotsStmt = db.prepare(
    `SELECT sh.verse_ref FROM shot_characters sc JOIN shots sh ON sh.id = sc.shot_id
     JOIN scenes s ON s.id = sh.scene_id WHERE sc.character_id = ? AND s.project_id = ? ORDER BY s.sequence, sh.sequence`
  );

  const data = characters.map(c => {
    const assets = assetStmt.all(c.versionId) as unknown as Array<{ category: string; path: string }>;
    const review = reviewStmt.get(c.versionId) as { note: string } | undefined;
    const severity = review ? (review.note.match(/severity: (\w+)/)?.[1] ?? "unreviewed") : "unreviewed";
    const sampledAssets = criticSampledAssets(assets, exists);
    const sampled = sampledAssets.map(a => a.category);
    const sampledPaths = sampledAssets.map(a => a.path);
    return {
      sampledPaths,
      name: c.name, scope: c.scope_kind, region: c.region, version: c.version_label,
      joined: c.joined_narrative_at, voiced: Boolean(c.voice_id),
      superseded: (supersededStmt.all(c.id) as unknown as Array<{ version_label: string }>).map(r => r.version_label),
      notes: c.notes ?? "",
      // Not "a body pose is recorded" but "the critic read one": body poses
      // rank first, so a recorded-but-missing file demotes the verdict to a
      // turnaround without anything else marking that it happened.
      assets, sampled, hasBodyPose: sampled.includes("body_pose"),
      severity,
      findings: review ? review.note.replace(/^Canon garment review \([^)]*\), severity: \w+:\n?/, "") : "",
      overrides: (overrideStmt.all(c.versionId) as unknown as Array<{ note: string }>).map(r => r.note.replace(/^Producer override:\s*/, "")),
      shots: (shotsStmt.all(c.id, projectId) as unknown as Array<{ verse_ref: string | null }>).map(r => r.verse_ref).filter(Boolean)
    };
  });

  // JSON goes into a script tag, so a name or finding containing "</script>"
  // must not be able to close it early.
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>HeartWord canon review</title>
<style>
:root{--bg:#12151a;--card:#1b1f27;--line:#2b313c;--ink:#e9ecf1;--dim:#98a2b3;
--severe:#f2555a;--moderate:#f0a13c;--minor:#e2cc4a;--none:#4ec98a;--unreviewed:#7a8699}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;background:#12151ae6;backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:14px 20px;z-index:5}
h1{margin:0 0 4px;font-size:1.05rem}
.sub{color:var(--dim);font-size:.82rem}
.bar{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
button{background:#232936;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:.8rem;cursor:pointer}
button.on{background:#34405a;border-color:#4a5a7a}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:18px 20px 40px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;cursor:pointer;transition:transform .12s,border-color .12s}
.card:hover{transform:translateY(-2px);border-color:#44506a}
.thumb{width:100%;aspect-ratio:16/10;object-fit:cover;background:#0d1015;display:block}
.body{padding:9px 11px 11px}
.nm{font-weight:600;font-size:.88rem;line-height:1.25}
.meta{color:var(--dim);font-size:.74rem;margin-top:3px}
.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:.68rem;font-weight:700;text-transform:uppercase;color:#10131a}
.flag{display:inline-block;margin-top:6px;font-size:.7rem;color:#f0a13c;border:1px solid #6b4f24;border-radius:4px;padding:1px 5px}
dialog{border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);max-width:min(1100px,94vw);width:100%;padding:0}
dialog::backdrop{background:#000b}
.dh{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--card)}
.dc{padding:16px 18px 24px}
.shelf{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
figure{margin:0;width:190px}
figure img{width:100%;border-radius:7px;border:1px solid var(--line);background:#0d1015;cursor:zoom-in;display:block}
figcaption{color:var(--dim);font-size:.7rem;margin-top:4px}
pre{white-space:pre-wrap;font:12.5px/1.6 ui-monospace,monospace;background:#0f1218;border:1px solid var(--line);border-radius:8px;padding:12px;max-height:46vh;overflow:auto}
.kv{color:var(--dim);font-size:.78rem;margin-bottom:10px}
.ov{background:#1a2a20;border:1px solid #2f5a3f;border-radius:7px;padding:9px 11px;margin-bottom:12px;font-size:.82rem}
#zoom{position:fixed;inset:0;background:#000d;display:none;align-items:center;justify-content:center;z-index:50;cursor:zoom-out}
#zoom img{max-width:94vw;max-height:94vh;border-radius:8px}
.empty{padding:40px 20px;color:var(--dim)}
</style></head><body>
<header><h1>HeartWord canon review</h1><div class="sub" id="sub"></div><div class="bar" id="bar"></div></header>
<main id="grid"></main>
<dialog id="detail"><div class="dh"><div><div class="nm" id="dTitle"></div><div class="kv" id="dMeta"></div></div><button onclick="detail.close()">Close</button></div><div class="dc" id="dBody"></div></dialog>
<div id="zoom" onclick="this.style.display='none'"><img id="zoomImg" alt=""></div>
<script>
const DATA = JSON.parse(${JSON.stringify(payload)});
const SEV = ["severe","moderate","minor","none","unreviewed"];
const COL = {severe:"var(--severe)",moderate:"var(--moderate)",minor:"var(--minor)",none:"var(--none)",unreviewed:"var(--unreviewed)"};
let filter = null, onlyThin = false;
const rank = s => SEV.indexOf(s);
const url = p => "/media/" + p.split("/").map(encodeURIComponent).join("/");
const pick = c => (c.assets.find(a=>a.category==="headshot") || c.assets[0] || {}).path;
const esc = s => String(s).replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));

function draw(){
  const rows = DATA.filter(c => (!filter || c.severity===filter) && (!onlyThin || !c.hasBodyPose))
                   .sort((a,b)=> rank(a.severity)-rank(b.severity) || a.name.localeCompare(b.name));
  sub.textContent = DATA.length + " approved canon characters \\u00b7 " +
    SEV.map(s=>DATA.filter(c=>c.severity===s).length+" "+s).join(" \\u00b7 ") + " \\u00b7 showing " + rows.length;
  grid.innerHTML = DATA.length === 0 ? '<div class="empty">No approved canon characters yet.</div>' : rows.map(c=>{
    const p = pick(c);
    return '<div class="card" data-i="'+DATA.indexOf(c)+'">' +
      (p?'<img class="thumb" loading="lazy" src="'+url(p)+'" alt="">':'<div class="thumb"></div>') +
      '<div class="body"><div class="nm">'+esc(c.name)+'</div>' +
      '<div class="meta"><span class="pill" style="background:'+COL[c.severity]+'">'+c.severity+'</span> \\u00b7 '+esc(c.version)+' \\u00b7 '+esc(c.scope)+'</div>' +
      '<div class="meta">'+c.assets.length+' assets \\u00b7 critic saw: '+esc(c.sampled.join(", ")||"none")+'</div>' +
      (!c.hasBodyPose?'<div class="flag">no body pose \\u2014 verdict unproven</div>':'') + '</div></div>';
  }).join("");
}
bar.innerHTML = '<button data-f="" class="on">All</button>' + SEV.map(s=>'<button data-f="'+s+'">'+s+'</button>').join("") +
  '<button data-thin="1">Only without body pose</button>';
bar.onclick = e => {
  const b = e.target.closest("button"); if(!b) return;
  if (b.dataset.thin !== undefined){ onlyThin=!onlyThin; b.classList.toggle("on",onlyThin); }
  else { filter = b.dataset.f || null; [...bar.querySelectorAll("button[data-f]")].forEach(x=>x.classList.toggle("on",x===b)); }
  draw();
};
grid.onclick = e => {
  const card = e.target.closest(".card"); if(!card) return;
  const c = DATA[+card.dataset.i];
  dTitle.textContent = c.name;
  dMeta.innerHTML = '<span class="pill" style="background:'+COL[c.severity]+'">'+c.severity+'</span> \\u00b7 '+esc(c.version)+
    (c.superseded.length?' (superseded '+esc(c.superseded.join(", "))+')':'') + ' \\u00b7 '+esc(c.scope)+' \\u00b7 '+esc(c.region)+
    (c.voiced?' \\u00b7 voiced':' \\u00b7 no voice mapping') + (c.joined?' \\u00b7 joins '+esc(c.joined):'') +
    (c.shots.length?' \\u00b7 Mark 3: '+esc(c.shots.join(", ")):' \\u00b7 not in the Mark 3 plan');
  dBody.innerHTML =
    '<div class="shelf">' + c.assets.map(a=>'<figure><img src="'+url(a.path)+'" alt="" onclick="zoomImg.src=this.src;zoom.style.display=\\'flex\\'"><figcaption>'+esc(a.category)+(c.sampledPaths.includes(a.path)?' \\u2022 sampled by critic':'')+'</figcaption></figure>').join("") + '</div>' +
    (c.overrides.length?'<div class="ov"><b>Producer overrides</b><br>'+c.overrides.map(o=>"\\u2022 "+esc(o)).join("<br>")+'</div>':'') +
    (!c.hasBodyPose?'<div class="ov" style="background:#2a2118;border-color:#6b4f24">The critic read no body pose for this character, so it judged the garment from a turnaround or headshot alone. A "no mantle / no tassels" verdict is unproven here rather than confirmed.</div>':'') +
    '<pre>'+ esc(c.findings || "(no canon garment review on record)") +'</pre>' +
    (c.notes?'<div class="kv" style="margin-top:12px"><b>Canon notes</b></div><pre>'+esc(c.notes)+'</pre>':'');
  detail.showModal();
};
draw();
</script></body></html>`;
}
