import { useEffect, useRef } from "react";

export type IntervalAudio={currentTime:number;pause:()=>void};
/** Seek a native player into its displayed source-evidence interval. */
export function beginInterval(audio:IntervalAudio,startSec:number,endSec:number) {
  if (!Number.isFinite(audio.currentTime) || audio.currentTime < startSec || audio.currentTime >= endSec) audio.currentTime=startSec;
}
/** Stop and reset so the next native play action begins at the displayed start. */
export function endInterval(audio:IntervalAudio,startSec:number) { audio.pause(); audio.currentTime=startSec; }

export function BoundedIntervalAudio({src,startMs,endMs}:{src:string;startMs:number;endMs:number}) {
  const audioRef=useRef<HTMLAudioElement>(null), timerRef=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const startSec=startMs/1000,endSec=endMs/1000;
  const clear=()=>{if(timerRef.current!==undefined){clearTimeout(timerRef.current);timerRef.current=undefined;}};
  const stop=()=>{const audio=audioRef.current;if(audio)endInterval(audio,startSec);clear();};
  const arm=()=>{const audio=audioRef.current;if(!audio)return;clear();const remaining=Math.max(0,endSec-audio.currentTime);timerRef.current=setTimeout(stop,remaining*1000);};
  useEffect(()=>()=>clear(),[]);
  return <audio ref={audioRef} controls preload="none" src={src}
    onPlay={()=>{const audio=audioRef.current;if(!audio)return;beginInterval(audio,startSec,endSec);arm();}}
    onTimeUpdate={()=>{const audio=audioRef.current;if(audio&&audio.currentTime>=endSec)stop();}}
    onSeeking={arm}
    onPause={clear}
    aria-label={`Play source interval ${startSec.toFixed(2)} to ${endSec.toFixed(2)} seconds`}
  />;
}
