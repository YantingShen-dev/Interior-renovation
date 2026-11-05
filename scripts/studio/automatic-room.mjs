import {readRecord,writeRecords} from './library-store.mjs';
import {upgradeMeshes} from './mesh-upgrade.mjs';
import {localFrames} from './video-room.mjs';
const $=id=>document.getElementById(id);
async function api(url,data,method){const r=await fetch(url,{method:method||(data===undefined?'GET':'POST'),headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok)throw Error(result.error||'请求失败');return result;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function imageData(url){if(url.startsWith('data:'))return url;const r=await fetch(url);if(!r.ok)throw Error('视频画面读取失败');const blob=await r.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
export async function cropFurniture(frame,bbox){
 const img=new Image();img.src=frame.url;await img.decode();const [x,y,r,b]=bbox,canvas=document.createElement('canvas'),w=(r-x)*img.naturalWidth,h=(b-y)*img.naturalHeight;
 if(w<12||h<12)throw Error('家具在画面中过小，保留简模');const ratio=Math.min(1,1024/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));canvas.getContext('2d').drawImage(img,x*img.naturalWidth,y*img.naturalHeight,w,h,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9);
}
export function setupAutomaticRoom({apply,settings}){
 let dialog,busy=false,cancelled=false,job=null,result=null,frames=[],source={},opening=0,configured=false,lastInput=null;
 function status(message){$('ar-status').textContent=message;}
 function init(){if(dialog)return;dialog=document.createElement('dialog');dialog.id='automatic-room-dialog';dialog.innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">VIDEO → AI → EDITABLE ROOM</span><h2>AI 自动建房</h2></div><button id="ar-close" aria-label="关闭自动建房">×</button></div><div class="ar-body"><p>AI 看关键帧，自动建立墙体、门窗和家具。支持不规则轮廓；尺寸先估计，完成后用「参照 Scale」统一校准。</p><div id="ar-frames" aria-label="自动抽取的视频关键帧"></div><label>家具生成方式<select id="ar-mode"><option value="primitive">组合简模 · AI 生成桌腿、坐垫等部件，无需转 3D API</option><option value="mesh">精细网格 · 自动裁剪家具并调用图片转 3D（使用服务额度）</option></select></label><section id="ar-config" aria-label="共用模型配置"><strong>视觉与对话模型 · <span id="ar-model-name"></span></strong><p id="ar-config-note" class="micro-note">沿用首页「配置服务」，无需重复填写。</p><button id="ar-settings" type="button">配置服务</button></section><p id="ar-status" role="status" aria-live="polite"></p><section id="ar-draft" hidden><h3>已保留的未完成草稿</h3><p id="ar-draft-summary"></p><div id="ar-draft-plan" aria-label="未完成草稿平面预览"></div><p class="micro-note">蓝色是已建立的墙，黄色是已有门窗。缺失边界不会自动补成完整房间；此预览不会覆盖当前空间。</p><button id="ar-draft-open" type="button">打开草稿继续编辑</button></section><section id="ar-plan" hidden><h3>AI 读图与建模计划</h3><p id="ar-plan-summary"></p><ol id="ar-plan-steps"></ol><p id="ar-plan-uncertainties" class="micro-note"></p></section><details id="ar-records"><summary>AI 建模操作记录</summary><pre id="ar-log"></pre><a id="ar-diagnostics" hidden download>下载本次诊断与草稿</a></details><p class="micro-note">自动抽取的画面会发给所配置的视觉服务；生成家具自动进入仓库，并保留原位。遮挡处与估计尺寸会列为待核对项。</p></div><div class="vr-footer"><button id="ar-retry" hidden>重新读取视频</button><button id="ar-cancel" hidden>取消建模</button><button id="ar-resume" hidden>继续已有网格任务</button><button id="ar-apply" hidden>使用已完成的草稿</button><button id="ar-start" class="primary-button">自动建立房间与家具</button></div>`;document.body.append(dialog);
  $('ar-close').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};
  $('ar-settings').onclick=async()=>{try{await settings();await refreshConfig();}catch(e){status(e.message);}};
  $('ar-cancel').onclick=async()=>{cancelled=true;if(job)await api('/api/ai-modeling/'+job,undefined,'DELETE').catch(()=>{});status('正在停止；已发出的图片转 3D 任务会在服务商侧继续，后续家具不再提交。');};
  $('ar-draft-open').onclick=()=> $('ar-apply').onclick();
  $('ar-apply').onclick=async()=>{try{await apply(result);await writeRecords([['ai-modeling-draft',null]]);dialog.close();}catch(e){status(e.message);}};
  $('ar-resume').onclick=async()=>{if(busy||!result)return;busy=true;cancelled=false;$('ar-start').disabled=true;$('ar-resume').disabled=true;$('ar-close').disabled=true;$('ar-apply').disabled=true;$('ar-cancel').hidden=false;try{await upgradeMeshes(result,{request:api,save:s=>writeRecords([['ai-modeling-draft',s]]),status,cancelled:()=>cancelled});status('任务查询结束，可使用已完成的草稿；未完成项保留简模。');}catch(e){status(e.message);}finally{busy=false;$('ar-start').disabled=!configured||!frames.length;$('ar-resume').disabled=false;$('ar-close').disabled=false;$('ar-apply').disabled=false;$('ar-cancel').hidden=true;}};
  $('ar-start').onclick=()=>start();
  $('ar-retry').onclick=()=>open(lastInput);
 }
 function showDraft(scene){
  result=scene;$('ar-draft').hidden=false;
  $('ar-draft-summary').textContent=(scene.ai_modeling?.source?.name||'视频')+' · '+(scene.ai_modeling?.summary||'未完成草稿');
  const w=scene.room.length,h=scene.room.width,pad=Math.max(w,h)*.08,stroke=Math.max(w,h)*.018;
  const line=(a,b,color,width)=>`<line x1="${a[0]}" y1="${h-a[1]}" x2="${b[0]}" y2="${h-b[1]}" stroke="${color}" stroke-width="${width}"/>`;
  const walls=scene.walls.map(w=>line(w.start,w.end,'#0058a3',Math.max(w.thickness,stroke))).join('');
  const openings=scene.openings.map(o=>{const wall=scene.walls.find(w=>w.id===o.wall_id);if(!wall)return '';const len=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]),at=u=>wall.start.map((v,k)=>v+(wall.end[k]-v)*u/len);return line(at(o.u),at(o.u+o.width),'#ffca28',Math.max(wall.thickness*1.2,stroke));}).join('');
  $('ar-draft-plan').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="未完成的墙体与门窗" viewBox="${-pad} ${-pad} ${w+pad*2} ${h+pad*2}">${walls}${openings}</svg>`;
  $('ar-apply').textContent='打开未完成草稿';$('ar-apply').hidden=false;
 }
 async function refreshConfig(){
  configured=false;$('ar-start').disabled=true;
  const c=await api('/api/ai-modeling/config');configured=c.configured;
  $('ar-model-name').textContent=c.model||'尚未配置';
  $('ar-config-note').textContent=c.issue||(configured?'沿用首页「配置服务」，无需重复填写。开始时会检查图片读取与工具调用能力。':'请先在首页「配置服务」填写支持图片与工具调用的模型。这里只需配置一次。');
  if(frames.length)status(configured?frames.length+' 张关键帧已就绪，点击开始后由 AI 自动建模。':'关键帧已保留，请点击「配置服务」完成设置后开始。');
  $('ar-start').disabled=busy||!configured||!frames.length;$('ar-start').title=!frames.length?'请先成功读取视频画面':!configured?'请先配置视觉与对话模型':'';
 }
 async function start(){
  if(busy||!configured||!frames.length)return;$('ar-draft').hidden=true;$('ar-apply').textContent='使用已完成的草稿';$('ar-plan').hidden=true;$('ar-diagnostics').hidden=true;$('ar-records').open=false;$('ar-log').textContent='';busy=true;cancelled=false;job=null;result=null;$('ar-start').disabled=true;$('ar-resume').hidden=true;$('ar-mode').disabled=true;$('ar-close').disabled=true;$('ar-settings').disabled=true;$('ar-cancel').hidden=false;$('ar-apply').hidden=true;
  try{
   const mode=$('ar-mode').value;const started=await api('/api/ai-modeling',{frames,source,mode});job=started.id;if(cancelled){await api('/api/ai-modeling/'+job,undefined,'DELETE');throw Error('已取消，原有空间未修改');}
   for(;;){if(cancelled)throw Error('已取消，原有空间未修改');const j=await api('/api/ai-modeling/'+job);status(j.message);if(j.plan){$('ar-plan').hidden=false;$('ar-plan-summary').textContent=j.plan.summary;$('ar-plan-steps').replaceChildren(...j.plan.steps.map(step=>{const li=document.createElement('li');li.textContent=step.goal;return li;}));$('ar-plan-uncertainties').textContent='待核对：'+(j.plan.uncertainties.join('；')||'所有尺寸为估计值');}$('ar-diagnostics').hidden=false;$('ar-diagnostics').href='/api/ai-modeling/'+job+'/diagnostics';$('ar-log').textContent=(j.events||[]).join('\n');if(j.status==='failed'||j.status==='cancelled'){if(j.draft){showDraft(j.draft);await writeRecords([['ai-modeling-draft',result]]);}throw Error(j.message);}if(j.status==='ready'){result=j.scene;break;}await pause(1200);}
   job=null;result.ai_modeling.frames=frames.map(f=>({image:f.image,seconds:f.seconds,url:f.url}));
   for(const a of result.assets.filter(a=>a.ai_source?.bbox)){const frame=frames.find(f=>f.image===a.ai_source?.frame);try{a.reference_image=await cropFurniture(frame,a.ai_source.bbox);if(a.asset_type==='finish'){for(const m of [...result.walls,...result.openings,...result.furniture].map(o=>o.surface_material).concat(Object.values(result.finishes||{})))if(m?.asset_id===a.id)m.texture=a.reference_image;}}catch(e){if(a.asset_type==='finish'){a.texture_status='crop_failed';a.texture_error=e.message;}else{a.mesh_status='crop_failed';a.mesh_error=e.message;}}}
   await writeRecords([['ai-modeling-draft',result]]);
   if(result.ai_modeling.completion==='partial'){showDraft(result);status('已建立部分模型，但仍有未解决的几何错误。请先预览未完成草稿。');return;}
   if(mode==='mesh')await upgradeMeshes(result,{request:api,save:s=>writeRecords([['ai-modeling-draft',s]]),status,cancelled:()=>cancelled});
   if(cancelled){$('ar-apply').hidden=false;throw Error('已停止。已完成的房间、家具简模及网格可通过「使用已完成的草稿」保存。');}
   await apply(result);await writeRecords([['ai-modeling-draft',null]]);status('已自动建房并入库。');dialog.close();
  }catch(e){status(e.message);$('ar-records').open=true;if(result)$('ar-apply').hidden=false;}
  finally{busy=false;$('ar-start').disabled=!configured||!frames.length;$('ar-close').disabled=false;$('ar-settings').disabled=false;$('ar-mode').disabled=false;$('ar-cancel').hidden=true;}
 }
 async function open({file,job:scanJob}){
  init();if(busy)return;lastInput={file,job:scanJob};const ticket=++opening;if(!dialog.open)dialog.showModal();$('ar-retry').hidden=true;$('ar-draft').hidden=true;$('ar-apply').textContent='使用已完成的草稿';$('ar-plan').hidden=true;$('ar-diagnostics').hidden=true;$('ar-records').open=false;$('ar-start').disabled=true;$('ar-apply').hidden=true;$('ar-log').textContent='';$('ar-resume').hidden=true;frames=[];result=null;$('ar-frames').replaceChildren();
  try{const saved=await readRecord('ai-modeling-draft');if(saved){result=saved;$('ar-apply').hidden=false;if(saved.ai_modeling?.completion==='partial')showDraft(saved);else $('ar-resume').hidden=saved.ai_modeling?.mode!=='mesh';}else{const previous=await api('/api/ai-modeling/latest-draft');if(ticket!==opening||!dialog.open)return;if(previous.draft){showDraft(previous.draft);$('ar-diagnostics').hidden=false;$('ar-diagnostics').href='/api/ai-modeling/'+previous.id+'/diagnostics';$('ar-log').textContent=(previous.events||[]).join('\n');}}await refreshConfig();if(ticket!==opening||!dialog.open)return;
   status('在本机自动抽取关键帧…');let data;if(file)data=await localFrames(file,(n,message)=>status(message||'自动抽帧 '+n+'/20'),()=>ticket!==opening||!dialog.open);else{data=await api('/api/reconstruction/'+(scanJob?scanJob+'/frames':'latest-frames'));data.frames=Array.from({length:Math.min(20,data.frames.length)},(_,i)=>data.frames[Math.round(i*(data.frames.length-1)/Math.max(1,Math.min(20,data.frames.length)-1))]);}
   const loaded=[];for(const f of data.frames)loaded.push({...f,url:await imageData(f.url)});if(ticket!==opening||!dialog.open)return;frames=loaded;source=data.source;
   for(const f of frames){const img=document.createElement('img');img.src=f.url;img.alt=f.seconds.toFixed(1)+' 秒';$('ar-frames').append(img);}
   await refreshConfig();
  }catch(e){if(ticket===opening&&dialog.open){status('视频画面未就绪：'+e.message);$('ar-retry').hidden=false;$('ar-start').title='请先成功读取视频画面';}}
 }
 return {isBusy:()=>busy,open};
}
