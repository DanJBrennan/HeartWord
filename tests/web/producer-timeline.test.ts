import { expect,it,vi } from "vitest";
import type { ProductionView } from "../../src/server/production-view";
import { pictureTimeline, previewAudio, intervalAt, playbackGroup } from "../../src/web/producer-timeline";
function fixture() { return {
  programme:{durationMs:8000,timeline:[{shotId:'one',startMs:0,endMs:4000,sourceStartMs:1000},{shotId:'two',startMs:5000,endMs:8000,sourceStartMs:0}],
    source:[{id:'source',path:'source.wav',startMs:1000,endMs:8000,sourceStartMs:0,available:true,gainDb:0}],
    performance:[{id:'cast',path:'cast.wav',startMs:1000,endMs:8000,sourceStartMs:3000,available:true,gainDb:0}],
    cues:[{id:'music',kind:'music'},{id:'sfx',kind:'sfx'}]},
  reel:[{id:'clip',shotId:'one',sceneId:'s1',label:'Shot 1',path:'one.mp4',durationMs:3000}]
} as unknown as ProductionView; }
it('retains missing coverage and explicit picture gaps on the saved chapter clock',() => {
  const timeline=pictureTimeline(fixture(),'chapter');
  expect(timeline.durationMs).toBe(8000);
  expect(timeline.spans.map(item => [item.path,item.startMs,item.endMs,item.sourceStartMs])).toEqual([['one.mp4',0,2000,1000],[null,2000,4000,0],[null,4000,5000,0],[null,5000,8000,0]]);
  expect(intervalAt(timeline.spans,2500)?.path).toBeNull();
});
it('does not shift ambiguous components or absent footage into an immutable shot clock',() => {
  const data=fixture(); data.reel.push({...data.reel[0]!,id:'second',path:'second.mp4'});
  expect(pictureTimeline(data,'chapter').spans.every(item => item.path === null)).toBe(true);
  expect(pictureTimeline(data,'reel').durationMs).toBe(6000);
  data.reel=[]; expect(pictureTimeline(data,'chapter').durationMs).toBe(8000);
});
it('keeps scene subset reel clocks separate from chapter timing and does not invent audio',() => {
  const data=fixture();
  expect(pictureTimeline(data,'reel','s1').durationMs).toBe(3000); expect(pictureTimeline(data,'reel','another').durationMs).toBe(0);
  expect(pictureTimeline(data,'chapter','another').durationMs).toBe(8000);
});
it('selects exactly one speech performance and optional applied sound tracks',() => {
  const data=fixture();
  expect(previewAudio(data,'performance',true,true).map(item => item.id)).toEqual(['cast','music','sfx']);
  expect(previewAudio(data,'source',false,true).map(item => item.id)).toEqual(['source','sfx']);
  expect(previewAudio(data,'off',false,false)).toEqual([]);
});
it('allows intentional preview stems but solos external auditions and never stacks speech auditions',() => {
  const player=(group?:string) => ({dataset:{previewGroup:group},pause:vi.fn()}) as unknown as HTMLMediaElement;
  const picture=player('p'),speech=player('p'),music=player('p'),audition=player();
  playbackGroup(speech,[picture,speech,music,audition]); expect(picture.pause).not.toHaveBeenCalled(); expect(music.pause).not.toHaveBeenCalled(); expect(audition.pause).toHaveBeenCalledOnce();
  playbackGroup(audition,[picture,speech,music,audition]); expect(picture.pause).toHaveBeenCalledOnce(); expect(speech.pause).toHaveBeenCalledOnce(); expect(music.pause).toHaveBeenCalledOnce();
});
it('uses audible speech time rather than advancing beyond a delayed performance',async() => {
  const {performanceClock}=await import('../../src/web/producer-timeline');
  expect(performanceClock(2500,500,8000,{currentTime:3.8,startMs:1000,endMs:3000,sourceStartMs:3000})).toBe(1800);
  expect(performanceClock(2800,500,8000,{currentTime:5.1,startMs:1000,endMs:3000,sourceStartMs:3000})).toBe(3000);
  expect(performanceClock(3000,500,8000)).toBe(3500);
});
it('holds all preview media during buffering and resumes the group only when ready',async() => {
  const {maintainPreviewPlayback}=await import('../../src/web/producer-timeline');
  const media=(readyState:number) => ({readyState,seeking:false,paused:true,ended:false,pause:vi.fn(),play:vi.fn().mockResolvedValue(undefined)}) as unknown as HTMLMediaElement;
  const speech=media(4),picture=media(1),music=media(4),failed=vi.fn();
  expect(maintainPreviewPlayback([speech,picture,music],failed)).toBe(false);
  expect(speech.pause).toHaveBeenCalledOnce(); expect(music.pause).toHaveBeenCalledOnce(); expect(speech.play).not.toHaveBeenCalled();
  Object.assign(picture,{readyState:4});
  expect(maintainPreviewPlayback([speech,picture,music],failed)).toBe(true); expect(speech.play).toHaveBeenCalledOnce(); expect(picture.play).toHaveBeenCalledOnce();
});
it('follows appended accepted clips but rejects reel reordering, withdrawal and replacement',async() => {
  const {appendedReel}=await import('../../src/web/producer-timeline');
  expect(appendedReel(['a:one:2000'],['a:one:2000','b:two:2000'])).toBe(true);
  expect(appendedReel(['b:two:2000'],['a:one:2000','b:two:2000'])).toBe(false);
  expect(appendedReel(['a:one:2000'],[])).toBe(false);
  expect(appendedReel(['a:one:2000'],['a:replacement:2000'])).toBe(false);
});
