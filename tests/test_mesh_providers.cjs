const assert=require('node:assert/strict');
const {createMeshBridge}=require('../scripts/studio/mesh-providers.cjs');
const {configuration,updateConfig,resolveEnv}=require('../scripts/studio/provider-config.cjs');
(async()=>{
 for(const p of ['hunyuan','meshy','tripo']){
  const cfg=updateConfig('',{},{tripo_provider:p,tripo_key:'test-key'});
  const e=resolveEnv(Object.fromEntries(cfg.trim().split('\n').map(l=>l.split('='))));assert(configuration(e).tripo.configured);
  const calls=[];let poll=0;
  const bridge=createMeshBridge({dataImage:()=>({bytes:Buffer.from('test-image'),type:'image/png'}),download:async()=>Buffer.from('676c5446020000000c000000','hex'),request:async(url,key,options={})=>{
   assert.equal(key,'test-key');calls.push({url,options});
   if(url.endsWith('/files'))return {file_token:'file'};
   if(url.endsWith('/submit')){const b=JSON.parse(options.body);assert.equal(b.result_format,'GLB');assert.equal(b.image_base64,Buffer.from('test-image').toString('base64'));return {id:'remote'};}
   if(url.endsWith('/generation/image-to-model'))return {task_id:'remote'};
   if(url.endsWith('/image-to-3d'))return {result:'remote'};
   poll++;
   if(p==='hunyuan')return poll===1?{status:'in_progress'}:{status:'completed',data:[{type:'GLB',url:'https://test.invalid/a.glb'}]};
   if(p==='meshy')return poll===1?{status:'IN_PROGRESS',progress:40}:{status:'SUCCEEDED',model_urls:{glb:'https://test.invalid/a.glb'}};
   return poll===1?{status:'running'}:{status:'success',output:{model:'https://test.invalid/a.glb'}};
  }});
  const {id}=await bridge.submit(e,'data:image/png;base64,dGVzdA==');e.TRIPO_PROVIDER='other';e.TRIPO_API_KEY='different';
  assert.equal((await bridge.poll(id)).status,'running');assert.equal((await bridge.poll(id)).stage,'downloading');await new Promise(resolve=>setImmediate(resolve));const done=await bridge.poll(id);assert(done.model_glb.startsWith('data:model/gltf-binary;base64,'));assert.deepEqual(await bridge.poll(id),done);assert.equal(poll,2);
  console.log('PASS '+p+' configuration, native submission/query, pinned credentials and GLB result');
 }
 await assert.rejects(createMeshBridge({}).poll('missing'),/找不到/);
})().catch(e=>{console.error(e);process.exitCode=1;});
