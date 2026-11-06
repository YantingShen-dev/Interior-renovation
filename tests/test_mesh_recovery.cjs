const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMeshBridge}=require('../scripts/studio/mesh-providers.cjs');
const e={TRIPO_PROVIDER:'hunyuan',TRIPO_API_BASE:'https://tokenhub.tencentmaas.com/v1',TRIPO_MODEL:'hy-3d-express',TRIPO_API_KEY:'never-write-this-secret'};
test('persisted task retries a legacy size failure and caches large GLB separately',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-recovery-'));let submissions=0,downloads=0;
 const size=31*1024*1024;
 const options={storageDir:dir,dataImage:()=>({bytes:Buffer.from('image')}),credentials:()=>({base:e.TRIPO_API_BASE,key:e.TRIPO_API_KEY}),request:async(url,key,opts)=>{assert.equal(key,e.TRIPO_API_KEY);if(url.endsWith('/submit')){submissions++;assert.equal(JSON.parse(opts.body).enable_pbr,undefined);return {id:'remote-id',status:'queued',request_id:'submit-trace'};}return {status:'completed',request_id:'query-trace',data:[{type:'GLB',url:'https://example.test/model.glb'}]};},download:async(url,file)=>{
  downloads++;
  const header=Buffer.from('676c5446020000000c000000','hex');header.writeUInt32LE(size,8);
  fs.writeFileSync(file,header);fs.truncateSync(file,size);
 }};
 try{
  const original=createMeshBridge(options),{id}=await original.submit(e,'image');
  assert(!fs.readFileSync(path.join(dir,id+'.json'),'utf8').includes(e.TRIPO_API_KEY));
  const wrong=createMeshBridge({...options,credentials:()=>({base:e.TRIPO_API_BASE,key:'wrong'})});await assert.rejects(wrong.poll(id),/密钥/);
  const metadata=path.join(dir,id+'.json'),legacy=JSON.parse(fs.readFileSync(metadata,'utf8'));
  legacy.complete={status:'failed',stage:'downloading',error:'模型下载失败：模型超过 30MB'};
  fs.writeFileSync(metadata,JSON.stringify(legacy));
  const restored=createMeshBridge(options);assert.equal(restored.list()[0].remote_id,'remote-id');
  assert.equal(restored.list()[0].status,'download_failed');assert.equal((await restored.poll(id)).status,'download_failed');assert.equal(downloads,0);
  const first=await Promise.all([restored.poll(id,{retryDownload:true}),restored.poll(id,{retryDownload:true})]);
  assert(first.every(result=>result.stage==='downloading'));
  let result;
  for(let i=0;i<50;i++){
   result=await restored.poll(id);
   if(result.status!=='running')break;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(result.status,'success');assert.equal(result.model_bytes,size);assert.equal(result.model_url,`/api/tripo/${id}/model`);
  assert.equal(fs.statSync(restored.modelFile(id)).size,size);assert(fs.statSync(metadata).size<8192);
  const restarted=createMeshBridge(options);assert.deepEqual(await restarted.poll(id),JSON.parse(JSON.stringify(result)));assert.equal(restarted.modelFile(id),restored.modelFile(id));
  assert.equal(submissions,1);assert.equal(downloads,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('terminal upstream failure is returned as failed, not a retryable query error',async()=>{
 const bridge=createMeshBridge({dataImage:()=>({bytes:Buffer.from('image')}),request:async url=>url.endsWith('/submit')?{id:'remote'}:{status:'failed',error:{code:'FailedOperation.InnerError',message:'Internal error.'},request_id:'failure-trace'}});
 const {id}=await bridge.submit(e,'image'),r=await bridge.poll(id);assert.equal(r.status,'failed');assert.match(r.error,/InnerError.*failure-trace/);assert.deepEqual(await bridge.poll(id),r);
});
