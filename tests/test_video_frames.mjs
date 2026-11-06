import assert from 'node:assert/strict';
import {localFrames} from '../scripts/studio/video-room.mjs';
let initialDuration=Infinity,videoWidth=1920,seeks=[],requests=0;
class Video extends EventTarget {
 constructor(){super();this.duration=initialDuration;this.videoWidth=videoWidth;this.videoHeight=1080;this.time=0;}
 set src(value){queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}
 get currentTime(){return this.time;}
 set currentTime(value){seeks.push(value);this.time=value;if(value===1e10)this.duration=4;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
 removeAttribute(){} load(){}
}
globalThis.document={createElement:tag=>tag==='video'?new Video():{getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,dGVzdA=='}};
globalThis.location={protocol:'http:'};
const file=new Blob(['test-video'],{type:'video/webm'});file.name='recording.webm';
globalThis.fetch=async(url,options)=>{requests++;assert.equal(url,'/api/video/frames');assert.equal(options.body,file);return {ok:true,json:async()=>({frames:[{seconds:0},{seconds:1}],source:{duration:2}})};};
let result=await localFrames(file);assert.equal(result.frames.length,20);assert.equal(result.source.duration,4);assert.equal(requests,0);assert(seeks.includes(1e10));
result=await localFrames(file,()=>{},()=>false,{count:6,limit:24});assert.equal(result.frames.length,6);assert.equal(result.source.sampling.count,6);
result=await localFrames(file,()=>{},()=>false,{mode:'interval',interval:1.5,limit:24});assert.deepEqual(result.frames.map(f=>f.seconds),[0,1.5,3]);
await assert.rejects(()=>localFrames(file,()=>{},()=>false,{mode:'interval',interval:.1,limit:24}),/最多 24 帧/);assert.equal(requests,0,'dense settings must not trigger fallback decoding');
initialDuration=.01;seeks=[];await localFrames(file);assert(seeks.every(t=>t>=0));
videoWidth=0;let fallbackStatus='';result=await localFrames(file,(_,message)=>{if(message)fallbackStatus=message;});assert.equal(requests,1);assert.match(fallbackStatus,/本机解码/);assert.equal(result.source.name,file.name);
await assert.rejects(()=>localFrames(file,()=>{},()=>true),/已取消/);assert.equal(requests,1);
globalThis.fetch=async()=>({ok:false,json:async()=>({error:'解码失败'})});await assert.rejects(()=>localFrames(file),/重新读取视频/);
console.log('PASS missing browser duration recovery, short-video seek bounds, local decode fallback, cancellation and retry guidance');
