import * as THREE from 'three';
import {Viewport} from './viewport.mjs';
import {icon,hydrateIcons} from './icons.mjs';
import model from './state.cjs';
import {setupWorkflow} from './workflow.mjs';
const {StudioState,G,F,copy,fromTransform,normalized,loadStoredDraft}=model;
const $=id=>document.getElementById(id),initial=JSON.parse($('initial-scene').textContent),store=new StudioState(initial);
const draftKey='space-studio-three-v2:'+initial.provenance.source_video_sha256+':'+(initial.layout_settings?.catalog_revision||'generic');
let viewport=null,workflow=null,category='all',activePanel='library',toastTimer=null,pendingReference=null,proportionsBaseline=null,lastAnalysis=null;
hydrateIcons();
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3300);}
function safe(fn){return (...args)=>{try{return fn(...args);}catch(error){toast(error.message,true);}};}
function saveDraft(){try{localStorage.setItem(draftKey,JSON.stringify(store.scene));const time=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Singapore'}).format(new Date());$('save-status').innerHTML='<i></i>已保存 '+time;}catch(error){$('save-status').textContent='请导出方案备份';}}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveJSON(){download(JSON.stringify(store.scene,null,2),'space-studio.scene.json','application/json');toast('完整房间、家具与商品参考图已导出');}
function changed(){saveDraft();viewport?.rebuild();$('snap-hint').hidden=true;refresh();}
function cm(v){return Math.round(v*10000)/100;}
function labelAsset(asset){if(asset.id==='ikea_micke_80354281')return 'MICKE 米克 · 小书桌';if(asset.id==='ikea_ps2026_chair_20617959')return 'PS 2026 · 彩色折叠椅';if(asset.id==='ikea_rashult_70486668')return 'RÅSHULT 拉舍 · 手推车';return asset.label;}
function assetIcon(asset){return ['desk','micke','coffee'].includes(asset.style||asset.id)?'desk':['cabinet','shelf','trolley'].includes(asset.style||asset.id)?'cabinet':asset.mount==='ceiling'?'light':asset.style==='box'?'cube':'armchair';}
function addAsset(id,point=null){store.add(id,point);changed();viewport?.setTool('move');toast('已放入家具 · 拖动手柄，或直接拖动对象');}
function renderCatalog(){
 const query=$('search').value.trim().toLowerCase();const assets=[...store.scene.assets,...F.presets].filter(asset=>{
  const style=asset.style||asset.id,match=category==='all'||category==='ikea'&&asset.brand==='IKEA'||category==='desk'&&['desk','micke','chair','ps2026_chair','coffee','sofa'].includes(style)||category==='storage'&&['cabinet','trolley','shelf','bookcase','kallax'].includes(style)||category==='light'&&['light','floor_lamp','pendant','track_light','wall_light'].includes(style);return match&&(!query||(asset.label+' '+asset.id+' '+(asset.brand||'')).toLowerCase().includes(query));
 });
 $('catalog').replaceChildren();$('catalog-count').textContent=assets.length+' 件';
 for(const asset of assets){
  const card=document.createElement('article');card.className='product-card';card.draggable=true;card.tabIndex=0;card.setAttribute('aria-label',asset.label+'，拖入场景或点击添加');card.dataset.asset=asset.id;
  const art=document.createElement('div');art.className='product-art';if(asset.reference_image){const image=document.createElement('img');image.src=asset.reference_image;image.alt=asset.label;image.draggable=false;art.append(image);}else art.innerHTML=icon(assetIcon(asset));
  const brand=document.createElement('div');brand.className='product-brand';brand.textContent=asset.brand||'BASIC COLLECTION';const name=document.createElement('div');name.className='product-name';name.textContent=labelAsset(asset);name.title=asset.label;
  const size=document.createElement('div');size.className='product-size';size.textContent=asset.dimensions.map(v=>Math.round(v*100)).join(' × ')+' cm';const add=document.createElement('button');add.className='product-add';add.innerHTML=icon('plus');add.title='放入 '+asset.label;add.setAttribute('aria-label','放入 '+asset.label);add.onclick=safe(event=>{event.stopPropagation();addAsset(asset.id);});
  const price=document.createElement('div');price.className='product-price';price.textContent=Number.isFinite(asset.price_cny)?'¥ '+asset.price_cny.toFixed(2):'价格待填写';price.title=asset.price_checked_at?'宜家官网常规价 · '+asset.price_checked_at.slice(0,10):'自定义或未提供价格';
  card.append(art,brand,name,size,price,add);card.ondblclick=safe(()=>addAsset(asset.id));card.onkeydown=safe(event=>{if(event.key==='Enter')addAsset(asset.id);});card.ondragstart=event=>{event.dataTransfer.setData('application/x-room-asset',asset.id);event.dataTransfer.effectAllowed='copy';};$('catalog').append(card);
 }
 if(!assets.length){const empty=document.createElement('p');empty.className='dialog-note';empty.textContent='没有找到匹配的家具，试试其他关键词。';$('catalog').append(empty);}
}
function renderObjects(){
 $('object-count').textContent=store.scene.furniture.length+' 件家具 · 随方案一起保存';$('object-list').replaceChildren();
 for(const f of store.scene.furniture){const asset=F.asset(store.scene,f.asset_id),row=document.createElement('button');row.className='object-row'+(f.id===store.selected?' active':'');
  if(asset.reference_image){const img=document.createElement('img');img.src=asset.reference_image;img.alt='';row.append(img);}else row.innerHTML=icon(assetIcon(asset));
  const info=document.createElement('div'),title=document.createElement('strong'),size=document.createElement('small');title.textContent=f.label;size.textContent=f.dimensions.map(v=>Math.round(v*100)).join(' × ')+' cm';info.append(title,size);row.append(info);row.onclick=()=>{viewport?.select(f.id);viewport?.focus();};$('object-list').append(row);
 }
}
function renderInspector(scene=store.scene){
 const f=scene.furniture.find(f=>f.id===store.selected);$('inspector-empty').hidden=!!f;$('inspector-object').hidden=!f;document.querySelector('.workbench').classList.toggle('has-selection',!!f);
 $('empty-room-size').textContent=[scene.room.length,scene.room.width,scene.room.height].map(v=>v.toFixed(2)).join(' × ')+' m';$('object-context').hidden=!f||viewport?.mode==='human';if(!f)return;
 const asset=F.asset(scene,f.asset_id),pose=F.pose(scene,f);$('selected-image').hidden=!asset.reference_image;$('selected-placeholder').hidden=!!asset.reference_image;if(asset.reference_image)$('selected-image').src=asset.reference_image;
 $('selected-brand').textContent=(asset.brand||'BASIC COLLECTION')+(Number.isFinite(asset.price_cny)?' · ¥'+asset.price_cny.toFixed(2):'');$('object-name').value=f.label;$('selected-source-type').textContent=asset.model_glb?'实物三维模型 · 尺寸由用户确认':f.dimension_source==='manufacturer_official_dimensions'?'官网尺寸 · 简化三维模型':f.dimension_source==='user_input'?'自定义尺寸 · 可继续调整':'部分尺寸待确认 · 简化模型';
 for(const [index,axis]of ['x','y','z'].entries()){$('dim-'+axis).value=cm(f.dimensions[index]);$('pos-'+axis).value=cm(pose.position[index]);}
 $('angle').value=Math.round(pose.rotation_deg*10)/10;$('mount').value=f.mount;$('wall-fields').hidden=f.mount!=='wall';$('wall').replaceChildren();for(const wall of scene.walls){const option=document.createElement('option');option.value=wall.id;option.textContent=wall.label;$('wall').append(option);}$('wall').value=f.wall_id||scene.walls[0].id;$('wall-u').value=cm(f.u||G.length(scene.walls[0])/2);
 $('pos-x').disabled=$('pos-y').disabled=$('angle').disabled=f.mount==='wall';$('pos-z').disabled=f.mount!=='wall';$('product-source').hidden=!asset.source_url;if(asset.source_url)$('product-source').href=asset.source_url;proportionsBaseline=[...f.dimensions];
 $('colors').replaceChildren();for(const value of ['#fafafa','#dddddd','#aaaaaa','#777777','#444444','#171717']){const button=document.createElement('button');button.style.background=value;button.title='应用配色 '+value;button.setAttribute('aria-label','配色 '+value);button.onclick=safe(()=>{const color=new THREE.Color(value);store.update(f.id,{material_override:[color.r,color.g,color.b,1]});changed();});$('colors').append(button);}
 $('selected-checks').replaceChildren();for(const issue of lastAnalysis?.issues.filter(i=>i.ids.includes(f.id))||[]){const node=document.createElement('p');node.textContent=issue.message;$('selected-checks').append(node);}
}
function renderChecks(){
 lastAnalysis=store.analyze();const n=lastAnalysis.issues.length;$('issue-count').hidden=!n;$('issue-count').textContent=n;$('check-summary').className='check-summary'+(n?' warn':'');$('check-summary').replaceChildren();const number=document.createElement('strong');number.textContent=n?n+' 项待调整':'空间关系清晰';const note=document.createElement('span');note.textContent=lastAnalysis.route.connected?'当前目标宽度下，门间通路连通':'当前门间通路需要调整或核对';$('check-summary').append(number,note);$('check-list').replaceChildren();
 const issues=n?lastAnalysis.issues:[{type:'ok',message:'未发现家具重叠、门前遮挡或门间通路断开。'}];for(const issue of issues){const node=document.createElement('div');node.className='check-item'+(issue.type==='ok'?' ok':'');node.innerHTML=icon(issue.type==='ok'?'check-circle':'warning');const text=document.createElement('span');text.textContent=issue.message;node.append(text);$('check-list').append(node);}
 $('clearance').value=Math.round((store.scene.layout_settings.clearance_m||.8)*100);
}
function refresh(){
 workflow?.refresh();
 renderCatalog();renderObjects();renderChecks();renderInspector();$('room-metrics').textContent=(store.scene.room.length*store.scene.room.width).toFixed(2)+'㎡ · '+store.scene.room.length.toFixed(2)+' × '+store.scene.room.width.toFixed(2)+' m';$('undo').disabled=!store.history.length;$('redo').disabled=!store.future.length;$('object-context').hidden=!store.current()||viewport?.mode==='human';
}
function panel(name){activePanel=name;for(const button of document.querySelectorAll('[data-panel]'))button.classList.toggle('active',button.dataset.panel===name);for(const key of ['library','objects','checks'])$('panel-'+key).hidden=key!==name;document.querySelector('.workbench').classList.add('panel-open');}
function setTool(tool){viewport?.setTool(tool);if(!viewport)toolUI(tool);}
function toolUI(tool){
 for(const button of document.querySelectorAll('[data-tool]'))button.classList.toggle('active',button.dataset.tool===tool);
 const hint={select:'单击选择家具 · 拖动摆放 · 中键环绕 · 右键平移',move:'拖动手柄移动 · X / Y / Z 锁轴 · 输入距离回车',rotate:'拖动旋转环 · 默认 15° 吸附 · 输入角度回车',scale:'拖动缩放手柄 · 输入倍率回车 · Esc 取消',measure:'点击空间中的两个位置测距 · Esc 取消',orbit:'左键拖动环绕空间 · 滚轮缩放',pan:'左键拖动平移视角 · 滚轮缩放'};
 $('tool-hint').textContent=hint[tool];$('precision-label').textContent=tool==='rotate'?'角度':tool==='scale'?'倍率':'距离';$('precision-unit').textContent=tool==='rotate'?'°':tool==='scale'?'×':'m';
}
function openRoom(){for(const [key,field]of [['length','room-length'],['width','room-width'],['height','room-height']])$(field).value=cm(store.scene.room[key]);$('room-dialog').showModal();}
function applyInspector(){
 const f=store.current();if(!f)return;const patch={label:$('object-name').value.trim()||f.label,dimensions:['x','y','z'].map(k=>Number($('dim-'+k).value)/100),position:['x','y','z'].map(k=>Number($('pos-'+k).value)/100),rotation_deg:Number($('angle').value),mount:$('mount').value};
 if(patch.mount==='wall'){patch.wall_id=$('wall').value;patch.u=Number($('wall-u').value)/100;}store.update(f.id,patch);changed();toast('对象参数已更新');
}
function applyPrecision(){
 viewport?.cancel();if(viewport&&!['select','move','rotate','scale'].includes(viewport.tool))throw new Error('先选择移动、旋转或缩放工具，再输入数值');
 const f=store.current();if(!f)throw new Error('先选择一件家具');const raw=$('precision').value.trim(),match=raw.match(/^(-?\d+(?:\.\d+)?)\s*(cm|m|°)?$/i);if(!match)throw new Error('请输入数值，例如 0.3m、20cm、90 或 1.1');
 let amount=Number(match[1]);const next=copy(store.scene),target=next.furniture.find(o=>o.id===f.id),tool=viewport?.tool||'move';
 if(tool==='rotate'){if(f.mount==='wall')throw new Error('挂墙家具沿墙定向');target.rotation_deg=(target.rotation_deg+amount)%360;}
 else if(tool==='scale'){if(amount<=0)throw new Error('缩放倍率必须大于零');target.dimensions=target.dimensions.map((v,k)=>!viewport.axis||viewport.axis===['X','Y','Z'][k]?v*amount:v);target.dimension_source='user_input';}
 else {if(match[2]?.toLowerCase()==='cm')amount/=100;const axis=viewport?.axis||'X';if(f.mount==='wall'){if(axis==='Z')target.position[2]+=amount;else target.u+=amount;}else {if(axis==='Z')throw new Error('落地和顶装家具保持贴合');target.position[axis==='Y'?1:0]+=amount;}}
 store.commit(next);changed();$('precision').value='';toast('精确输入已应用');
}
function handleShortcut(event){
 if(document.body.dataset.stage==='replica')return;
 if(event.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
 const key=event.key.toLowerCase(),ctrl=event.ctrlKey||event.metaKey;
 if(key==='shift'&&viewport?.mode==='human'){viewport.keys.add('shift');return;}
 if(key==='shift'){if(viewport){viewport.fine=true;viewport.gizmo.setTranslationSnap(null);viewport.gizmo.setRotationSnap(null);viewport.gizmo.setScaleSnap(null);}return;}
 if(viewport?.mode==='human'&&['w','a','s','d','shift'].includes(key)){event.preventDefault();viewport.keys.add(key);return;}
 if(ctrl&&key==='z'){event.preventDefault();viewport?.cancel();if(event.shiftKey?store.redo():store.undo())changed();return;}
 if(ctrl&&key==='y'){event.preventDefault();viewport?.cancel();if(store.redo())changed();return;}
 if(ctrl&&key==='d'){event.preventDefault();viewport?.cancel();store.duplicate();changed();return;}
 if(ctrl&&key==='s'){event.preventDefault();saveJSON();return;}
 if(key==='escape'){event.preventDefault();if(viewport?.mode==='human')viewport.setView('3d');else {viewport?.cancel();store.selected=null;setTool('select');viewport?.updateSelection();renderInspector();}return;}
 if(key==='delete'||key==='backspace'){event.preventDefault();viewport?.cancel();store.remove();changed();return;}
 if(event.shiftKey&&key==='z'){event.preventDefault();viewport?.fit();return;}
 const tools={' ':'select',m:'move',q:'rotate',s:'scale',t:'measure',o:'orbit',h:'pan'};if(tools[key]){event.preventDefault();setTool(tools[key]);return;}
 if(['x','y','z'].includes(key)){event.preventDefault();viewport?.setAxis(key.toUpperCase());return;}
 const axes={arrowright:'X',arrowleft:'Y',arrowup:'Z'};if(axes[key]){event.preventDefault();viewport?.setAxis(axes[key]);return;}if(key==='arrowdown'){event.preventDefault();if(viewport){viewport.axis=null;viewport.updateSelection();}for(const b of document.querySelectorAll('[data-axis]'))b.classList.remove('active');return;}
 if(key==='f'){event.preventDefault();viewport?.focus();return;}if(key==='/'){event.preventDefault();panel('library');$('search').focus();return;}
 if(/^[0-9.\-]$/.test(event.key)&&store.current()){event.preventDefault();$('precision').focus();$('precision').value=event.key;}
}

function bind(){
 $('search').oninput=renderCatalog;for(const button of document.querySelectorAll('[data-category]'))button.onclick=()=>{category=button.dataset.category;for(const b of document.querySelectorAll('[data-category]'))b.classList.toggle('active',b===button);renderCatalog();};
 for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{const shell=document.querySelector('.workbench');if(activePanel===button.dataset.panel&&shell.classList.contains('panel-open'))shell.classList.remove('panel-open');else panel(button.dataset.panel);};
 for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>setTool(button.dataset.tool);
 for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>viewport?.setView(button.dataset.view);
 for(const button of document.querySelectorAll('[data-axis]'))button.onclick=()=>viewport?.setAxis(button.dataset.axis);
 $('undo').onclick=()=>{if(store.undo())changed();};$('redo').onclick=()=>{if(store.redo())changed();};$('save').onclick=saveJSON;$('error-save').onclick=saveJSON;
 $('duplicate').onclick=safe(()=>{store.duplicate();changed();toast('已复制家具，可继续移动');});$('delete').onclick=()=>{store.remove();changed();};$('focus').onclick=()=>viewport?.focus();$('fit').onclick=()=>viewport?.fit();$('nav-top').onclick=()=>viewport?.setView('2d');$('nav-iso').onclick=()=>viewport?.setView('3d');
 $('apply').onclick=safe(applyInspector);$('object-name').onchange=safe(()=>{const f=store.current();if(f){store.update(f.id,{label:$('object-name').value.trim()||f.label});changed();}});
 $('mount').onchange=()=>{const wall=$('mount').value==='wall';$('wall-fields').hidden=!wall;$('pos-x').disabled=$('pos-y').disabled=$('angle').disabled=wall;$('pos-z').disabled=!wall;};
 for(const [index,key]of ['x','y','z'].entries())$('dim-'+key).onchange=()=>{if(!$('proportions').checked||!proportionsBaseline)return;const scale=Number($('dim-'+key).value)/100/proportionsBaseline[index];if(!Number.isFinite(scale))return;for(const [i,axis]of ['x','y','z'].entries())if(i!==index)$('dim-'+axis).value=Math.round(proportionsBaseline[i]*scale*10000)/100;};
 $('rotate-quarter').onclick=safe(()=>{const f=store.current();if(!f)return;if(f.mount==='wall')throw new Error('挂墙家具沿墙定向');store.update(f.id,{rotation_deg:(f.rotation_deg+90)%360});changed();});
 $('reset-color').onclick=()=>{const f=store.current();if(!f)return;const next=copy(store.scene);delete next.furniture.find(o=>o.id===f.id).material_override;store.commit(next);changed();};
 $('snap').onclick=()=>{if(!viewport)return;viewport.snap=!viewport.snap;$('snap').classList.toggle('active',viewport.snap);viewport.updateSelection();toast(viewport.snap?'已启用 5cm 网格、贴墙与边缘吸附':'吸附已关闭');};
 $('cutaway').onclick=()=>{if(!viewport)return;viewport.cutaway=!viewport.cutaway;$('cutaway').classList.toggle('active',viewport.cutaway);};$('grid').onclick=()=>{if(!viewport)return;viewport.grid.visible=!viewport.grid.visible;$('grid').classList.toggle('active',viewport.grid.visible);};$('door-zones').onclick=()=>{if(!viewport)return;viewport.showZones=!viewport.showZones;viewport.zones.visible=viewport.showZones;$('door-zones').classList.toggle('active',viewport.showZones);};
 $('precision').onkeydown=safe(event=>{if(event.key==='Enter'){event.preventDefault();applyPrecision();$('viewport').focus();}});
 $('clearance').onchange=safe(()=>{const value=Number($('clearance').value)/100;if(!Number.isFinite(value)||value<.3||value>2)throw new Error('通行宽度请输入 30–200 cm');const next=copy(store.scene);next.layout_settings.clearance_m=value;store.commit(next);changed();});
 $('export-menu').onclick=()=>{$('export-options').hidden=!$('export-options').hidden;};document.addEventListener('pointerdown',event=>{if(!event.target.closest('.menu-anchor'))$('export-options').hidden=true;});
 $('export-glb').onclick=async()=>{try{download(viewport?await viewport.exportGLB():G.exportGLB(store.scene),'space-studio.glb','model/gltf-binary');$('export-options').hidden=true;toast('GLB 已导出，保留独立墙体、门窗与家具节点');}catch(e){toast(e.message,true);}};$('export-image').onclick=safe(()=>{if(!viewport)throw new Error('三维视图尚未启动');const a=document.createElement('a');a.href=viewport.snapshot();a.download='space-studio-view.png';a.click();$('export-options').hidden=true;});
 $('reset-project').onclick=()=>{store.commit(copy(store.initial));changed();$('export-options').hidden=true;toast('已恢复初始测试方案，可以撤销');};
 $('import').onclick=()=>$('import-file').click();$('import-file').onchange=async()=>{try{const file=$('import-file').files[0];if(!file)return;const next=JSON.parse(await file.text());if(next.schema_version!=='room-pilot-1')throw new Error('请选择当前房间方案 JSON');store.commit(normalized(next));changed();if(viewport){viewport.cameras=makeReplacementCameras();viewport.setView('3d');}toast('房间、家具和商品参考图已恢复');}catch(error){toast(error.message,true);}finally{$('import-file').value='';}};
 $('help').onclick=()=>$('help-dialog').showModal();for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();for(const id of ['room-dialog','custom-dialog','help-dialog'])$(id).addEventListener('click',event=>{if(event.target===$(id))$(id).close();});
 for(const id of ['project-menu','room-settings-link','empty-room-settings'])$(id).onclick=openRoom;
 $('apply-room').onclick=safe(()=>{store.resizeRoom(Number($('room-length').value)/100,Number($('room-width').value)/100,Number($('room-height').value)/100);changed();if(viewport){viewport.cameras=makeReplacementCameras();viewport.setView('3d');}$('room-dialog').close();toast('房间净尺寸已更新');});
 $('custom-open').onclick=()=>$('custom-dialog').showModal();$('pick-reference').onclick=()=>$('reference-file').click();$('reference-file').onchange=()=>{const file=$('reference-file').files[0];if(!file)return;if(file.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请选择 4MB 以内的 JPG、PNG 或 WebP 图片',true);return;}const reader=new FileReader();reader.onload=()=>{pendingReference=reader.result;$('reference-name').textContent=file.name;};reader.onerror=()=>toast('图片读取失败',true);reader.readAsDataURL(file);};
 $('create-custom').onclick=safe(()=>{const dimensions=['width','depth','height'].map(k=>Number($('custom-'+k).value)/100),next=copy(store.scene),asset={id:'custom_'+store.id(),label:$('custom-name').value.trim()||'自定义家具',dimensions,mount:$('custom-mount').value,style:'box',dimension_source:'user_input',color:[.6,.69,.58,1]};if(pendingReference)asset.reference_image=pendingReference;next.assets.push(asset);store.commit(next);changed();$('custom-dialog').close();pendingReference=null;$('reference-name').textContent='可选 · JPG / PNG / WebP';category='all';panel('library');renderCatalog();toast('已加入家具库，可拖入场景');});
 document.addEventListener('keydown',safe(handleShortcut));document.addEventListener('keyup',event=>{viewport?.keys.delete(event.key.toLowerCase());if(event.key==='Shift'&&viewport){viewport.fine=false;if(!viewport.transaction)viewport.updateSelection();else {viewport.gizmo.setTranslationSnap(viewport.snap?viewport.gridSize:null);viewport.gizmo.setRotationSnap(viewport.snap?Math.PI/12:null);viewport.gizmo.setScaleSnap(viewport.snap ? .05 : null);}}});window.addEventListener('blur',()=>{viewport?.keys.clear();});
}
import {makeCameras} from './scene.mjs';
function makeReplacementCameras(){return makeCameras(store.scene.room,$('viewport').clientWidth/Math.max(1,$('viewport').clientHeight));}

try{
 const restored=loadStoredDraft(localStorage,initial);if(restored){store.scene=restored.scene;
  for(const fresh of initial.assets.filter(a=>a.brand==='IKEA')){const i=store.scene.assets.findIndex(a=>a.id===fresh.id);if(i<0)store.scene.assets.push(copy(fresh));else store.scene.assets[i]={...store.scene.assets[i],price_cny:fresh.price_cny,price_kind:fresh.price_kind,price_checked_at:fresh.price_checked_at};}
  $('save-status').innerHTML='<i></i>已恢复'+(restored.migrated?'原方案':'草稿');if(restored.migrated)saveDraft();}
}catch(error){}
bind();refresh();toolUI('select');
window.__SPACE_STUDIO_MODEL__=store;
try{
 viewport=new Viewport($('viewport'),store,{
  ready:()=>{$('loading').hidden=true;},
  fatal:message=>{$('loading').hidden=true;$('renderer-error').hidden=false;$('renderer-error-text').textContent=message;window.__SPACE_STUDIO_ERROR__=message;},
  toast,change:changed,select:()=>{renderObjects();renderInspector();},tool:toolUI,
  axis:axis=>{for(const button of document.querySelectorAll('[data-axis]'))button.classList.toggle('active',button.dataset.axis===axis);},
  view:mode=>{for(const button of document.querySelectorAll('[data-view]'))button.classList.toggle('active',button.dataset.view===mode);$('walk-hint').hidden=mode!=='human';$('object-context').hidden=mode==='human'||!store.current();},
  preview:(scene,hints,errors)=>{renderInspector(scene);$('snap-hint').hidden=!hints.length&&!errors.length;$('snap-hint').textContent=errors[0]||hints.join(' · ');if(!hints.length&&!errors.length)$('snap-hint').hidden=true;},
  context:screen=>{const node=$('object-context');node.hidden=!screen.visible||!store.current()||viewport?.mode==='human';node.style.left=Math.max(65,Math.min($('viewport').clientWidth-120,screen.x-52))+'px';node.style.top=Math.max(75,screen.y-55)+'px';},
  labels:labels=>{const layer=$('world-labels');while(layer.children.length<labels.length)layer.append(document.createElement('span'));while(layer.children.length>labels.length)layer.lastChild.remove();labels.forEach((label,i)=>{const node=layer.children[i];node.className='world-label '+label.type;node.textContent=label.text;node.hidden=!label.visible;node.style.left=label.x+'px';node.style.top=label.y+'px';});}
 });
 $('renderer-details').textContent='Three.js r'+THREE.REVISION+' · WebGL 2 · 透视 / 正交相机 · 本地依赖已打包';window.__SPACE_STUDIO__={store,viewport,threeRevision:THREE.REVISION};
}catch(error){$('loading').hidden=true;$('renderer-error').hidden=false;$('renderer-error-text').textContent='当前浏览器未能建立 WebGL 2 三维环境。可保留方案并在支持 WebGL 2 的浏览器打开此文件。具体信息：'+error.message;window.__SPACE_STUDIO_ERROR__=error.message;}
workflow=setupWorkflow({store,getViewport:()=>viewport,changed,toast,download});
