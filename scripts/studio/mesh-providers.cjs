const {tokenHubResult,tokenHubTask}=require('./tokenhub-response.cjs');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
// Separate transports: these providers do not share Tripo's wire protocol.
function createMeshBridge({request,download,dataImage,storageDir,credentials}){
 const jobs=new Map();
 const fingerprint=key=>crypto.createHash('sha256').update(key).digest('hex');
 const taskFile=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('任务 ID 无效');return path.join(storageDir,id+'.json');};
 function save(id,j){if(!storageDir)return;fs.mkdirSync(storageDir,{recursive:true});const {key,downloading,...safe}=j;const file=taskFile(id);fs.writeFileSync(file+'.tmp',JSON.stringify(safe));fs.renameSync(file+'.tmp',file);}
 function get(id){let j=jobs.get(id);if(!j&&storageDir){const file=taskFile(id);if(fs.existsSync(file)){j=JSON.parse(fs.readFileSync(file,'utf8'));jobs.set(id,j);}}return j;}
 function describe(id,j){return {id,provider:j.provider,model:j.model,remote_id:j.remote,created:j.created,status:j.complete?.status||j.last?.status||'queued',request_id:j.last?.request_id||j.request_id,error:j.complete?.error||j.last?.error};}
 function list(){if(storageDir&&fs.existsSync(storageDir))for(const name of fs.readdirSync(storageDir))if(/^[a-f0-9-]{36}\.json$/.test(name))get(name.slice(0,-5));return [...jobs].filter(([,j])=>Date.now()-j.created<86400000).map(([id,j])=>describe(id,j)).sort((a,b)=>b.created-a.created).slice(0,20);}
 function record(id,j,r){j.last={status:r?.status,request_id:r?.request_id,error:r?.error?.message||r?.message};j.history=(j.history||[]).concat({...j.last,at:Date.now(),code:r?.error?.code}).slice(-100);save(id,j);}
 async function submit(e,imageURL){
  const image=dataImage(imageURL),base=e.TRIPO_API_BASE.replace(/\/$/,''),key=e.TRIPO_API_KEY,model=e.TRIPO_MODEL,provider=e.TRIPO_PROVIDER;
  const post=(path,payload)=>request(base+path,key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let remote,requestId;
  if(provider==='hunyuan'){
   if(image.bytes.length>6*1024*1024)throw Error('混元 3D 图片不能超过 6MB');
   const r=await post('/api/3d/submit',{model,image_base64:image.bytes.toString('base64'),result_format:'GLB'});remote=tokenHubTask(r);requestId=r.request_id;
  }else if(provider==='meshy'){
   const r=await post('/image-to-3d',{image_url:imageURL,ai_model:model,enable_pbr:true,should_texture:true,target_formats:['glb']});remote=r.result;
  }else{
   const form=new FormData();form.append('file',new Blob([image.bytes],{type:image.type}),'furniture.'+image.type.split('/')[1]);
   const uploaded=await request(base+'/files',key,{method:'POST',body:form});
   if(!uploaded.file_token)throw Error('3D 服务没有返回上传文件 token');
   const r=await post('/generation/image-to-model',{input:uploaded.file_token,model,texture:true,pbr:true,compress:false});remote=r.task_id;
  }
  if(!remote)throw Error('3D 服务没有返回任务 ID');
  const id=crypto.randomUUID(),j={provider,base,key,key_hash:fingerprint(key),model,remote,request_id:requestId,created:Date.now()};jobs.set(id,j);save(id,j);
  // Expired task credentials are not retained indefinitely.
  for(const [old,j] of jobs)if(Date.now()-j.created>86400000)jobs.delete(old);
  return {id,remote_id:remote,request_id:requestId};
 }
 async function poll(id){
  const j=get(id);if(!j)throw Error('找不到此 3D 任务，请核对已保存任务编号；不要重复提交');
  if(j.complete)return j.complete;
  if(j.downloading)return {status:'running',stage:'downloading'};
  if(Date.now()-j.created>86400000)throw Error('服务商任务已超过 24 小时有效期');
  if(!j.key){const e=credentials?.(j);if(!e||e.base!==j.base||fingerprint(e.key||'')!==j.key_hash)throw Error('请恢复该任务提交时的服务商密钥后继续查询');j.key=e.key;}
  const {provider,base,key,model,remote}=j;let r,status,uri,progress,error;
  if(provider==='hunyuan'){
   r=await request(base+'/api/3d/query',key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,id:remote})});
   record(id,j,r);const parsed=tokenHubResult(r,{allowFailed:true});r=parsed.result;
   status={completed:'success',failed:'failed',queued:'queued',in_progress:'running'}[r.status];uri=r.data?.find(a=>a.type?.toLowerCase()==='glb')?.url;error=parsed.failure||r.error?.message||r.message;
  }else if(provider==='meshy'){
   r=await request(base+'/image-to-3d/'+encodeURIComponent(remote),key);
   status={SUCCEEDED:'success',FAILED:'failed',CANCELED:'failed',PENDING:'queued',IN_PROGRESS:'running'}[r.status];uri=r.model_urls?.glb;progress=r.progress;error=r.task_error?.message;
  }else{
   r=await request(base+'/tasks/'+encodeURIComponent(remote),key);status=r.status;uri=r.output?.model_url||r.output?.model;progress=r.progress;error=r.error_msg;
  }
  if(!status)throw Error('3D 服务返回未知任务状态：'+String(r.status));
  const value={status,stage:status==='success'?'calibration':status,progress,error,remote_id:remote,request_id:r.request_id};
  if(status==='success'){
   if(!uri||!/^https:\/\//.test(uri))throw Error('3D 服务没有返回可下载的 GLB');
   j.downloading=true;
   // Return the download stage immediately; subsequent polls receive the cached model.
   Promise.resolve().then(()=>download(uri)).then(bytes=>{
    if(bytes.length<12||bytes.length>30*1024*1024||bytes.readUInt32LE(0)!==0x46546c67)throw Error('模型不是 GLB 或超过 30MB');
    j.complete={...value,progress:100,model_glb:'data:model/gltf-binary;base64,'+bytes.toString('base64')};
   }).catch(e=>{j.complete={status:'failed',stage:'downloading',error:'模型下载失败：'+e.message};}).finally(()=>{j.downloading=false;j.key='';save(id,j);});
   return {status:'running',stage:'downloading'};
  }else if(status==='failed'){j.complete=value;j.key='';save(id,j);}
  return value;
 }
 return {submit,poll,list};
}
module.exports={createMeshBridge};
