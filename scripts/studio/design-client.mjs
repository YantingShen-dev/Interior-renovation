export async function requestDesign(data,{signal,onProgress=()=>{},fetcher=(...args)=>fetch(...args)}={}){
 if(typeof location!=='undefined'&&location.protocol==='file:')throw Error('请通过本地工作台服务使用 AI 设计');
 const response=await fetcher('/api/design',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(data),signal});
 if(!response.headers?.get('content-type')?.includes('application/x-ndjson')){const value=await response.json();if(!response.ok)throw Error(value.error||'设计请求失败');return value;}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result,complete=false;
 const parse=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error||'设计请求失败');if(event.type==='progress')onProgress(event);if(event.type==='result'){result=event.value;complete=true;}};
 try{for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){parse(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(buffer.length>500000)throw Error('布局响应异常，已停止读取');}buffer+=decoder.decode();if(buffer.trim())parse(buffer);if(!complete)throw Error('设计连接中断，未收到完整方案，当前家具未改变');return result;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
