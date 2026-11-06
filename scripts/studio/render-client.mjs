const KEY='polylab.pending-image-render.v1';
export function pendingRender(storage=globalThis.localStorage){try{return JSON.parse(storage?.getItem(KEY)||'null');}catch{return null;}}
export function forgetRender(storage=globalThis.localStorage){try{storage?.removeItem(KEY);}catch{}}
export async function renderImage(api,input,{onStatus=()=>{},resume=false,storage=globalThis.localStorage,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeout=20*60*1000}={}){
 let result=resume?pendingRender(storage):await api('/api/render',input);if(!result)throw Error('没有待查询的渲染任务');
 const start=now();if(result.id&&!result.image)try{storage?.setItem(KEY,JSON.stringify({id:result.id,provider:result.provider,model:result.model}));}catch{}
 while(!result.image){
  if(result.status==='failed'){forgetRender(storage);throw Error(result.error||result.message||'效果图生成失败');}
  if(!result.id)throw Error('图像服务没有返回效果图或任务 ID');
  if(now()-start>timeout)throw Error('生成任务仍可查询，请点击「继续查询上次渲染」，不会重复提交');
  onStatus(result.message||'云端正在处理效果图…');await sleep(2500);
  try{result=await api('/api/render/'+encodeURIComponent(result.id));}catch(e){throw Error(e.message+'；原任务已保留，可继续查询，无需重新生成');}
 }
 forgetRender(storage);return result;
}
