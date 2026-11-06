import assert from 'node:assert/strict';
import sampling from '../scripts/studio/video-sampling.cjs';
import {setupAutomaticRoom} from '../scripts/studio/automatic-room.mjs';
const ids={};
class Element{
 constructor(){this.children=[];this.hidden=false;this.value='';this.textContent='';this.open=false;}
 set id(value){this._id=value;ids[value]=this;}get id(){return this._id;}
 set innerHTML(html){for(const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element();e.id=m[1];e.hidden=m[0].includes(' hidden');}ids['ar-mode'].value='primitive';}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}showModal(){this.open=true;}close(){this.open=false;}
}
globalThis.document={createElement:()=>new Element(),getElementById:id=>ids[id],body:new Element()};
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction:()=>{const tx={objectStore:()=>({get(){const r={result:null};queueMicrotask(()=>r.onsuccess());return r;},put(){queueMicrotask(()=>tx.oncomplete());}})};return tx;}};request.onsuccess();});return request;}};
const plan={summary:'看到转角与一扇门',steps:[{goal:'先建立凹形墙体'},{goal:'放置门并核对收尾'}],uncertainties:['门宽暂估']};
let applied=false,frameTotal=2;
const draft={room:{length:4,width:3},walls:[{id:'a',start:[0,0],end:[0,3],thickness:.2}],openings:[],assets:[],furniture:[],ai_modeling:{completion:'partial',summary:'1 段墙，未闭合'}};
globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{
 if(url.endsWith('/latest-draft'))return {draft};
 if(url.endsWith('/config'))return {configured:true,model:'test-vision'};
 if(options?.method==='POST')return {id:'test-job'};
 return {status:'failed',draft,message:'门窗越界，已保留草稿',plan,events:['读图计划已完成','add_opening · 失败：门窗越界']};
}});
const app=setupAutomaticRoom({apply:async()=>{applied=true;},settings:async()=>{},extractFrames:async(file,progress,cancelled,options)=>({source:{name:file.name},frames:sampling.samplingPlan(frameTotal,options).times.map((seconds,i)=>({image:'f'+i,seconds,url:'data:image/jpeg;base64,dGVzdA=='}))})});const video={name:'test.mp4'};await app.open({file:video});assert.equal(ids['ar-start'].disabled,false);await ids['ar-start'].onclick();
assert.equal(ids['ar-plan'].hidden,false);assert.equal(ids['ar-plan-summary'].textContent,plan.summary);assert.equal(ids['ar-plan-steps'].children.length,2);assert(ids['ar-plan-uncertainties'].textContent.includes('门宽暂估'));
assert(ids['ar-records'].open);assert(ids['ar-log'].textContent.includes('门窗越界'));assert.equal(ids['ar-diagnostics'].href,'/api/ai-modeling/test-job/diagnostics');assert.equal(ids['ar-diagnostics'].hidden,false);assert.equal(ids['ar-start'].disabled,false);assert.equal(applied,false);
console.log('PASS auto-room UI shows read-image plan, expands exact failure, links diagnostics and never applies failed drafts');

assert.equal(ids['ar-draft'].hidden,false);assert.equal(ids['ar-apply'].hidden,false);assert(ids['ar-draft-summary'].textContent.includes('未闭合'));assert.equal(applied,false,'preview must not auto apply');await ids['ar-draft-open'].onclick();assert.equal(applied,true);console.log('PASS failed checkpoint preview and explicit open action');

frameTotal=10;await app.open({file:video});ids['ar-sampling-count'].value='5';ids['ar-sampling-count'].onchange();assert.equal(ids['ar-start'].disabled,true);assert.equal(ids['ar-retry'].hidden,false);await ids['ar-retry'].onclick();assert.equal(ids['ar-frames'].children.length,5);assert.equal(ids['ar-start'].disabled,false);
ids['ar-sampling-mode'].value='interval';ids['ar-sampling-interval'].value='3';ids['ar-sampling-mode'].onchange();await ids['ar-retry'].onclick();assert.equal(ids['ar-frames'].children.length,4);console.log('PASS changing sampling invalidates old frames and count/interval settings reach the automatic room frame picker');
