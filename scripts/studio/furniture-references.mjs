import {setupSampling} from './sampling-controls.mjs';
import {localFrames} from './video-room.mjs';
export const furnitureViews=[['front','正面 / 主视图'],['left','左侧'],['back','背面'],['right','右侧'],['top','顶部'],['bottom','底部'],['left_front','左前 45°'],['right_front','右前 45°']];
export function referenceCollection(){
 let items=[];
 return {
  get:()=>items.map(r=>({...r})),
  add(image,source={}){if(items.some(r=>r.image===image))return false;if(items.length>=8)throw Error('同一物品最多添加 8 张参考图');const view=furnitureViews.find(([v])=>!items.some(r=>r.view===v))?.[0];items.push({...source,image,view,id:crypto.randomUUID()});return true;},
  remove(id){items=items.filter(r=>r.id!==id);},
  view(id,view){const other=items.find(r=>r.view===view),target=items.find(r=>r.id===id);if(!target)return;if(other)other.view=target.view;target.view=view;},
  clear(){items=[];},
  validate(provider,model){if(!items.length)throw Error('请添加同一物品的参考图，或从视频选择清晰画面');if(!items.some(r=>r.view==='front'))throw Error('请指定一张正面 / 主视图');if(provider==='hunyuan'&&items.length>1&&model==='hy-3d-express')throw Error('混元极速版仅支持单图，多图请在上方选择 3.1 或 3.0 专业版');if(provider!=='hunyuan'&&(items.length>4||items.some(r=>!['front','left','back','right'].includes(r.view))))throw Error('当前服务最多支持正面、左侧、背面、右侧各一张');return this.get().sort((a,b)=>furnitureViews.findIndex(([v])=>v===a.view)-furnitureViews.findIndex(([v])=>v===b.view));}
 };
}
export function setupFurnitureReferences({readData,toast}){
 const $=id=>document.getElementById(id),collection=referenceCollection();let videoURL=null,frameGeneration=0,loading=false,readingPhotos=false,locked=false,current=null,configuredModel=null;
 const samplingUI=setupSampling('tripo',{limit:120,onChange:()=>{frameGeneration++;loading=false;$('tripo-extract-frames').disabled=locked;$('tripo-video-frames').replaceChildren();$('tripo-frame-status').textContent='抽帧设置已更改，请重新抽取候选画面；上方已选择的参考图会保留。';}});
 const guard=fn=>async()=>{try{if(locked)throw Error('任务进行中，请等待完成后修改参考图');await fn();}catch(e){toast(e.message,true);}};
 function paint(){const root=$('tripo-references');root.replaceChildren();for(const ref of collection.get()){
  const card=document.createElement('div');card.className='furniture-reference';const img=document.createElement('img');img.src=ref.image;img.alt=ref.name||'物品参考图';
  const select=document.createElement('select');select.setAttribute('aria-label','参考图视角');for(const [v,label]of furnitureViews){const o=document.createElement('option');o.value=v;o.textContent=label;select.append(o);}select.value=ref.view;select.disabled=locked;select.onchange=guard(()=>{collection.view(ref.id,select.value);paint();});
  const note=document.createElement('small');note.textContent=ref.seconds!==undefined?'视频 '+Number(ref.seconds).toFixed(1)+' 秒':ref.name||'商品图 / 实拍图';
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='移除';remove.disabled=locked;remove.onclick=guard(()=>{collection.remove(ref.id);paint();});card.append(img,select,note,remove);root.append(card);
 }$('tripo-reference-count').textContent='已选 '+collection.get().length+' / 8 张 · 每个视角一张';}
 $('tripo-image').onchange=guard(async()=>{if(readingPhotos)throw Error('正在读取上一批图片，请稍候');const files=Array.from($('tripo-image').files||[]);readingPhotos=true;try{for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片');collection.add(await readData(file),{name:file.name,source:'photo'});}}finally{readingPhotos=false;$('tripo-image').value='';paint();}});
 $('tripo-clear-references').onclick=guard(()=>{collection.clear();paint();});
 $('tripo-video').onchange=guard(()=>{const file=$('tripo-video').files?.[0];if(!file)return;if(file.size>300*1024*1024)throw Error('视频请控制在 300MB 以内');frameGeneration++;loading=false;$('tripo-extract-frames').disabled=false;$('tripo-video-frames').replaceChildren();$('tripo-frame-status').textContent='可反复添加当前帧，或抽取候选画面后多选。';if(videoURL)URL.revokeObjectURL(videoURL);videoURL=URL.createObjectURL(file);$('tripo-video-preview').src=videoURL;$('tripo-video-preview').hidden=false;});
 $('tripo-use-frame').onclick=guard(()=>{const video=$('tripo-video-preview');if(video.readyState<2||!video.videoWidth)throw Error('请等待视频加载，并暂停到清晰的物件画面');video.pause();const canvas=document.createElement('canvas'),scale=Math.min(1,1600/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);collection.add(canvas.toDataURL('image/jpeg',.9),{source:'video',name:$('tripo-video').files?.[0]?.name,seconds:video.currentTime});paint();});
 $('tripo-extract-frames').onclick=guard(async()=>{if(loading)return;const file=$('tripo-video').files?.[0];if(!file)throw Error('请先选择物品视频');const token=++frameGeneration;loading=true;$('tripo-extract-frames').disabled=true;
  try{const result=await localFrames(file,(n,message)=>{if(token===frameGeneration)$('tripo-frame-status').textContent=message||'正在本机抽取候选画面 '+n;},()=>token!==frameGeneration,samplingUI.read());if(token!==frameGeneration)return;
   const root=$('tripo-video-frames');root.replaceChildren();for(const frame of result.frames){const button=document.createElement('button');button.type='button';button.className='furniture-video-frame';const img=document.createElement('img');img.src=frame.url;img.alt=Number(frame.seconds).toFixed(1)+' 秒';const caption=document.createElement('span');caption.textContent=Number(frame.seconds).toFixed(1)+' 秒 · 添加';button.append(img,caption);button.onclick=guard(()=>{if(collection.add(frame.url,{source:'video',name:file.name,seconds:frame.seconds,video_sha256:result.source.sha256})){paint();button.setAttribute('aria-pressed','true');caption.textContent=Number(frame.seconds).toFixed(1)+' 秒 · 已选';}else toast('该画面已在参考图列表中');});root.append(button);}
   $('tripo-frame-status').textContent='已抽取 '+result.frames.length+' 帧，点击多张清晰且角度不同的画面添加到上方。';
  }finally{if(token===frameGeneration){loading=false;$('tripo-extract-frames').disabled=locked;}}
 });
 function configure(c){current=c;if(!c)return;const select=$('tripo-task-model'),changed=configuredModel!==c.provider+'|'+c.model;if(changed){select.replaceChildren();const models=c.provider==='hunyuan'?[['hy-3d-express','混元极速版 · 单图'],['hy-3d-3.1','混元 3.1 专业版 · 多视图'],['hy-3d-3.0','混元 3.0 专业版 · 多视图']]:[[c.model,c.model]];for(const [v,label]of models){const o=document.createElement('option');o.value=v;o.textContent=label;select.append(o);}select.value=c.model;configuredModel=c.provider+'|'+c.model;}
  $('tripo-provider-status').textContent=(c.provider==='hunyuan'?'混元 3D · TokenHub':c.provider==='meshy'?'Meshy':'Tripo / 兼容服务')+' · '+(c.configured?'已配置':'请先配置密钥');$('tripo-model-hint').textContent=c.provider==='hunyuan'?'极速版只提交 1 张；专业版支持多视图。按所选模型计费，提交前请核对。图片须为同一物品，每个视角一张。':'最多 4 张：正面、左侧、背面、右侧。图片须为同一物品。';
 }
 paint();return {configure,get:()=>{if(readingPhotos)throw Error('参考图片正在读取，请稍候再提交');return collection.validate(current?.provider,$('tripo-task-model').value||current?.model);},model:()=>$('tripo-task-model').value||current?.model,setBusy(value){locked=value;samplingUI.setBusy(value);for(const id of ['tripo-image','tripo-video','tripo-use-frame','tripo-task-model','tripo-clear-references'])$(id).disabled=value;$('tripo-extract-frames').disabled=value||loading;paint();}};
}
