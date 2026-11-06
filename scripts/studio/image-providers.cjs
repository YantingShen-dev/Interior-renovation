/* Native image-edit adapters. Submit once; async tasks are queried by persisted ID. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {collectReferences}=require('./render-reference.cjs');
const {tencentHeaders,klingToken}=require('./image-auth.cjs');
const {getProvider}=require('./provider-catalog.cjs');
function imageValue(item){
 if(item?.b64_json)return 'data:image/'+(item.output_format==='jpeg'||item.b64_json.startsWith('/9j/')?'jpeg':item.b64_json.startsWith('UklGR')?'webp':'png')+';base64,'+item.b64_json;
 if(item?.inlineData?.data||item?.inline_data?.data){const d=item.inlineData||item.inline_data;if(!/^image\/(png|jpeg|webp)$/.test(d.mimeType||d.mime_type||''))throw Error('图像模型返回了不支持的图片格式');return 'data:'+(d.mimeType||d.mime_type)+';base64,'+d.data;}
 if(typeof item==='string'&&/^https:\/\//.test(item))return item;
 if(item?.url&&/^https:\/\//.test(item.url))return item.url;
 if(item?.image&&/^https:\/\//.test(item.image))return item.image;
 return null;
}
function upstreamError(r){const issue=r?.Response?.Error||r?.error;if(issue)throw Error(String(issue.Code||issue.code||'生成失败')+'：'+String(issue.Message||issue.message||issue)+'（请求 '+String(r.Response?.RequestId||r.request_id||'未知')+'）');}
function prepareInput(data,dataImage,p){
 const refs=collectReferences(data,dataImage),limit=p?.maxImages||5;if(refs.images.length>limit)throw Error((p?.name||'此服务')+' 最多支持 '+limit+' 张输入图片（包含空间底图），请移除多余参考图片；文字和表格附件仍可使用');
 const prompt='第一张图片是当前空间，严格保持其相机透视、门窗和家具布局，不添加不存在的开口。如有后续参考图片，只参考其风格、色彩、材质与光照，不复制其户型。生成写实装修效果图。用户要求：'+String(data.prompt||'').trim()+refs.text;
 if(!String(data.prompt||'').trim())throw Error('请填写效果描述');
 if(prompt.length>(p?.maxPrompt||22000))throw Error((p?.name||'此服务')+' 的描述含参考文字最多 '+p.maxPrompt+' 字，请精简描述和表格');
 if(p?.formats)for(const image of refs.images)if(!p.formats.includes(image.type))throw Error(p.name+' 仅支持 JPG / PNG 输入，请转换参考图片格式');
 return {...refs,prompt};
}
function createImageBridge({request,dataImage,credentials,storageDir,download,now=Date.now}){
 const memory=new Map(),active=new Map();
 const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('渲染任务 ID 无效');return path.join(storageDir,id+'.json');};
 const save=job=>{memory.set(job.id,job);if(storageDir){fs.mkdirSync(storageDir,{recursive:true});fs.writeFileSync(file(job.id),JSON.stringify(job));}return job;};
 const load=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('渲染任务 ID 无效');if(memory.has(id))return memory.get(id);if(!storageDir||!fs.existsSync(file(id)))throw Error('找不到此渲染任务');const job=JSON.parse(fs.readFileSync(file(id),'utf8'));memory.set(id,job);return job;};
 const view=job=>({id:job.id,provider:job.provider,model:job.model,status:job.status,message:job.message,...(job.image?{image:job.image}:{}),...(job.error?{error:job.error}:{})});
 async function json(url,key,payload,headers={}){return request(url,key,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),rawResult:true});}
 async function finish(job,image){if(!image)throw Error('服务商未返回可用图片');if(/^https:\/\//.test(image)&&download)image=await download(image);job.status='success';job.message='效果图已生成';job.image=image;save(job);return view(job);}
 function tc(e,action,payload){const body=JSON.stringify(payload),url=new URL(e.IMAGE_API_BASE);if(url.hostname!=='hunyuan.tencentcloudapi.com'||url.pathname!=='/')throw Error('混元原生服务地址须为 https://hunyuan.tencentcloudapi.com');return request(url.href,undefined,{method:'POST',headers:tencentHeaders({accessId:e.IMAGE_ACCESS_ID,key:e.IMAGE_API_KEY,action,body,now:now()}),body,rawResult:true});}
 async function submit(e,data){
  const id=e.IMAGE_PROVIDER||'custom',p=getProvider('image',id);if(p?.pending)throw Error('此服务尚未接入');if(!e.IMAGE_API_KEY||!e.IMAGE_API_BASE||!e.IMAGE_MODEL||(p?.auth==='pair'||p?.auth==='key-or-pair'&&e.IMAGE_AUTH_MODE==='pair')&&!e.IMAGE_ACCESS_ID)throw Error('请在配置服务中填写 '+(p?.name||'图像服务')+' 的'+(p?.auth==='pair'?'两项密钥':' API Key')+'和模型');
  const input=prepareInput(data,dataImage,p),base=e.IMAGE_API_BASE.replace(/\/$/,''),job={id:crypto.randomUUID(),provider:id,base,model:e.IMAGE_MODEL,status:'processing',message:'正在生成效果图',created_at:new Date(now()).toISOString()};
  if(['hunyuan','kling'].includes(id)){
   if(id==='hunyuan'){
    if(input.images[0].bytes.toString('base64').length>=8*1024*1024)throw Error('混元空间参考图转为 Base64 后须小于 8MB，请降低截图分辨率');
    const r=await tc(e,'SubmitHunyuanImageJob',{Prompt:input.prompt,ContentImage:{ImageBase64:input.images[0].bytes.toString('base64')},Num:1,Revise:0});upstreamError(r);const result=r.Response;if(!result?.JobId)throw Error('混元未返回任务 ID');job.task_id=result.JobId;job.request_id=result.RequestId;
   }else{
    const r=await json(base+'/images/omni-image',(e.IMAGE_AUTH_MODE==='pair'?klingToken(e.IMAGE_ACCESS_ID,e.IMAGE_API_KEY,now()):e.IMAGE_API_KEY),{model_name:e.IMAGE_MODEL,prompt:input.prompt,image_list:input.images.map(i=>({image:i.bytes.toString('base64')})),resolution:'1k',n:1,aspect_ratio:'auto'});upstreamError(r);if(!r.data?.task_id)throw Error('可灵未返回任务 ID');job.task_id=r.data.task_id;job.request_id=r.request_id;
   }
   job.status='queued';job.message=(p?.name||id)+' 任务已提交，正在等待结果';save(job);return view(job);
  }
  let r,image;
  if(id==='gemini'){
   r=await json(base+'/models/'+encodeURIComponent(e.IMAGE_MODEL)+':generateContent',undefined,{contents:[{role:'user',parts:[{text:input.prompt},...input.images.map(i=>({inlineData:{mimeType:i.type,data:i.bytes.toString('base64')}}))]}],generationConfig:{responseModalities:['TEXT','IMAGE']}},{'x-goog-api-key':e.IMAGE_API_KEY});upstreamError(r);
   const parts=(r.candidates||[]).flatMap(c=>c.content?.parts||[]);image=parts.map(imageValue).find(Boolean);if(!image)throw Error('Gemini 未返回图片：'+String(r.promptFeedback?.blockReason||r.candidates?.[0]?.finishReason||parts.find(p=>p.text)?.text||'请检查模型是否支持图片输出').slice(0,300));
  }else if(id==='qwen'){
   r=await json(base+'/services/aigc/multimodal-generation/generation',e.IMAGE_API_KEY,{model:e.IMAGE_MODEL,input:{messages:[{role:'user',content:[...input.images.map(i=>({image:i.data})),{text:input.prompt}]}]},parameters:{n:1,prompt_extend:false}});upstreamError(r);image=(r.output?.choices||[]).flatMap(c=>c.message?.content||[]).map(imageValue).find(Boolean);
  }else if(id==='jimeng'){
   r=await json(base+'/images/generations',e.IMAGE_API_KEY,{model:e.IMAGE_MODEL,prompt:input.prompt,image:input.images.length===1?input.images[0].data:input.images.map(i=>i.data),response_format:'b64_json',size:'2K',stream:false});upstreamError(r);image=(r.data||[]).map(imageValue).find(Boolean);
  }else{
   const form=new FormData();for(const image of input.images)form.append(input.images.length===1?'image':'image[]',new Blob([image.bytes],{type:image.type}),image.name);form.append('model',e.IMAGE_MODEL);form.append('prompt',input.prompt);form.append('n','1');r=await request(base+'/images/edits',e.IMAGE_API_KEY,{method:'POST',body:form,rawResult:true});upstreamError(r);image=(r.data||[]).map(imageValue).find(Boolean);
  }
  return finish(job,image);
 }
 async function query(id){
  const job=load(id);if(['success','failed'].includes(job.status))return view(job);const e=await credentials(job);if(e.IMAGE_API_BASE.replace(/\/$/,'')!==job.base)throw Error('此任务的服务地址已变更，请恢复原地址后继续查询');
  let r;
  // Transport errors leave the task queryable. Never re-submit a charged job.
  if(job.provider==='hunyuan'){r=await tc(e,'QueryHunyuanImageJob',{JobId:job.task_id});upstreamError(r);r=r.Response;const status=String(r?.JobStatusCode);if(status==='5')return finish(job,(r.ResultImage||[]).map(imageValue).find(Boolean));if(status==='4'){job.status='failed';job.error=String(r.JobErrorCode||'混元生成失败')+'：'+String(r.JobErrorMsg||r.JobStatusMsg||'未知原因');}else{job.status=status==='1'?'queued':'processing';job.message=r.JobStatusMsg||'混元正在生成效果图';}}
  else if(job.provider==='kling'){r=await request(job.base+'/images/omni-image/'+encodeURIComponent(job.task_id),(e.IMAGE_AUTH_MODE==='pair'?klingToken(e.IMAGE_ACCESS_ID,e.IMAGE_API_KEY,now()):e.IMAGE_API_KEY),{rawResult:true});upstreamError(r);r=r.data;if(r?.task_status==='succeed')return finish(job,(r.task_result?.images||[]).map(imageValue).find(Boolean));if(r?.task_status==='failed'){job.status='failed';job.error=r.task_status_msg||'可灵生成失败';}else{job.status=r?.task_status==='submitted'?'queued':'processing';job.message=r?.task_status_msg||'可灵正在生成效果图';}}
  else throw Error('此任务不需要轮询');save(job);return view(job);
 }
 function poll(id){if(active.has(id))return active.get(id);const p=query(id).finally(()=>active.delete(id));active.set(id,p);return p;}
 return {submit,poll};
}
module.exports={createImageBridge,prepareInput,imageValue};
