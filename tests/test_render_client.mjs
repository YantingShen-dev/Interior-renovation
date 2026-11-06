import assert from 'node:assert/strict';
import {renderImage,pendingRender} from '../scripts/studio/render-client.mjs';
const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},calls=[];
let fail=false,query=0;
const api=async(url,data)=>{calls.push({url,data});if(data)return {id:'job-1',status:'queued',message:'排队中'};if(fail)throw Error('断网');return ++query<2?{id:'job-1',status:'processing',message:'生成中'}:{image:'data:image/png;base64,fixture'};};
const opts={storage,sleep:async()=>{}};
const r=await renderImage(api,{prompt:'room'},opts);assert(r.image);assert.equal(calls.filter(c=>c.data).length,1);assert.equal(pendingRender(storage),null);console.log('PASS asynchronous render submits once and polls until result');
fail=true;await assert.rejects(()=>renderImage(api,{prompt:'room'},opts),/原任务已保留/);assert.equal(pendingRender(storage).id,'job-1');const submits=calls.filter(c=>c.data).length;fail=false;await renderImage(api,null,{...opts,resume:true});assert.equal(calls.filter(c=>c.data).length,submits);assert.equal(pendingRender(storage),null);console.log('PASS interrupted render resumes its saved task without another paid submission');
let tick=0;await assert.rejects(()=>renderImage(async(url,data)=>({id:'slow',status:'queued'}),{}, {...opts,now:()=>tick++,timeout:0}),/继续查询/);assert(pendingRender(storage));console.log('PASS waiting timeout retains the queryable task');
