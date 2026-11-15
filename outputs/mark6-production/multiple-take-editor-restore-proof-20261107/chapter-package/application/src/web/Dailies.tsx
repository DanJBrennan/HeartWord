import { useEffect, useState } from "react";

type Daily={attempt_id:string;provider:string;model:string;operation:string;status:string;result_asset_path:string;cost_usd:number;scene_sequence:number;shot_sequence:number;action:string;verse_ref:string|null;keyframe_path:string|null;critic_verdict:string|null;timeline_positions:string|null};
export function Dailies({projectId}:{projectId:string}) {
  const [items,setItems]=useState<Daily[]|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let open=true; fetch(`/api/projects/${projectId}/dailies`).then(async r=>{if(!r.ok)throw new Error("Could not load dailies.");return r.json()}).then(x=>{if(open)setItems(x.attempts)}).catch(e=>{if(open)setError(e.message)});return()=>{open=false};},[projectId]);
  if(error)return <p className="error">{error}</p>;
  if(!items)return <p className="hint">Loading retained dailies…</p>;
  if(!items.length)return <p className="empty">No restart-pilot media candidates yet. The reel remains empty until a new clip passes review and is accepted.</p>;
  return <div>{items.map(item=><article key={item.attempt_id} className="scene-block">
    <h3>Scene {item.scene_sequence}, Shot {item.shot_sequence} — {item.operation.replaceAll("_"," ")} · {item.status.replaceAll("_"," ")}</h3>
    <p>{item.verse_ref ?? "Editorial"} · {item.provider} / {item.model} · ${item.cost_usd.toFixed(2)} · timeline {item.timeline_positions ?? "not selected"}</p>
    <p className="hint">{item.action}</p>
    <video controls preload="metadata" src={`/media/${item.result_asset_path}`} style={{maxWidth:560,width:"100%"}} />
    <p className="hint">Sampled frame positions</p><div style={{display:"flex",gap:6,overflowX:"auto"}}>{[0,0.25,0.5,0.75,0.99].map((point,index)=><video key={point} muted preload="metadata" src={`/media/${item.result_asset_path}#t=${point * 8}`} aria-label={`Sample ${index+1}`} style={{width:130,height:75,objectFit:"cover"}} />)}</div>
    {item.keyframe_path&&<img src={`/media/${item.keyframe_path}`} alt="Approved keyframe" style={{maxWidth:220,display:"block",marginTop:8}} />}
    {item.critic_verdict&&<details><summary>Critic verdict and cost policy</summary><p style={{whiteSpace:"pre-wrap"}}>{item.critic_verdict}</p></details>}
  </article>)}</div>;
}
