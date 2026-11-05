import {upgradeMeshes} from './mesh-upgrade.mjs';
export function openModelingReport(scene,update){
 const dialog=document.createElement('dialog');dialog.id='modeling-report-dialog';dialog.innerHTML='<div class="dialog-heading"><h2>AI 建模依据</h2><button aria-label="关闭建模依据">×</button></div><div class="ar-body"><p class="report-summary"></p><p class="report-scale"></p><ul></ul><div class="report-frames"></div><p class="report-mesh"></p><details><summary>建模工具调用记录</summary><pre class="report-log"></pre></details><p role="status"></p></div><div class="vr-footer"><button class="report-resume">继续查询未完成的网格任务</button></div>';
 const model=scene.ai_modeling;dialog.querySelector('.report-summary').textContent=model.summary||'视频自动建立的可编辑房间';dialog.querySelector('.report-scale').textContent=scene.reference_scale?'已按参照墙校准，其余尺寸按比例推算。':'尺寸暂估 · 请用参照 Scale 输入一堵墙的实测长度。';
 for(const text of model.uncertainties||[]){const li=document.createElement('li');li.textContent=text;dialog.querySelector('ul').append(li);}
 for(const f of model.frames||[]){const img=document.createElement('img');img.src=f.url;img.alt=f.image+' · '+f.seconds.toFixed(1)+' 秒';dialog.querySelector('.report-frames').append(img);}
 dialog.querySelector('.report-log').textContent=(model.tool_log||[]).map(row=>row.tool+' '+JSON.stringify(row.arguments)).join('\n');
 const pending=scene.assets.filter(a=>a.mesh_task_id&&!a.model_glb);dialog.querySelector('.report-mesh').textContent=pending.length?pending.length+' 件网格尚未完成，当前显示简模。':'';dialog.querySelector('.report-resume').hidden=!pending.length;
 let busy=false;const close=dialog.querySelector('[aria-label]');close.onclick=()=>dialog.close();dialog.oncancel=e=>{if(busy)e.preventDefault();};dialog.onclose=()=>dialog.remove();
 dialog.querySelector('.report-resume').onclick=async()=>{if(busy)return;busy=true;close.disabled=true;const button=dialog.querySelector('.report-resume'),status=dialog.querySelector('[role=status]');button.disabled=true;
  try{const draft=structuredClone(scene);await upgradeMeshes(draft,{request:async(url,data)=>{if(data)throw Error('此处仅查询已有任务，不重新收费生成');const r=await fetch(url),value=await r.json();if(!r.ok)throw Error(value.error);return value;},timeout:1000,save:update,status:t=>status.textContent=t});status.textContent='查询结束，已完成模型已替换简模；未完成项仍保留任务。';}
  catch(e){status.textContent=e.message;}finally{busy=false;close.disabled=false;button.disabled=false;}
 };
 document.body.append(dialog);dialog.showModal();
}
