import {t} from './locale.mjs';
import {readAssetFields} from './asset-fields.mjs';
import {calibrateFurniture} from './furniture-calibration.mjs';
import {setupRenderViewer} from './render-viewer.mjs';
import {setupRenderAttachments} from './render-attachments.mjs';
import {renderImage,pendingRender} from './render-client.mjs';
import {requestDesign} from './design-client.mjs';
import {setupAutomaticRoom} from './automatic-room.mjs';
import modelingTools from './modeling-tools.cjs';
import {setupProviderPresets} from './provider-presets.mjs';
import {setupVideoRoom} from './video-room.mjs';
import {setupFurnitureReferences} from './furniture-references.mjs';
import {readMeshResult} from './mesh-result.mjs';
import {readRecord,writeRecords} from './library-store.mjs';
import state from './state.cjs';
import sceneData from './data-copy.cjs';
import design from './design.cjs';
const {copy,G,F}=state,{proposal,applyProposal,context}=design;
const $=id=>document.getElementById(id);
export function setupWorkflow({store,getViewport,changed,toast,download}){
 setupRenderViewer();
 let reconstructionHooks=null,assetStorage=null;const providerUI=typeof indexedDB!=='undefined'?setupProviderPresets():null;
 let stage='layout',proposalValue=null,renderReference=null,renderSource=null,chat=[],busy=false,config=null,renderAttachments=null,generation=0;
 let designRequest=null;
 const on=(id,fn)=>$(id).onclick=async()=>{try{await fn();}catch(e){toast(e.message,true);}};
 const videoRoom=setupVideoRoom({getScene:()=>store.scene});
 function openVideoRoom(){return videoRoom.open({readonly:true});}
 const automaticRoom=setupAutomaticRoom({settings:async()=>{await settings();await new Promise(resolve=>$('settings-dialog').addEventListener('close',resolve,{once:true}));},apply:async scene=>{await reconstructionHooks.applyAIModel(scene);}});
 on('video-room-open',()=>automaticRoom.open({file:$('space-video').files?.[0]}));
 async function api(url,data,options={}){if(location.protocol==='file:')throw new Error('请先运行项目里的「启动工作台.cmd」，在本地服务中使用上传和 AI 功能');const r=await fetch(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),...options});const result=await r.json();if(!r.ok)throw new Error(result.error||'本地服务请求失败');return result;}
 function message(text,role='assistant'){const node=document.createElement('div');node.className='chat-message '+role;if(role==='user'||role==='assistant')node.dataset.userText='';node.textContent=text;$('chat-messages').append(node);node.scrollIntoView?.({block:'nearest'});}
 function designStatus(state,text){const node=$('design-status');node.hidden=false;if(node.dataset.state!==state)node.dataset.state=state;const label=$('design-status-text');if(label.textContent!==text)label.textContent=text;}
 function clearDesignRequest(){if(designRequest){clearInterval(designRequest.timer);clearTimeout(designRequest.timeout);}designRequest=null;$('design-stop').hidden=true;$('design-send').disabled=false;$('design-send').textContent='发送并生成布置提案';$('design-send').setAttribute('aria-busy','false');$('chat-messages').setAttribute('aria-busy','false');}
 function persistReview(){changed();renderReview();}
 function review(){return store.scene.space_review||{notes:[],existing_furniture:[],accepted:false};}
 function priceSummary(){const priced=store.scene.furniture.map(f=>F.asset(store.scene,f.asset_id)),known=priced.filter(a=>Number.isFinite(a.price_cny)),total=known.reduce((sum,a)=>sum+a.price_cny,0);$('price-summary').textContent='当前家具参考合计 ¥'+total.toFixed(2)+' · '+known.length+'/'+priced.length+' 件有价格。价格为官网常规价快照，不含配送、安装或优惠。';}
 function showStage(next){
  if(next!=='replica'&&store.scene.space_review?.accepted===false){toast('请先在空间复刻中确认净尺寸和待确认项，再进入家具摆放',true);return;}
  stage=next;document.body.dataset.stage=next;for(const b of document.querySelectorAll('[data-stage]'))b.classList.toggle('active',b.dataset.stage===next);$('replica-panel').hidden=next!=='replica';$('design-panel').hidden=next!=='design';$('stage-info').hidden=next==='layout';
  if(next==='replica'){for(const k of ['length','width','height'])$('confirm-'+k).value=store.scene.room[k];calibrationFields();renderReview();$('stage-info-title').textContent='先核对，再布置';$('stage-info-body').textContent='请按实测数据校准房间、门窗和家具。视频模型中的尺寸需要人工核对。';}
  else {if(next==='design'){$('stage-info-title').textContent='可编辑的设计提案';$('stage-info-body').textContent='AI 读取结构、门位和家具尺寸，返回添加、移动、旋转和删除操作。你检查提案后应用；所有修改都支持撤销。';loadConfig().catch(()=>{});}}
  if(document.body.dataset.page==='editor')$('design-panel').hidden=document.body.dataset.right!=='chat';
  priceSummary();
 }
 function renderReview(){const info=review();$('review-ack').checked=!!info.accepted;$('review-objects').replaceChildren();
  for(const opening of store.scene.openings){const row=document.createElement('div');row.className='review-item';const title=document.createElement('strong');title.textContent=opening.label;row.append(title);const fields={};
   const wallLabel=document.createElement('label');wallLabel.className='opening-wall';wallLabel.textContent='所属墙';const wallInput=document.createElement('select');for(const wall of store.scene.walls){const option=document.createElement('option');option.value=wall.id;option.textContent=wall.label;wallInput.append(option);}wallInput.value=opening.wall_id;wallLabel.append(wallInput);row.append(wallLabel);
   for(const [key,label]of [['u','沿墙起点'],['width','宽'],['height','高'],['bottom','底高']]){const lab=document.createElement('label');lab.textContent=label+' / m';const input=document.createElement('input');input.type='number';input.step='.01';input.value=opening[key];fields[key]=input;lab.append(input);row.append(lab);}
   const apply=document.createElement('button');apply.className='quiet-button full';apply.textContent=opening.dimensions_verified?'已确认 · 再更新':'确认该门窗参数';apply.onclick=()=>{try{const next=copy(store.scene),o=next.openings.find(o=>o.id===opening.id);for(const key of Object.keys(fields))o[key]=Number(fields[key].value);o.wall_id=wallInput.value;o.dimensions_verified=true;o.placement_verified=true;o.status='user_confirmed_parameters';store.commit(next);persistReview();toast('门窗参数已确认');}catch(e){toast(e.message,true);}};const remove=document.createElement('button');remove.className='text-button';remove.textContent='移除此候选';remove.onclick=()=>{const next=copy(store.scene);next.openings=next.openings.filter(o=>o.id!==opening.id);store.commit(next);persistReview();};row.append(apply,remove);$('review-objects').append(row);}
  if(!store.scene.openings.length){const p=document.createElement('p');p.className='micro-note';p.textContent='当前房间尚无已核对门窗，请先添加并确认门窗参数。';$('review-objects').append(p);}
  const add=document.createElement('div');add.className='button-row';for(const [kind,label]of [['door','新增门'],['window','新增窗']]){const b=document.createElement('button');b.className='quiet-button';b.textContent=label;b.onclick=()=>{try{if(store.scene.space_review?.empty)throw new Error('请先勾绘空间轮廓');const next=copy(store.scene),wall=next.walls[0];next.openings.push({id:'opening_'+Date.now(),label:label+' · 待确认',kind,subtype:kind==='door'?'hinged':'assembly',wall_id:wall.id,u:.1,width:Math.min(.8,G.length(wall)-.2),height:Math.min(kind==='door'?2:1.2,next.room.height-.1),bottom:kind==='door'?0:Math.max(0,next.room.height-1.4),open_angle_deg:0,status:'user_placed_unverified',dimensions_verified:false});store.commit(next);persistReview();}catch(e){toast(e.message,true);}};add.append(b);}$('review-objects').append(add);
  $('existing-review').replaceChildren();for(const [index,f]of (info.existing_furniture||[]).entries()){
   const row=document.createElement('div');row.className='review-item';const name=document.createElement('input');name.value=f.label;name.placeholder='实物名称';row.append(name);const inputs=[];
   for(const [k,label]of ['宽','深','高'].entries()){const l=document.createElement('label');l.textContent=label+' / cm';const input=document.createElement('input');input.type='number';input.value=f.dimensions[k]*100;l.append(input);row.append(l);inputs.push(input);}
   const select=document.createElement('select');for(const [value,label]of [['floor','落地'],['wall','挂墙'],['ceiling','顶装'],['free','自由搭配']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=f.mount||'floor';row.append(select);
   const button=document.createElement('button');button.className='quiet-button full';button.textContent=f.asset_id?'已录入家具库 · 更新尺寸':'确认尺寸并录入家具库';button.onclick=()=>{try{const dims=inputs.map(i=>Number(i.value)/100);if(dims.some(v=>!Number.isFinite(v)||v<=.02))throw new Error('请输入有效的实际尺寸');const next=copy(store.scene),item=next.space_review.existing_furniture[index];item.label=name.value||'已有家具';item.dimensions=dims;item.mount=select.value;item.confirmed=true;item.asset_id||='existing_'+store.id();const asset={id:item.asset_id,label:item.label,dimensions:dims,mount:item.mount,style:'box',dimension_source:'user_input',brand:'已有家具',color:[.55,.55,.55,1]};next.assets=next.assets.filter(a=>a.id!==asset.id);next.assets.push(asset);store.commit(next);persistReview();toast('已录入家具库，可在摆放环节添加');}catch(e){toast(e.message,true);}};row.append(button);$('existing-review').append(row);
  }
  $('review-thread').replaceChildren();const question=document.createElement('p');question.textContent='请核对：房间净尺寸是否正确？门窗位置是否一致？要保留的已有家具，其实测宽、深、高分别是多少？上方表单确认后，可在这里记录补充回答。';$('review-thread').append(question);for(const note of info.notes||[]){const p=document.createElement('p');p.textContent=(note.type==='question'?'待回答：':'记录：')+note.text;$('review-thread').append(p);}
 }
 let furnitureReferences=null;
 async function loadConfig(){config=await api('/api/config');furnitureReferences?.configure(config.tripo);$('connection-status').textContent=config.chat.configured?'视觉与对话模型已配置':'请配置视觉与对话 / 图像模型';return config;}
 async function settings(){try{await loadConfig();$('settings-note').textContent='密钥保存在本机，默认掩码显示；点击眼睛查看，修改后保存。已配置：'+['chat','image','tripo'].filter(k=>config[k].configured).map(k=>({chat:'视觉与对话',image:'图像编辑',tripo:'图片转 3D'})[k]).join('、');for(const [id,value]of [['chat-base',config.chat.base],['chat-model',config.chat.model],['image-base',config.image.base],['image-model',config.image.model],['tripo-base',config.tripo.base],['tripo-model',config.tripo.model]])$('cfg-'+id).value=value||'';}catch(e){$('settings-note').textContent=e.message;}for(const k of ['chat','image','tripo'])$('cfg-'+k+'-key').value='';providerUI?.load(config);$('settings-dialog').showModal();}
 $('settings-dialog').addEventListener('close',()=>providerUI?.clear());
 async function readData(file,max=10*1024*1024){if(!file)throw new Error('请选择图片或 GLB 文件');if(file.size>max)throw new Error(`文件超过 ${max/1024/1024} MB`);return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
 function furnitureParams(){const dimensions=['width','depth','height'].map(k=>$('tripo-'+k).value.trim()===''?null:Number($('tripo-'+k).value)/100);if(dimensions.some(v=>v!==null&&(!Number.isFinite(v)||v<.001||v>100)))throw new Error('选填尺寸须在 0.1cm–100m 之间');return {...readAssetFields('tripo',t('我的家具')),dimensions,mount:$('tripo-mount').value,category:$('tripo-category').value};}
 async function importAsset(params,glb,image=null,{id='tripo_'+store.id(),cover=null}={}){
  const next=copy(store.scene),asset={...params,id,style:'box',brand:'自有家具',dimension_source:params.dimension_source||'estimated_pending_review',geometry_type:'imported_glb',model_glb:glb,color:[.6,.6,.6,1]};
  if(image)asset.reference_image=image;if(cover){asset.cover_image=cover;asset.cover_source='calibration_preview';}
  const index=next.assets.findIndex(a=>a.id===id);if(index<0)next.assets.push(asset);else next.assets[index]=asset;
  store.commit(next);changed();await assetStorage?.(asset);$('tripo-dialog').close();toast('真实三维模型已录入家具库，点击添加或拖入场景');
 }
 for(const button of document.querySelectorAll('[data-stage]'))button.onclick=()=>showStage(button.dataset.stage);
 on('names',()=>{const v=getViewport();if(!v)return;v.showNames=!v.showNames;$('names').classList.toggle('active',v.showNames);if(v.showNames)v.setView('2d');});
 function calibrationFields(){const select=$('calibrate-wall');if(!select)return;select.replaceChildren();if(!store.scene.space_review?.empty)for(const wall of store.scene.walls){const option=document.createElement('option');option.value=wall.id;option.textContent=wall.label+' · 当前 '+G.length(wall).toFixed(2)+' m';select.append(option);}const first=store.scene.walls[0];$('calibrate-length').value=store.scene.space_review?.empty?'':G.length(first).toFixed(2);$('calibrate-height').value=store.scene.room.height;}
 on('confirm-dimensions',async()=>{if(reconstructionHooks){if(store.scene.space_review?.empty)throw new Error('请先在勾绘画布中完成轮廓');const outline=modelingTools.scaleScene(store.scene,$('calibrate-wall').value,Number($('calibrate-length').value));outline.assets=copy(store.scene.assets);outline.space_review={...store.scene.space_review,empty:false,accepted:false};store.commit(outline);changed();renderReview();reconstructionHooks.updated();calibrationFields();toast('已校准比例，保留原有轮廓');return;}store.resizeRoom(...['length','width','height'].map(k=>Number($('confirm-'+k).value)));changed();renderReview();});
 on('calibrate-draw',()=>reconstructionHooks?.draw());
 on('existing-add',()=>{const next=copy(store.scene);next.space_review=copy(review());next.space_review.existing_furniture.push({label:'已有家具',dimensions:[.8,.4,.75],mount:'floor',confirmed:false});store.commit(next);persistReview();});
 for(const [id,type]of [['review-ask','question'],['review-answer','answer']])on(id,()=>{const text=$('review-question').value.trim();if(!text)throw new Error('请先输入核对问题或记录');const next=copy(store.scene);next.space_review=copy(review());next.space_review.notes.push({type,text,created_at:new Date().toISOString()});store.commit(next);$('review-question').value='';persistReview();});
 on('finish-replica',()=>{if(store.scene.space_review?.empty)throw new Error('请先勾绘并闭合空间轮廓');if(!$('review-ack').checked)throw new Error('请勾选尺寸核对确认');const next=copy(store.scene);next.space_review=copy(review());next.space_review.accepted=true;next.space_review.confirmed_at=new Date().toISOString();store.commit(next);changed();if(reconstructionHooks){return reconstructionHooks.confirm();}showStage('layout');toast('空间已确认，可以开始摆家具');});
 function openFurnitureIntake(mode='generate'){
  const dialog=$('tripo-dialog');
  dialog.dataset.intake=mode;
  $('tripo-heading').textContent=mode==='glb'?'导入 GLB 模型':'扫描 / 图片录入家具';
  dialog.showModal();
  dialog.scrollTop=0;
  if(mode==='generate')loadConfig().catch(e=>toast(e.message,true));
 }
 on('api-settings',settings);on('tripo-config',settings);on('tripo-open',()=>openFurnitureIntake());
 on('tripo-network',async()=>{
  const button=$('tripo-network'),label=$('tripo-network-status');
  button.disabled=true;label.textContent='正在检查混元直连和代理…';
  try{
   const {routes}=await api('/api/tripo/network');
   label.textContent=routes.map(route=>`${route.route==='direct'?'直连':'代理'} ${route.ok?'已连通':route.error||'HTTP '+route.http_status}`).join(' · ');
  }catch(error){label.textContent=error.message;}finally{button.disabled=false;}
 });
 on('settings-save',async()=>{const fields=providerUI?.fields()||{};if(!providerUI)for(const k of ['chat','image','tripo'])fields[k+'_key']=$('cfg-'+k+'-key').value;for(const k of ['chat-base','chat-model','image-base','image-model','tripo-base','tripo-model'])fields[k.replace('-','_')]=$('cfg-'+k).value.trim();await api('/api/config',fields);for(const k of ['chat','image','tripo'])$('cfg-'+k+'-key').value='';providerUI?.clear();$('settings-dialog').close();await loadConfig();toast('本机配置已保存');});
 on('tripo-import-glb',async()=>{const params=furnitureParams(),file=$('tripo-glb').files[0];if(!file||!file.name.toLowerCase().endsWith('.glb'))throw new Error('请选择独立 GLB 文件');const head=new DataView(await file.slice(0,12).arrayBuffer());if(head.byteLength<12||head.getUint32(0,true)!==0x46546c67)throw new Error('不是有效的 GLB 文件');showCalibration(params,await readData(file,Infinity));});
 let furnitureResult=null,currentFurnitureTask=null,taskStarted=0,elapsedTimer=null;
 function furnitureProgress(stage,text,percent){
  const labels=['upload','queued','running','downloading','calibration'],index=labels.indexOf(stage);$('tripo-status').textContent=text;$('tripo-progress').hidden=false;
  if(Number.isFinite(percent))$('tripo-progress').value=Math.max(0,Math.min(100,percent));else $('tripo-progress').removeAttribute('value');
  $('tripo-stages').hidden=false;Array.from($('tripo-stages').children).forEach((node,i)=>{node.className=i===index?'active':i<index?'done':'';node.setAttribute('aria-current',i===index?'step':'false');});
 }
 function setFurnitureBusy(value){busy=value;furnitureReferences?.setBusy(value);$('tripo-restore').disabled=value;$('tripo-recover-selected').disabled=value;$('tripo-submit').disabled=value;$('tripo-import-glb').disabled=value;}
 function stopFurnitureTimer(){clearInterval(elapsedTimer);elapsedTimer=null;}
 function showCalibration(params,glb,image=null){furnitureResult={params,glb,image};$('tripo-calibrate').hidden=false;furnitureProgress('calibration','模型已就绪，请在 3D 预览中校准尺寸并确认入库。',100);openCalibration();}
 function openCalibration(){if(!furnitureResult)return;const result=furnitureResult,{params,glb,image}=result;result.assetId||='tripo_'+store.id();calibrateFurniture(glb,params.dimensions,async(dimensions,confirmed,cover)=>{await importAsset({...params,dimensions,dimension_source:confirmed?'user_reference_scaled':'estimated_pending_review'},glb,image,{id:result.assetId,cover});furnitureResult=null;$('tripo-calibrate').hidden=true;},{captureCover:true});}
 on('tripo-calibrate',openCalibration);
 on('tripo-submit',async()=>{if(busy)throw new Error('已有家具重建任务进行中');setFurnitureBusy(true);try{const params=furnitureParams();await loadConfig();const references=furnitureReferences.get(),image=references[0].image,model=furnitureReferences.model();furnitureResult=null;currentFurnitureTask=null;$('tripo-calibrate').hidden=true;$('tripo-resume').hidden=true;taskStarted=Date.now();stopFurnitureTimer();elapsedTimer=setInterval(()=>{$('tripo-elapsed').textContent='已用时 '+Math.floor((Date.now()-taskStarted)/1000)+' 秒 · 关闭弹窗后任务继续，请勿重复提交';},1000);
 furnitureProgress('upload','正在上传图片并向服务商提交任务…');const r=await api('/api/tripo',{references:references.map(({image,view})=>({image,view})),model});currentFurnitureTask={id:r.id,params,image,references};if(typeof indexedDB!=='undefined')try{await writeRecords([['furniture-task:'+r.id,{params,references}]]);}catch{toast('任务已提交，但参考图暂存失败，请保留此页面',true);}try{localStorage.setItem('studio-furniture-task',JSON.stringify({id:r.id,params}));}catch{}$('tripo-task-info').textContent='任务编号：'+(r.remote_id||r.id);furnitureProgress('queued','提交成功，正在查询排队状态…');pollTripo();}catch(e){setFurnitureBusy(false);stopFurnitureTimer();furnitureProgress('error','提交未完成：'+e.message);$('tripo-progress').hidden=true;$('tripo-elapsed').textContent='提交已停止；若结果不明确，请先核对服务商任务和用量，勿重复提交。';throw e;}});
 let recoveryTasks=[];
 function lastFurnitureTask(){try{return JSON.parse(localStorage.getItem('studio-furniture-task'));}catch{return null;}}
 async function restoreFurnitureTask(task){
  if(!task||busy)return;
  setFurnitureBusy(true);
  try{
   const saved=lastFurnitureTask();let record;
   if(typeof indexedDB!=='undefined')try{record=await readRecord('furniture-task:'+task.id);}catch{}
   const params=record?.params||(saved?.id===task.id?saved.params:furnitureParams());
   currentFurnitureTask={id:task.id,params,references:record?.references,image:record?.references?.[0]?.image};
   furnitureResult=null;$('tripo-calibrate').hidden=true;
   $('tripo-task-info').textContent='恢复任务：'+task.remote_id;
   $('tripo-resume').hidden=true;$('tripo-recovery').hidden=true;
   await pollTripo(true);
  }catch(error){setFurnitureBusy(false);throw error;}
 }
 on('tripo-restore',async()=>{
  if(busy||$('tripo-restore').disabled)return;
  $('tripo-restore').disabled=true;
  try{
   const {tasks}=await api('/api/tripo/tasks');
   recoveryTasks=tasks.filter(task=>!['failed','cancelled','banned','expired'].includes(task.status));
   if(!recoveryTasks.length)throw Error('没有可恢复的 24 小时内任务');
   if(recoveryTasks.length===1)return await restoreFurnitureTask(recoveryTasks[0]);
   const select=$('tripo-recovery-task'),saved=lastFurnitureTask();
   const statuses={success:'模型已下载',completed:'已生成',download_failed:'待重新下载',downloading:'下载中',queued:'排队中',in_progress:'生成中'};
   const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Singapore',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
   select.replaceChildren();
   for(const task of recoveryTasks){
    const option=document.createElement('option');option.value=task.id;
    option.textContent=[date.format(task.created),task.model,statuses[task.status]||'可查询'].join(' · ');
    select.append(option);
   }
   const preferred=currentFurnitureTask?.id||saved?.id;
   select.value=recoveryTasks.find(task=>task.id===preferred)?.id||recoveryTasks[0].id;
   $('tripo-recovery').hidden=false;select.focus();
  }finally{$('tripo-restore').disabled=busy;}
 });
 on('tripo-recover-selected',()=>restoreFurnitureTask(recoveryTasks.find(task=>task.id===$('tripo-recovery-task').value)));
 on('tripo-resume',()=>{if(!currentFurnitureTask||busy)return;$('tripo-resume').hidden=true;setFurnitureBusy(true);return pollTripo(true);});
 async function pollTripo(retryDownload=false){const task=currentFurnitureTask;if(!task)return;try{const route='/api/tripo/'+encodeURIComponent(task.id);const r=await api(route+(retryDownload?'?retry_download=1':''));if(r.remote_id)$('tripo-task-info').textContent='任务编号：'+r.remote_id+(r.request_id?' · 查询编号：'+r.request_id:'');const stage=r.stage||r.status;const labels={queued:'服务商排队中',running:'服务商正在生成三维模型',processing:'服务商正在生成三维模型',downloading:'生成完成，正在下载 GLB 模型'};furnitureProgress(stage,(labels[stage]||'正在查询任务状态')+(Number.isFinite(r.progress)?' · '+r.progress+'%':' · 服务商未提供百分比'),r.progress);
 if(r.status==='success'){
  if(r.model_url)furnitureProgress('downloading','正在从本地缓存读取 GLB 模型…');
  const glb=await readMeshResult(r);
  currentFurnitureTask=null;setFurnitureBusy(false);stopFurnitureTimer();showCalibration({...task.params,...(task.references?{reference_images:task.references}:{})},glb,task.image);return;
 }
 if(r.status==='download_failed')throw Error(r.error||'模型已生成，下载失败');
 if(['failed','cancelled','banned','expired'].includes(r.status)){currentFurnitureTask=null;throw new Error(r.error||'3D 重建失败');}setTimeout(pollTripo,3000);
 }catch(e){setFurnitureBusy(false);stopFurnitureTimer();$('tripo-progress').hidden=true;$('tripo-status').textContent=e.message;$('tripo-elapsed').textContent=currentFurnitureTask?'查询已停止，可重新查询同一任务；不会再次提交生成。':'该任务已结束，服务商未返回可用模型。任务编号已保留供排查。';$('tripo-resume').hidden=!currentFurnitureTask;toast(e.message,true);}}

 on('design-send',async()=>{
  if(designRequest)return;
  const input=$('design-prompt'),prompt=input.value.trim();if(!prompt)throw new Error('请描述想要的空间布置');
  const before=copy(store.scene),requestGeneration=generation,request={started:Date.now(),timer:null,controller:new AbortController(),progress:null,stopped:false};designRequest=request;
  input.value='';message(prompt,'user');$('design-send').disabled=true;$('design-send').textContent='等待 AI 回复…';$('design-send').setAttribute('aria-busy','true');$('chat-messages').setAttribute('aria-busy','true');proposalValue=null;$('design-result').hidden=true;
  designStatus('pending','正在连接模型服务');$('design-stop').hidden=false;request.timeout=setTimeout(()=>request.controller.abort(Error('等待设计结果超过100秒，请检查模型服务后重试')),100000);
  const elapsed=()=>Math.max(0,Math.floor((Date.now()-request.started)/1000));
  const tick=()=>{if(designRequest!==request)return;$('design-elapsed').textContent=(request.progress?.received_chars?'已收到 '+request.progress.received_chars+' 字符 · ':'')+'已等待 '+elapsed()+' 秒';if(elapsed()>=30&&!request.progress)designStatus('pending','仍在等待 AI 返回方案，请稍候');};tick();request.timer=setInterval(tick,1000);
  try{
   const preserveExisting=$('design-keep-existing').checked;const r=await requestDesign({prompt,context:context(before),messages:chat.slice(-8),constraints:{preserve_existing:preserveExisting}},{signal:request.controller.signal,onProgress:event=>{if(designRequest!==request||requestGeneration!==generation)return;request.progress=event;designStatus('pending',event.message);$('design-send').textContent=event.phase==='connecting'?'正在连接模型…':'正在生成布局…';tick();}});if(requestGeneration!==generation||designRequest!==request)return;
   designStatus('pending','已收到回复，正在检查布局');
   const result=proposal(before,r,{preserveExisting});proposalValue=result;chat.push({role:'user',content:prompt},{role:'assistant',content:JSON.stringify(r)});
   $('proposal-message').textContent=result.message;$('proposal-validation-summary').textContent=result.issues.length?'空间检查发现 '+result.issues.length+' 项需要核对，请查看下方检查明细。':'空间检查未发现重叠、门前遮挡或通路断开。';$('proposal-operations').textContent=result.operations.map(op=>JSON.stringify(op)).join('\n')||'本轮未修改家具';$('proposal-issues').textContent=result.issues.length?result.issues.map(i=>i.message).join('；'):'未发现重叠或通路问题。';$('design-result').hidden=false;message(result.message);
   $('proposal-apply').disabled=!result.operations.length;$('proposal-apply').textContent='应用 '+result.operations.length+' 项调整到三维空间';designStatus('success',result.operations.length?'已生成 '+result.operations.length+' 项调整，点击下方「应用」摆放家具':'AI 已回复，但没有提出家具位置变化');$('design-elapsed').textContent='用时 '+elapsed()+' 秒';
  }catch(error){
   if(requestGeneration!==generation||designRequest!==request)return;
   const restored=!input.value.trim();if(restored)input.value=prompt;if(request.stopped){designStatus('idle','已停止等待，可以修改需求后重新发送');$('design-elapsed').textContent='';return;}
   designStatus('error',restored?'请求未完成，草稿已恢复':'请求未完成，已保留你正在输入的新内容');$('design-elapsed').textContent='';message('本次 AI 请求未完成：'+error.message,'assistant error');throw error;
  }finally{clearInterval(request.timer);if(designRequest===request)clearDesignRequest();}
 });
 on('design-stop',()=>{if(designRequest){designRequest.stopped=true;designRequest.controller.abort();}});
 on('proposal-apply',()=>{if(!proposalValue)throw new Error('请先生成提案');const count=proposalValue.operations.length;applyProposal(store,proposalValue);changed();designStatus('success','已应用 '+count+' 项家具调整，可以撤销');proposalValue=null;$('design-result').hidden=true;toast('AI 提案已应用，可以撤销或继续手动修改');});on('proposal-discard',()=>{proposalValue=null;$('design-result').hidden=true;designStatus('idle','已放弃提案，当前布局未改变');});
 on('render-capture',async()=>{const v=getViewport();if(!v)throw new Error('三维视图尚未启动');if(v.mode==='2d')throw new Error('请先切换 3D 或人视，调整好渲染视角');renderReference=await v.referenceSnapshot();renderSource=copy(store.scene);$('render-reference').src=renderReference;$('render-reference').hidden=false;toast('已捕获当前视角，已隐藏编辑手柄和辅助线');});
 async function executeRender(resume=false){if(!resume){if(!renderReference)throw new Error('请先捕获当前视角');if(!sceneData.equal(renderSource,store.scene))throw new Error('场景已修改，请重新捕获视角');if(!$('render-prompt').value.trim())throw new Error('请填写效果描述');}const attachments=resume?[]:renderAttachments?.get()||[];$('render-send').disabled=true;$('render-resume').disabled=true;$('render-status').textContent=resume?'正在读取上次渲染任务…':'正在提交效果图，请稍候…';try{const r=await renderImage(api,{image:renderReference,prompt:$('render-prompt').value.trim(),attachments},{resume,onStatus:text=>$('render-status').textContent=text});$('render-output').src=r.image;$('render-output').hidden=false;$('render-download').href=r.image;$('render-download').hidden=false;$('render-status').textContent='效果图已生成 · 三维方案保持不变';}catch(e){$('render-status').textContent=e.message;throw e;}finally{$('render-send').disabled=false;$('render-resume').disabled=false;$('render-resume').hidden=!pendingRender();}}
 on('render-send',()=>executeRender());on('render-resume',()=>executeRender(true));$('render-resume').hidden=!pendingRender();
 for(const id of ['settings-dialog','tripo-dialog'])for(const b of document.querySelectorAll('[data-close]'))if(b.dataset.close===id)b.onclick=()=>$(id).close();
 const saved=store.scene.space_review;document.body.dataset.stage='layout';
 if(saved&&!saved.accepted)showStage('replica');
 loadConfig().catch(()=>{$('connection-status').textContent='启动本地工作台后启用 AI 功能';});
 function bindStyleReference(){renderAttachments=setupRenderAttachments({api,readData,toast});}
 furnitureReferences=setupFurnitureReferences({readData,toast});if(config)furnitureReferences.configure(config.tripo);
 function resetProject(){designRequest?.controller.abort();clearDesignRequest();$('design-status').hidden=true;$('design-elapsed').textContent='';renderAttachments?.clear();generation++;proposalValue=null;renderReference=null;renderSource=null;chat=[];stage='layout';$('design-result').hidden=true;$('render-reference').hidden=true;$('render-output').hidden=true;$('render-download').hidden=true;$('render-status').textContent='';$('design-prompt').value='';$('chat-messages').replaceChildren();}
  return {openVideoRoom,openFurnitureIntake,bindAssetStorage:save=>{assetStorage=save;},bindReconstruction:hooks=>{reconstructionHooks=hooks;},showStage,settings,readData,bindStyleReference,resetProject,refresh:()=>{priceSummary();if(stage==='replica')renderReview();}};
}
