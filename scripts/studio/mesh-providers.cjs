const {tokenHubResult,tokenHubTask}=require('./tokenhub-response.cjs');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {normalizeMeshInput}=require('./mesh-input.cjs');
// Separate transports: these providers do not share Tripo's wire protocol.
function createMeshBridge({request,download,dataImage,storageDir,credentials}){
 const jobs=new Map(),queries=new Map();
 const fingerprint=key=>crypto.createHash('sha256').update(key).digest('hex');
 const taskFile=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('任务 ID 无效');return path.join(storageDir,id+'.json');};
 function save(id,j){if(!storageDir)return;fs.mkdirSync(storageDir,{recursive:true});const {key,downloading,...safe}=j;const file=taskFile(id);fs.writeFileSync(file+'.tmp',JSON.stringify(safe));fs.renameSync(file+'.tmp',file);}
 function get(id){let j=jobs.get(id);if(!j&&storageDir){const file=taskFile(id);if(fs.existsSync(file)){j=JSON.parse(fs.readFileSync(file,'utf8'));jobs.set(id,j);}}return j;}
 const downloadFailed=j=>j.complete?.stage==='downloading'&&['failed','download_failed'].includes(j.complete.status);
 function describe(id,j){return {id,provider:j.provider,model:j.model,input_count:j.input_count||1,remote_id:j.remote,created:j.created,status:j.downloading?'downloading':downloadFailed(j)?'download_failed':j.complete?.status||j.last?.status||'queued',request_id:j.last?.request_id||j.request_id,error:j.complete?.error||j.last?.error};}
 function modelFile(id){
  const job=get(id);
  if(!storageDir||job?.complete?.status!=='success'||!job.complete.model_url)return null;
  const file=path.join(storageDir,id+'.glb');
  return fs.existsSync(file)?file:null;
 }
 function validateGLB(header,bytes){
  if(bytes<12||header.readUInt32LE(0)!==0x46546c67||header.readUInt32LE(4)!==2||header.readUInt32LE(8)!==bytes)throw Error('模型文件不完整或不是 GLB 2.0');
 }
 async function cacheModel(id,uri,provider){
  if(!storageDir){
   const bytes=await download(uri);
   validateGLB(bytes,bytes.length);
   return {model_glb:'data:model/gltf-binary;base64,'+bytes.toString('base64')};
  }
  const file=path.join(storageDir,id+'.glb'),temp=file+'.part';
  try{
   await download(uri,temp,provider);
   const fd=await fs.promises.open(temp,'r');
   let size;
   try{
    const header=Buffer.alloc(12);
    await fd.read(header,0,header.length,0);
    size=(await fd.stat()).size;
    validateGLB(header,size);
   }finally{await fd.close();}
   await fs.promises.rename(temp,file);
   return {model_url:'/api/tripo/'+id+'/model',model_bytes:size};
  }finally{await fs.promises.rm(temp,{force:true});}
 }
 function list(){if(storageDir&&fs.existsSync(storageDir))for(const name of fs.readdirSync(storageDir))if(/^[a-f0-9-]{36}\.json$/.test(name))get(name.slice(0,-5));return [...jobs].filter(([,j])=>j.complete?.status==='success'||Date.now()-j.created<86400000).map(([id,j])=>describe(id,j)).sort((a,b)=>b.created-a.created).slice(0,20);}
 function record(id,j,r){j.last={status:r?.status,request_id:r?.request_id,error:r?.error?.message||r?.message};j.history=(j.history||[]).concat({...j.last,at:Date.now(),code:r?.error?.code}).slice(-100);save(id,j);}
 async function submit(e,input){
  const references=normalizeMeshInput(input,dataImage),image=references[0],imageURL=image.image,base=e.TRIPO_API_BASE.replace(/\/$/,''),key=e.TRIPO_API_KEY,model=typeof input==='object'&&input.model||e.TRIPO_MODEL,provider=e.TRIPO_PROVIDER,multi=references.length>1;
  if(provider==='hunyuan'&&!['hy-3d-express','hy-3d-3.0','hy-3d-3.1'].includes(model))throw Error('请选择已接入的混元 3D 模型');
  if(provider==='hunyuan'&&multi&&model==='hy-3d-express')throw Error('混元极速版仅支持单图；多图请选择混元 3.1 或 3.0 专业版');
  if(provider!=='hunyuan'&&references.length>4)throw Error('当前服务最多支持 4 张参考图');
  if(provider!=='hunyuan'&&references.some(r=>!['front','left','back','right'].includes(r.view)))throw Error('当前服务仅支持正面、左侧、背面和右侧视角');
  if(provider==='hunyuan'&&references.some(r=>r.bytes.toString('base64').length>6*1024*1024))throw Error('混元参考图编码后每张须小于 6MB，请压缩图片');
  if(provider==='hunyuan'&&multi&&references.some(r=>!['image/png','image/jpeg'].includes(r.type)))throw Error('混元多视图请使用 JPG 或 PNG 图片');
  const post=(path,payload)=>request(base+path,key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let remote,requestId;
  if(provider==='hunyuan'){
   if(image.bytes.length>6*1024*1024)throw Error('混元 3D 图片不能超过 6MB');
   const payload={model,image_base64:image.bytes.toString('base64'),...(model==='hy-3d-express'?{result_format:'GLB'}:{generate_type:'Normal'}),...(multi?{multi_view_images:references.slice(1).map(r=>({view_type:r.view,view_image_base64:r.bytes.toString('base64')}))}:{})};
   const r=await post('/api/3d/submit',payload);remote=tokenHubTask(r);requestId=r.request_id;
  }else if(provider==='meshy'){
   const r=await post(multi?'/multi-image-to-3d':'/image-to-3d',{...(multi?{image_urls:references.map(r=>r.image)}:{image_url:imageURL}),ai_model:model,enable_pbr:true,should_texture:true,target_formats:['glb']});remote=r.result;
  }else{
   const uploaded=[];for(const ref of references){const form=new FormData();form.append('file',new Blob([ref.bytes],{type:ref.type}),'furniture-'+ref.view+'.'+ref.type.split('/')[1]);const result=await request(base+'/files',key,{method:'POST',body:form});if(!result.file_token)throw Error('3D 服务没有返回上传文件 token');uploaded.push({[ref.view]:result.file_token});}
   const r=await post(multi?'/generation/multiview-to-model':'/generation/image-to-model',{...(multi?{inputs:uploaded}:{input:Object.values(uploaded[0])[0]}),model,texture:true,pbr:true,compress:false});remote=r.task_id;
  }
  if(!remote)throw Error('3D 服务没有返回任务 ID');
  const id=crypto.randomUUID(),j={provider,base,key,key_hash:fingerprint(key),model,remote,multi,input_count:references.length,request_id:requestId,created:Date.now()};jobs.set(id,j);save(id,j);
  // Expired task credentials are not retained indefinitely.
  for(const [old,j] of jobs)if(Date.now()-j.created>86400000)jobs.delete(old);
  return {id,remote_id:remote,request_id:requestId};
 }
 async function poll(id,{retryDownload=false}={}){
  const j=get(id);if(!j)throw Error('找不到此 3D 任务，请核对已保存任务编号；不要重复提交');
  if(j.downloading)return {status:'running',stage:'downloading'};
  if(j.complete){
   if(!downloadFailed(j))return j.complete;
   if(!retryDownload)return {...j.complete,status:'download_failed'};
  }
  if(queries.has(id))return queries.get(id);
  const pending=query(id,j).finally(()=>queries.delete(id));
  queries.set(id,pending);
  return pending;
 }
 async function query(id,j){
  if(Date.now()-j.created>86400000)throw Error('服务商任务已超过 24 小时有效期');
  if(!j.key){const e=credentials?.(j);if(!e||e.base!==j.base||fingerprint(e.key||'')!==j.key_hash)throw Error('请恢复该任务提交时的服务商密钥后继续查询');j.key=e.key;}
  const {provider,base,key,model,remote}=j;let r,status,uri,progress,error;
  if(provider==='hunyuan'){
   r=await request(base+'/api/3d/query',key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,id:remote})});
   record(id,j,r);const parsed=tokenHubResult(r,{allowFailed:true});r=parsed.result;
   status={completed:'success',failed:'failed',queued:'queued',in_progress:'running'}[r.status];uri=r.data?.find(a=>a.type?.toLowerCase()==='glb')?.url;error=parsed.failure||r.error?.message||r.message;
  }else if(provider==='meshy'){
   r=await request(base+(j.multi?'/multi-image-to-3d/':'/image-to-3d/')+encodeURIComponent(remote),key);
   status={SUCCEEDED:'success',FAILED:'failed',CANCELED:'failed',PENDING:'queued',IN_PROGRESS:'running'}[r.status];uri=r.model_urls?.glb;progress=r.progress;error=r.task_error?.message;
  }else{
   r=await request(base+'/tasks/'+encodeURIComponent(remote),key);status=r.status;uri=r.output?.model_url||r.output?.model;progress=r.progress;error=r.error_msg;
  }
  if(!status)throw Error('3D 服务返回未知任务状态：'+String(r.status));
  const value={status,stage:status==='success'?'calibration':status,progress,error,remote_id:remote,request_id:r.request_id};
  if(status==='success'){
   if(!uri||!/^https:\/\//.test(uri))throw Error('3D 服务没有返回可下载的 GLB');
   j.downloading=true;
   cacheModel(id,uri,provider).then(model=>{
    j.complete={...value,progress:100,...model};
   }).catch(e=>{
    j.complete={...value,status:'download_failed',stage:'downloading',error:'模型下载失败：'+e.message};
   }).finally(()=>{j.downloading=false;j.key='';save(id,j);}).catch(error=>{
    console.error('无法保存 3D 任务状态：'+(error.code||error.name));
   });
   return {status:'running',stage:'downloading'};
  }else if(status==='failed'){j.complete=value;j.key='';save(id,j);}
  return value;
 }
 return {submit,poll,list,modelFile};
}
module.exports={createMeshBridge};
