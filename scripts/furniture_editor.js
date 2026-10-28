/* Offline furniture editor; the full room, assets and furniture travel in one JSON. */
const $=id=>document.getElementById(id),F=RoomFurniture,G=RoomGeometry,canvas=$('view'),ctx=canvas.getContext('2d');
let scene=structuredClone(initialScene),selected=scene.furniture?.[0]?.id||null,history=[],future=[],parts=[],hitFaces=[],analysis=null;
let yaw=0,pitch=Math.PI/2,zoom=1,drag=null,pendingImage=null,serial=0;
const storageKey='furniture-layout-v1:'+initialScene.provenance.source_video_sha256+':'+(initialScene.layout_settings?.catalog_revision||'generic');
function tell(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function current(){return scene.furniture.find(f=>f.id===selected);}
function identifier(){return 'furniture_'+Date.now()+'_'+(++serial);}
function saveDraft(){try{localStorage.setItem(storageKey,JSON.stringify(scene));$('save-note').textContent='已保存当前浏览器草稿。导出 JSON 可备份并在其他页面继续编辑。';}catch(e){$('save-note').textContent='当前浏览器无法保存草稿，请导出方案 JSON。';}}
function commit(next,text='修改已保存到当前方案。'){
 let errors;try{errors=G.validate(next);}catch(e){errors=[e.message];}
 if(errors.length){tell(errors.join('；'),true);return false;}
 history.push(structuredClone(scene));if(history.length>60)history.shift();future=[];scene=next;saveDraft();refresh();tell(text);return true;
}
function options(select,entries){select.replaceChildren();for(const entry of entries){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;select.append(option);}}
function catalogInfo(){const a=F.asset(scene,$('catalog').value);$('catalog-info').textContent=a?`${a.dimensions.join(' × ')} 米 · ${{floor:'落地',wall:'挂墙',ceiling:'顶装'}[a.mount]}${a.brand?' · 官网尺寸简模':''}`:'';$('catalog-image').hidden=!a?.reference_image;if(a?.reference_image)$('catalog-image').src=a.reference_image;$('catalog-source').hidden=!a?.source_url;if(a?.source_url)$('catalog-source').href=a.source_url;}
function syncFields(){
 const f=current();$('editor-section').hidden=!f;if(!f)return;const p=F.pose(scene,f);
 $('label').value=f.label;['x','y','z'].forEach((key,i)=>{$('size-'+key).value=f.dimensions[i];$('pos-'+key).value=p.position[i];});
 $('mount').value=f.mount;$('rotation').value=p.rotation_deg;$('wall-u').value=f.u||0;
 options($('wall'),scene.walls);$('wall').value=f.wall_id||scene.walls[0].id;
 $('wall-fields').hidden=f.mount!=='wall';$('pos-x').disabled=$('pos-y').disabled=$('rotation').disabled=f.mount==='wall';$('pos-z').disabled=f.mount!=='wall';
 const asset=F.asset(scene,f.asset_id);$('asset-image').hidden=!asset?.reference_image;if(asset?.reference_image)$('asset-image').src=asset.reference_image;
 $('product-source').hidden=!asset?.source_url;if(asset?.source_url)$('product-source').href=asset.source_url;$('selected-note').textContent='尺寸简模 · '+(f.dimension_source==='user_input'?'尺寸由用户调整':f.dimension_source==='manufacturer_official_dimensions'?'外包络采用宜家官网尺寸，细节为简化建模':'默认尺寸待按实际家具修正')+'；旋转围绕家具中心。';
}
function check(){
 const value=Number($('clearance').value);if(!Number.isFinite(value)||value<.3||value>2){tell('通行宽度请输入 0.3 至 2 米。',true);return;}
 scene.layout_settings={...scene.layout_settings,clearance_m:value};analysis=F.analyze(scene,{clearance:value});
 $('summary').textContent=`${scene.furniture.length} 件家具 · ${analysis.issues.length} 项提示 · 门间通路${analysis.route.connected?'连通':'待调整或核对'}`;
 $('issues').replaceChildren();for(const issue of analysis.issues){const node=document.createElement('div');node.className='issue';node.textContent=issue.message;$('issues').append(node);}
 if(!analysis.issues.length){const node=document.createElement('div');node.className='issue ok';node.textContent='当前外包络检查未发现重叠或门前遮挡。';$('issues').append(node);}draw();
}
function refresh(){
 scene.furniture||=[];scene.assets||=[];parts=G.buildParts(scene);
 $('room-badge').textContent=[scene.room.length,scene.room.width,scene.room.height].join(' × ')+' m';
 $('scope-note').textContent=`${(scene.room.length*scene.room.width).toFixed(2)}㎡ 测试空间 · 可编辑尺寸占位家具 · 方案与房间一起保存`;
 const catalogValue=$('catalog').value;options($('catalog'),[...scene.assets,...F.presets]);$('catalog').value=F.asset(scene,catalogValue)?catalogValue:scene.assets[0]?.id||F.presets[0].id;catalogInfo();
 if(!current())selected=scene.furniture[0]?.id||null;
 $('furniture-list').replaceChildren();for(const f of scene.furniture){const b=document.createElement('button');b.textContent=f.label+' · '+f.dimensions.map(v=>v.toFixed(2)).join(' × ');b.className=f.id===selected?'active':'';b.onclick=()=>{selected=f.id;refresh();};$('furniture-list').append(b);}
 $('empty').hidden=scene.furniture.length>0;$('undo').disabled=!history.length;$('redo').disabled=!future.length;syncFields();check();
}
function placementScore(s,f){
 const next={...s,furniture:[...s.furniture,f]};if(G.validate(next).length)return Infinity;
 const polygon=F.footprint(s,f),p=F.pose(s,f);let score=0;
 for(const other of s.furniture){const o=F.pose(s,other);if(Math.min(p.position[2]+f.dimensions[2],o.position[2]+other.dimensions[2])-Math.max(p.position[2],o.position[2])>1e-7&&F.overlap(polygon,F.footprint(s,other)))score+=100;}
 for(const z of F.doorZones(s,Number($('clearance').value)||.8))if(p.position[2]<z.height&&F.overlap(polygon,z.polygon))score+=10;
 if(f.mount==='wall')for(const o of s.openings.filter(o=>o.wall_id===f.wall_id))if(Math.min(f.u+f.dimensions[0]/2,o.u+o.width)>Math.max(f.u-f.dimensions[0]/2,o.u)&&Math.min(p.position[2]+f.dimensions[2],o.bottom+o.height)>Math.max(p.position[2],o.bottom))score+=20;
 return score;
}
function place(s,source){
 let best=null,score=Infinity;
 function candidate(f){const value=placementScore(s,f);if(value<score){score=value;best=structuredClone(f);}}
 if(source.mount==='wall'){
  for(const wall of s.walls){const length=G.length(wall);for(let u=source.dimensions[0]/2+.01;u<=length-source.dimensions[0]/2;u+=.15)candidate({...source,wall_id:wall.id,u,position:[0,0,Math.max(0,Math.min(1.2,s.room.height-source.dimensions[2]))]});}
 }else{
  for(const angle of [source.rotation_deg,source.rotation_deg+90])for(let y=.05;y<s.room.width;y+=Math.max(.15,s.room.width/24))for(let x=.05;x<s.room.length;x+=Math.max(.15,s.room.length/28))candidate({...source,rotation_deg:angle,position:[x,y,source.mount==='ceiling'?s.room.height-source.dimensions[2]:0]});
 }
 return best;
}
function addAsset(assetId){
 const asset=F.asset(scene,assetId);if(!asset)return;const f={id:identifier(),label:asset.label,kind:'furniture',asset_id:asset.id,mount:asset.mount,dimensions:[...asset.dimensions],position:[0,0,0],rotation_deg:0,dimension_source:asset.dimension_source||'preset_unverified'};
 const next=structuredClone(scene),placed=place(next,f);if(!placed){tell('当前房间放不下此尺寸，请先创建更小的自定义家具或调整房间。',true);return;}
 next.furniture.push(placed);if(commit(next,'已添加尺寸占位家具，请查看右侧布局检查。')){selected=placed.id;refresh();}
}
$('catalog').onchange=catalogInfo;$('add').onclick=()=>addAsset($('catalog').value);
$('test-desk').onclick=()=>{addAsset('desk');addAsset('chair');};
$('mount').onchange=()=>{const mounted=$('mount').value==='wall';$('wall-fields').hidden=!mounted;$('pos-x').disabled=$('pos-y').disabled=$('rotation').disabled=mounted;$('pos-z').disabled=!mounted;};
$('apply').onclick=()=>{
 const next=structuredClone(scene),f=next.furniture.find(v=>v.id===selected);if(!f)return;
 f.label=$('label').value.trim()||f.label;f.dimensions=['x','y','z'].map(k=>Number($('size-'+k).value));f.mount=$('mount').value;f.position=['x','y','z'].map(k=>Number($('pos-'+k).value));f.rotation_deg=Number($('rotation').value);
 if(f.mount==='wall'){f.wall_id=$('wall').value;f.u=Number($('wall-u').value);}else f.position[2]=f.mount==='floor'?0:scene.room.height-f.dimensions[2];
 f.dimension_source='user_input';commit(next);
};
$('rotate').onclick=()=>{const next=structuredClone(scene),f=next.furniture.find(v=>v.id===selected);if(!f)return;if(f.mount==='wall'){tell('挂墙家具沿所属墙摆放，可修改墙和沿墙位置。');return;}f.rotation_deg=(f.rotation_deg+90)%360;commit(next);};
$('remove').onclick=()=>{if(!current())return;const next=structuredClone(scene);next.furniture=next.furniture.filter(f=>f.id!==selected);commit(next,'家具已删除，可以撤销。');};
$('duplicate').onclick=()=>{const f=current();if(!f)return;const next=structuredClone(scene),copy=place(next,{...structuredClone(f),id:identifier(),label:f.label+' 副本'});if(!copy){tell('没有可放置的位置。',true);return;}next.furniture.push(copy);if(commit(next,'已复制家具，请检查空间重叠。')){selected=copy.id;refresh();}};
$('undo').onclick=()=>{if(!history.length)return;future.push(structuredClone(scene));scene=history.pop();saveDraft();refresh();tell('已撤销。');};
$('redo').onclick=()=>{if(!future.length)return;history.push(structuredClone(scene));scene=future.pop();saveDraft();refresh();tell('已重做。');};
$('restore').onclick=()=>{selected=null;commit(structuredClone(initialScene),'已恢复初始测试方案，可撤销。');};
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('save').onclick=()=>download(JSON.stringify(scene,null,2),'furnished_room.scene.json','application/json');
$('glb').onclick=()=>{try{download(G.exportGLB(scene),'furnished_room.glb','model/gltf-binary');tell('已导出房间和家具，家具保留独立节点。');}catch(e){tell(e.message,true);}};
$('load').onclick=()=>$('file-json').click();$('file-json').onchange=async()=>{try{const file=$('file-json').files[0];if(!file)return;const next=JSON.parse(await file.text());if(next.schema_version!=='room-pilot-1')throw new Error('请选择房间方案 JSON');next.furniture||=[];next.assets||=[];if(commit(next,'方案已导入，房间和家具一起恢复。')){$('clearance').value=next.layout_settings?.clearance_m||.8;refresh();}}catch(e){tell('导入失败：'+e.message,true);}finally{$('file-json').value='';}};
$('pick-image').onclick=()=>$('file-image').click();$('file-image').onchange=()=>{const file=$('file-image').files[0];if(!file)return;if(file.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){tell('请选择不超过 4 MB 的 PNG、JPEG 或 WebP 图片。',true);return;}const reader=new FileReader();reader.onload=()=>{pendingImage=reader.result;$('image-status').textContent='已选择 '+file.name+'，加入家具库后随方案保存。';};reader.onerror=()=>tell('参考图读取失败。',true);reader.readAsDataURL(file);};
$('create-asset').onclick=()=>{
 const dimensions=['x','y','z'].map(k=>Number($('custom-'+k).value));if(!dimensions.every(v=>Number.isFinite(v)&&v>.02)){tell('自定义家具尺寸必须大于 0.02 米。',true);return;}
 const next=structuredClone(scene),asset={id:'asset_'+identifier(),label:$('custom-name').value.trim()||'自定义家具',dimensions,mount:$('custom-mount').value,color:[.52,.64,.71,1],style:'box',dimension_source:'user_input'};
 if(pendingImage)asset.reference_image=pendingImage;next.assets.push(asset);if(commit(next,'已加入家具库，点击添加到房间即可摆放。')){$('catalog').value=asset.id;catalogInfo();pendingImage=null;$('image-status').textContent='未选择参考图';}
};
function project(point,W,H){
 const target=[scene.room.length/2,scene.room.width/2,scene.room.height/2],v=point.map((x,k)=>x-target[k]),right=[Math.cos(yaw),Math.sin(yaw)],forward=[-Math.sin(yaw),Math.cos(yaw)],horizontal=v[0]*forward[0]+v[1]*forward[1];
 const x=v[0]*right[0]+v[1]*right[1],y=-Math.sin(pitch)*horizontal+Math.cos(pitch)*v[2],depth=Math.cos(pitch)*horizontal+Math.sin(pitch)*v[2];
 const spanX=Math.abs(Math.cos(yaw))*scene.room.length+Math.abs(Math.sin(yaw))*scene.room.width+.4,spanY=Math.sin(pitch)*(Math.abs(Math.sin(yaw))*scene.room.length+Math.abs(Math.cos(yaw))*scene.room.width)+Math.cos(pitch)*scene.room.height+.6,scale=.88*Math.min(W/spanX,H/spanY)*zoom;
 return [W/2+x*scale,H/2-y*scale,depth];
}
function screenToPlane(x,y,z){
 const {width:W,height:H}=canvas.getBoundingClientRect(),o=project([0,0,z],W,H),px=project([1,0,z],W,H),py=project([0,1,z],W,H),a=px[0]-o[0],b=py[0]-o[0],c=px[1]-o[1],d=py[1]-o[1],det=a*d-b*c;
 if(Math.abs(det)<1e-8)return null;return [((x-o[0])*d-(y-o[1])*b)/det,((y-o[1])*a-(x-o[0])*c)/det];
}
function draw(){
 const {width:W,height:H}=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#edf3f5';ctx.fillRect(0,0,W,H);hitFaces=[];
 const forward=[-Math.sin(yaw)*Math.cos(pitch),Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch)],faces=[];
 for(const part of parts){
  if(part.role==='ceiling'&&!$('ceiling').checked)continue;
  const opening=scene.openings.find(o=>o.id===part.parent),wall=scene.walls.find(w=>w.id===(opening?.wall_id||part.parent));if(wall&&$('cutaway').checked&&wall.outward[0]*forward[0]+wall.outward[1]*forward[1]>.02)continue;
  for(const box of part.boxes){const vertices=G.boxVertices(box);for(const quad of G.quads){const xyz=quad.map(i=>vertices[i]),screen=xyz.map(p=>project(p,W,H));faces.push({screen,depth:screen.reduce((v,p)=>v+p[2],0)/4,color:part.color,parent:part.parent,role:part.role});}}
 }
 const layer=face=>face.role==='floor'?0:$('cutaway').checked&&face.role==='furniture'?2:1;
 faces.sort((a,b)=>layer(a)-layer(b)||a.depth-b.depth);for(const face of faces){ctx.beginPath();face.screen.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();const color=face.color;ctx.fillStyle=`rgba(${color.slice(0,3).map(v=>Math.round(v*255)).join(',')},${color[3]})`;ctx.fill();ctx.strokeStyle=face.parent===selected?'#d18a2c':'#7d939d66';ctx.lineWidth=face.parent===selected?1.7:.5;ctx.stroke();hitFaces.push(face);}
 if($('zones').checked&&analysis){for(const zone of analysis.door_zones){const points=zone.polygon.map(p=>project([...p,.012],W,H));ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle='#e7aa3a18';ctx.fill();ctx.strokeStyle='#c59a4b88';ctx.lineWidth=1;ctx.stroke();}}
 for(const f of scene.furniture){const p=F.pose(scene,f),v=project([p.position[0],p.position[1],p.position[2]+f.dimensions[2]+.04],W,H);ctx.font='12px system-ui';ctx.fillStyle=f.id===selected?'#a8681a':'#245160';ctx.fillText(f.label,v[0]+5,v[1]-3);}
 ctx.fillStyle='#647d8e';ctx.font='12px system-ui';ctx.fillText('米制 · 拖动家具摆放 · 空白处旋转 · 滚轮缩放',14,H-15);
}
function hit(x,y){for(let i=hitFaces.length-1;i>=0;i--){const face=hitFaces[i];if(scene.furniture.some(f=>f.id===face.parent)&&F.pointDistance([x,y],face.screen.map(p=>p.slice(0,2)))<1e-6)return face.parent;}return null;}
canvas.onpointerdown=e=>{
 const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,id=hit(x,y);if(id){selected=id;syncFields();}
 const f=current(),moving=id&&$('mode').value==='move';const z=moving?F.pose(scene,f).position[2]:0;
 drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,before:structuredClone(scene),moving,z,start:moving?screenToPlane(x,y,z):null,changed:false};canvas.setPointerCapture(e.pointerId);draw();
};
canvas.onpointermove=e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
 if(!drag.moving){yaw+=dx*.007;pitch=Math.max(.18,Math.min(Math.PI/2,pitch+dy*.007));draw();return;}
 const rect=canvas.getBoundingClientRect(),point=screenToPlane(e.clientX-rect.left,e.clientY-rect.top,drag.z);if(!point||!drag.start)return;
 const next=structuredClone(drag.before),f=next.furniture.find(v=>v.id===selected),delta=point.map((v,k)=>v-drag.start[k]);
 if(f.mount==='wall'){const wall=next.walls.find(w=>w.id===f.wall_id),L=G.length(wall),t=wall.end.map((v,k)=>(v-wall.start[k])/L);f.u=Math.round((f.u+delta[0]*t[0]+delta[1]*t[1])*100)/100;}
 else {f.position[0]=Math.round((f.position[0]+delta[0])*100)/100;f.position[1]=Math.round((f.position[1]+delta[1])*100)/100;}
 const errors=G.validate(next);if(errors.length){tell('此位置超出房间或挂墙边界，已保留上一个有效位置。',true);return;}
 scene=next;parts=G.buildParts(scene);drag.changed=true;draw();
};
canvas.onpointerup=()=>{if(!drag)return;const before=drag.before,changed=drag.changed;drag=null;if(changed){history.push(before);future=[];saveDraft();refresh();tell('位置已更新，右侧检查已刷新。');}else refresh();};
canvas.onpointercancel=()=>{if(drag?.moving){scene=drag.before;drag=null;refresh();}else drag=null;};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.35,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw();};
$('top').onclick=()=>{yaw=0;pitch=Math.PI/2;zoom=1;$('mode').value='move';draw();};$('iso').onclick=()=>{yaw=-.78;pitch=.68;zoom=1;draw();};$('reset').onclick=$('top').onclick;
for(const id of ['cutaway','ceiling','zones'])$(id).onchange=draw;$('check').onclick=()=>{check();saveDraft();};$('clearance').onchange=()=>{check();saveDraft();};window.onresize=draw;
try{const saved=localStorage.getItem(storageKey);if(saved){const restored=JSON.parse(saved);if(!G.validate(restored).length){scene=restored;tell('已恢复当前浏览器的家具草稿。');}}}catch(e){}
scene.furniture||=[];scene.assets||=[];$('mode').value='move';$('clearance').value=scene.layout_settings?.clearance_m||.8;refresh();
