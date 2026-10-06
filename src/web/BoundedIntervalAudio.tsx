import { useEffect, useRef, useState } from "react";

export type IntervalAudio={currentTime:number;pause:()=>void};
/** Seek a native player into its displayed source-evidence interval. */
export function beginInterval(audio:IntervalAudio,startSec:number,endSec:number) {
  if (!Number.isFinite(audio.currentTime) || audio.currentTime < startSec || audio.currentTime >= endSec) audio.currentTime=startSec;
}
/** Stop and reset so the next native play action begins at the displayed start. */
export function endInterval(audio:IntervalAudio,startSec:number) { audio.pause(); audio.currentTime=startSec; }

/** A reviewable, interval-relative clock.  Hundredths are deliberate: a
 * producer can name a usable edit point without mistaking chapter time for
 * time inside the displayed source excerpt. */
export function intervalTimecode(currentSec:number,startSec:number,endSec:number) {
  const elapsed=Math.min(Math.max(0,currentSec-startSec),Math.max(0,endSec-startSec));
  const duration=Math.max(0,endSec-startSec);
  return `${elapsed.toFixed(2)} / ${duration.toFixed(2)} s`;
}

export function BoundedIntervalAudio({src,startMs,endMs}:{src:string;startMs:number;endMs:number}) {
  const audioRef=useRef<HTMLAudioElement>(null), timerRef=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const startSec=startMs/1000,endSec=endMs/1000;
  const [currentSec,setCurrentSec]=useState(startSec);
  const clear=()=>{if(timerRef.current!==undefined){clearTimeout(timerRef.current);timerRef.current=undefined;}};
  const stop=()=>{const audio=audioRef.current;if(audio)endInterval(audio,startSec);setCurrentSec(startSec);clear();};
  const arm=()=>{const audio=audioRef.current;if(!audio)return;clear();const remaining=Math.max(0,endSec-audio.currentTime);timerRef.current=setTimeout(stop,remaining*1000);};
  useEffect(()=>()=>clear(),[]);
  return <span className="bounded-interval-audio">
    <audio ref={audioRef} controls preload="none" src={src}
      onPlay={()=>{const audio=audioRef.current;if(!audio)return;beginInterval(audio,startSec,endSec);setCurrentSec(audio.currentTime);arm();}}
      onTimeUpdate={()=>{const audio=audioRef.current;if(!audio)return;setCurrentSec(audio.currentTime);if(audio.currentTime>=endSec)stop();}}
      onSeeking={()=>{const audio=audioRef.current;if(audio)setCurrentSec(audio.currentTime);arm();}}
      onPause={clear}
      aria-label={`Play source interval ${startSec.toFixed(2)} to ${endSec.toFixed(2)} seconds`}
    />
    <output aria-label="Time within source interval">{intervalTimecode(currentSec,startSec,endSec)}</output>
  </span>;
}
