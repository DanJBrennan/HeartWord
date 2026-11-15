import { useEffect, useRef, useState } from "react";
import type { PreviewInterval } from "../server/producer-preview";
import type { PictureSpan } from "./producer-timeline";
import { intervalAt, performanceClock, maintainPreviewPlayback } from "./producer-timeline";
import { mediaUrl } from "./production-playback";

function ClockMedia({ item, timeMs, playing, group, video, master, onError }: { item: PreviewInterval; timeMs: number; playing: boolean; group: string; video?: boolean; master?: boolean; onError: (message: string) => void }) {
  const ref = useRef<HTMLMediaElement | null>(null);
  function align() {
    const element = ref.current; if (!element) return;
    element.playbackRate = 1; element.volume = Math.min(1, Math.pow(10,item.gainDb/20));
    const seek = (item.sourceStartMs + timeMs-item.startMs)/1000;
    if (element.readyState > 0 && (Math.abs(element.currentTime-seek) > .18 || !playing)) element.currentTime = seek;
    // The shared transport resumes media only when every enabled player is
    // ready; one late picture must not let speech run past its saved boundary.
    if (!playing && !element.paused) element.pause();
  }
  useEffect(align,[timeMs,playing,item.path,item.startMs]);
  useEffect(() => { const element = ref.current; return () => { element?.pause(); }; },[]);
  const props = { src: mediaUrl(item.path), "data-preview-group": group, "data-clock-master":master ? "speech" : undefined, "data-start-ms":item.startMs, "data-source-start-ms":item.sourceStartMs, "data-end-ms":item.endMs, preload: "auto", onLoadedMetadata: () => { const element = ref.current; if (element && (item.sourceStartMs+item.endMs-item.startMs)/1000 > element.duration+.1) onError(`Media is shorter than its saved placement: ${item.path}. No freeze or speech stretch is inferred.`); else align(); }, onCanPlay: align, onError: () => onError(`Media could not be loaded/decoded: ${item.path}. Preview stopped; saved approval is unchanged.`) };
  return video ? <video {...props} ref={element => { ref.current = element; }} muted playsInline aria-label="Accepted picture preview" /> : <audio {...props} ref={element => { ref.current = element; }} aria-label={`Mapped audio ${item.id}`} />;
}

export function TimelineMonitor({ spans, audio, durationMs, timeMs, onTime, playing, onPlaying, picture, group, onSelectShot, proposal }: {
  spans: PictureSpan[]; audio: Array<PreviewInterval & { lane?: string }>; durationMs: number; timeMs: number; onTime: (ms: number) => void; playing: boolean; onPlaying: (playing: boolean, finished?: boolean) => void; picture: boolean; group: string; onSelectShot: (id: string) => void; proposal?: { path: string; label: string };
}) {
  const root = useRef<HTMLDivElement>(null), [error,setError] = useState(""), [buffering,setBuffering] = useState(false);
  const position = useRef(timeMs); position.current = timeMs;
  const duration = useRef(durationMs); duration.current = durationMs;
  const pictureItem = intervalAt(spans,timeMs), activeAudio = audio.filter(item => item.startMs <= timeMs && item.endMs > timeMs);
  const fail = (message: string) => { setError(message); onPlaying(false); };
  useEffect(() => { if (playing && pictureItem?.shotId) onSelectShot(pictureItem.shotId); },[pictureItem?.shotId,playing]);
  useEffect(() => { if (playing) setError(""); },[group,playing]);
  useEffect(() => {
    if (playing && activeAudio.some(item => !item.available)) fail("A mapped speech or soundtrack file is missing. Disable that review track or restore its recorded file before playback.");
  },[playing,activeAudio.map(item => `${item.id}:${item.available}`).join("|")]);
  useEffect(() => {
    if (!playing) { setBuffering(false); return; }
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now-last; last = now;
      const players = [...root.current?.querySelectorAll<HTMLMediaElement>("audio,video") ?? []];
      const waiting = !maintainPreviewPlayback(players,fail);
      setBuffering(waiting);
      if (!waiting) {
        const speech = players.find(element => element.dataset.clockMaster === "speech");
        // The audible performance drives chapter time. A wall clock could
        // otherwise advance past a loading/delayed word and sever its ending.
        const next = performanceClock(position.current,elapsed,duration.current,speech ? {currentTime:speech.currentTime,startMs:Number(speech.dataset.startMs),endMs:Number(speech.dataset.endMs),sourceStartMs:Number(speech.dataset.sourceStartMs)} : undefined);
        onTime(next);
        if (next >= duration.current) onPlaying(false,true);
      }
    },50);
    return () => window.clearInterval(timer);
  },[playing,group]);
  return <div className="timeline-monitor" ref={root}>
    {picture && pictureItem?.path && !error ? <ClockMedia key={pictureItem.path} item={{ ...pictureItem,path:pictureItem.path,available:true,gainDb:0 }} video timeMs={timeMs} playing={playing} group={group} onError={fail} /> : proposal && !error ? <div className="proposal-monitor"><img src={mediaUrl(proposal.path)} alt={proposal.label} /><strong>PROPOSAL · KEYFRAME ONLY</strong></div> : <div className="monitor-gap"><span className="monitor-reticle">＋</span><strong>{error ? "Playback unavailable" : picture ? pictureItem?.label ?? "No accepted picture at this position" : "Picture track disabled"}</strong><small>Missing coverage stays visible in the chapter clock.</small></div>}
    {activeAudio.filter(item => item.available).map(item => <ClockMedia key={item.id} item={item} timeMs={timeMs} playing={playing} group={group} master={item.lane === "speech"} onError={fail} />)}
    {buffering && <span className="monitor-badge">Buffering · clock held</span>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </div>;
}
