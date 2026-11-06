// Stream actual upstream progress, without returning/storing private reasoning.
const system='你是可以执行三维家具布置的室内设计助手。全部尺寸单位为米，position 是世界坐标，必须使用 room_bounds 的 min/max 与墙体轮廓，不能假设原点是零。只能使用提供的家具库和现有家具 ID，保持房间、门窗和家具尺寸不变。结合用户的办公、硬件工作台、直播/拍摄与接待用途实际调整家具位置和朝向，保持门前通道；需要布置时应给出具体 update 操作，不能只写建议。preserve_existing=true 时禁止 remove，必须保留所有现有物品；可将闲置物品集中收纳。不要新增用户未要求的物件。返回 JSON：{"message":"中文布局说明，不超过400字，说明分区和取舍","operations":[{"type":"update","id":"已有家具ID","position":[x,y,z],"rotation_deg":0}]}。也支持 add（asset_id）及 remove（id），但必须符合上述约束。挂墙物件沿 wall_id/u 定位；free_position=true 的对象使用世界 position。考虑旋转后外包络，落地 z=0，顶装 z=层高-家具高。至多30项操作；如果确实无可行布置，应返回空 operations 并明确解释原因。';
function requestBody(env,provider,input){
 const hostname=new URL(env.CHAT_API_BASE).hostname,model=env.CHAT_MODEL;
 const qwenHybrid=/(^|\.)dashscope(?:-intl|-us)?\.aliyuncs\.com$/.test(hostname)&&/^qwen3(?:\.\d+)?-(?:max|plus|flash|vl)(?:-|$)/i.test(model);
 return {model,stream:true,...(/^gpt-[56](?:[.-]|$)/i.test(model)?{max_completion_tokens:4096}:{max_tokens:4096}),...(qwenHybrid?{enable_thinking:false}:{}),...(provider?.jsonMode===false?{}:{response_format:{type:'json_object'}}),messages:[{role:'system',content:system},...(input.messages||[]).filter(m=>['user','assistant'].includes(m.role)).slice(-8).map(m=>({role:m.role,content:String(m.content).slice(0,20000)})),{role:'user',content:JSON.stringify({request:input.prompt,space:input.context,constraints:input.constraints||{preserve_existing:true}})}]};
}
function parseAnswer(text,finish,input){
 if(finish==='length')throw Error('模型输出未完成，未应用家具变动。请将需求拆小后重新生成。');
 if(typeof text!=='string'||!text.trim())throw Error('模型没有返回可执行的布局方案');
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('模型回复不是完整的布局 JSON，未应用家具变动');}
 if(typeof value.message!=='string'||!Array.isArray(value.operations)||value.operations.length>30)throw Error('模型未返回有效的布局说明和家具操作');
 if(input.constraints?.preserve_existing!==false&&value.operations.some(op=>op.type==='remove'))throw Error('模型尝试移除现有物品，已阻止；请重新生成保留全部物品的方案');
 return value;
}
async function generateDesign({env,provider,input,signal,onProgress=()=>{},fetcher=(...args)=>fetch(...args),timeoutMs=90000,idleMs=30000}){
 const controller=new AbortController(),started=Date.now();let idle,timer,reason='';
 const abort=()=>controller.abort(signal.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const stop=message=>{reason=message;controller.abort();},arm=()=>{clearTimeout(idle);idle=setTimeout(()=>stop('模型服务连续30秒没有返回数据，已停止等待。可以检查模型服务后重试。'),idleMs);idle.unref?.();};
 timer=setTimeout(()=>stop('设计生成超过90秒，已停止等待，未修改当前家具。请简化需求后重试。'),timeoutMs);timer.unref?.();
 const progress=value=>onProgress({...value,elapsed_ms:Date.now()-started});
 try{
  progress({phase:'connecting',message:'正在连接模型服务'});arm();
  const response=await fetcher(env.CHAT_API_BASE.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.CHAT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(requestBody(env,provider,input)),signal:controller.signal});arm();
  if(!response.ok){const value=await response.json();throw Error('模型服务返回 '+response.status+'：'+String(value.error?.message||value.message||'请求失败').slice(0,400));}
  progress({phase:'connected',message:'已连接模型，等待布局输出'});
  if(!response.headers.get('content-type')?.includes('text/event-stream')){const value=await response.json(),choice=(value.data||value).choices?.[0];return parseAnswer(choice?.message?.content,choice?.finish_reason,input);}
  let buffer='',content='',finish=null,reasoning=0,last=-Infinity,done=false;
  const decoder=new TextDecoder();
  const line=value=>{
   if(!value.startsWith('data:'))return;const data=value.slice(5).trim();if(!data)return;if(data==='[DONE]'){done=true;return;}
   let valueJSON;try{valueJSON=JSON.parse(data);}catch{throw Error('模型流式响应格式错误');}if(valueJSON.error)throw Error(String(valueJSON.error.message||'模型返回错误'));
   const choice=valueJSON.choices?.[0];if(!choice)return;const delta=choice.delta||{};
   if(typeof delta.content==='string')content+=delta.content;if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content.length;if(choice.finish_reason)finish=choice.finish_reason;
   if(content.length>150000)throw Error('模型返回内容过长，已停止读取');
   if((content||reasoning)&&Date.now()-last>=250){last=Date.now();progress({phase:content?'generating':'thinking',message:content?'正在生成家具位置和朝向调整':'模型已开始处理，等待布局输出',received_chars:content.length});}
  };
  for await(const chunk of response.body){arm();buffer+=decoder.decode(chunk,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);}if(done)break;}
  buffer+=decoder.decode();if(buffer.trim())line(buffer.trim());if(!done&&!finish)throw Error('模型连接提前中断，未收到完整方案，未修改家具');
  progress({phase:'validating',message:'布局输出已收齐，正在检查方案',received_chars:content.length});return parseAnswer(content,finish,input);
 }catch(error){if(reason)throw Error(reason);if(controller.signal.aborted)throw error;if(error instanceof TypeError&&error.cause?.code)throw Error('模型连接失败（'+error.cause.code+'），请检查服务地址、网络或代理');throw error;}
 finally{clearTimeout(idle);clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function handleDesign(req,res,{env,provider,input}){
 const stream=String(req.headers.accept||'').includes('application/x-ndjson'),controller=new AbortController();
 const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
 const send=value=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(value)+'\n');};
 if(stream){res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders();}
 try{const result=await generateDesign({env,provider,input,signal:controller.signal,onProgress:event=>{if(stream)send({type:'progress',...event});}});if(stream){send({type:'result',value:result});res.end();}else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}}
 catch(error){if(!res.destroyed){if(stream){send({type:'error',error:error.message});res.end();}else{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}}}
 finally{res.removeListener('close',close);}
}
module.exports={requestBody,parseAnswer,generateDesign,handleDesign};
