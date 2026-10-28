/* Model operations shared by the Three.js editor and its offline checks. */
const G=require('../room_geometry.js'),F=require('../furniture_geometry.js');
const copy=value=>structuredClone(value),round=v=>Math.round(v*10000)/10000;
function valid(scene){const errors=G.validate(scene);if(errors.length)throw new Error(errors.join('；'));return scene;}
function normalized(scene){const value=copy(scene);value.furniture||=[];value.assets||=[];value.layout_settings||={clearance_m:.8};valid(value);for(const f of value.furniture){const pose=F.pose(value,f);f.position=pose.position.map(round);}return value;}
function loadStoredDraft(storage,initial){const suffix=initial.provenance.source_video_sha256+':'+(initial.layout_settings?.catalog_revision||'generic'),keys=['space-studio-three-v2:'+suffix,'furniture-layout-v1:'+suffix];for(const [index,key]of keys.entries()){try{const raw=storage.getItem(key);if(!raw)continue;const value=JSON.parse(raw);if(value.schema_version!=='room-pilot-1')continue;return {scene:normalized(value),migrated:index>0};}catch(error){}}return null;}
function halfSize(f){const a=f.rotation_deg*Math.PI/180;return [Math.abs(Math.cos(a))*f.dimensions[0]/2+Math.abs(Math.sin(a))*f.dimensions[1]/2,Math.abs(Math.sin(a))*f.dimensions[0]/2+Math.abs(Math.cos(a))*f.dimensions[1]/2];}
function snapFurniture(scene,source,{grid=.05,enabled=true,axis=null}={}){
 const f=copy(source),hints=[];if(!enabled)return {furniture:f,hints};
 if(f.mount==='wall'){if(axis!=='Z')f.u=round(Math.round(f.u/grid)*grid);if(axis==='Z')f.position[2]=round(Math.round(f.position[2]/grid)*grid);return {furniture:f,hints:['沿墙吸附']};}
 const half=halfSize(f);
 for(const [k,key]of [[0,'X'],[1,'Y']]){
  if(axis&&axis!==key)continue;
  const original=f.position[k];f.position[k]=round(Math.round(original/grid)*grid);
  const targets=[{value:half[k],label:'贴墙'},{value:(k===0?scene.room.length:scene.room.width)-half[k],label:'贴墙'}];
  for(const other of scene.furniture.filter(o=>o.id!==f.id)){
   const p=F.pose(scene,other),ext=halfSize({...other,rotation_deg:p.rotation_deg});
   targets.push({value:p.position[k],label:'中心对齐'},{value:p.position[k]-ext[k]-half[k],label:'边缘对齐'},{value:p.position[k]+ext[k]+half[k],label:'边缘对齐'});
  }
  const nearest=targets.sort((a,b)=>Math.abs(a.value-original)-Math.abs(b.value-original))[0];
  if(nearest&&Math.abs(nearest.value-original)<.045){f.position[k]=round(nearest.value);hints.push(nearest.label+' · '+key);}
 }
 return {furniture:f,hints};
}
function placementScore(scene,f){
 if(G.validate({...scene,furniture:[...scene.furniture,f]}).length)return Infinity;
 const p=F.pose(scene,f),polygon=F.footprint(scene,f);let score=0;
 for(const other of scene.furniture){const o=F.pose(scene,other);if(Math.min(p.position[2]+f.dimensions[2],o.position[2]+other.dimensions[2])-Math.max(p.position[2],o.position[2])>1e-7&&F.overlap(polygon,F.footprint(scene,other)))score+=100;}
 for(const z of F.doorZones(scene,scene.layout_settings.clearance_m||.8))if(p.position[2]<z.height&&F.overlap(polygon,z.polygon))score+=10;
 if(f.mount==='wall')for(const o of scene.openings.filter(o=>o.wall_id===f.wall_id))if(Math.min(f.u+f.dimensions[0]/2,o.u+o.width)>Math.max(f.u-f.dimensions[0]/2,o.u)&&Math.min(p.position[2]+f.dimensions[2],o.bottom+o.height)>Math.max(p.position[2],o.bottom))score+=30;
 return score;
}
function place(scene,source){
 let best=null,score=Infinity;
 const check=f=>{const value=placementScore(scene,f);if(value<score){score=value;best=copy(f);}};
 if(source.mount==='wall'){
  for(const wall of scene.walls)for(let u=source.dimensions[0]/2+.01;u<=G.length(wall)-source.dimensions[0]/2;u+=.15)check({...source,wall_id:wall.id,u,position:[0,0,Math.max(0,Math.min(1.2,scene.room.height-source.dimensions[2]))]});
 }else for(const angle of [source.rotation_deg,source.rotation_deg+90])for(let y=.05;y<scene.room.width;y+=Math.max(.15,scene.room.width/24))for(let x=.05;x<scene.room.length;x+=Math.max(.15,scene.room.length/28))check({...source,rotation_deg:angle,position:[round(x),round(y),source.mount==='ceiling'?scene.room.height-source.dimensions[2]:0]});
 return best;
}
function fromTransform(scene,id,transform,mode,{grid=.05,snap=true,axis=null}={}){
 const next=copy(scene),f=next.furniture.find(f=>f.id===id);if(!f)throw new Error('家具不存在');let hints=[];
 if(mode==='translate'){
  if(f.mount==='wall'){const wall=scene.walls.find(w=>w.id===f.wall_id),L=G.length(wall),t=wall.end.map((v,k)=>(v-wall.start[k])/L);f.u=(transform.position[0]-wall.start[0])*t[0]+(transform.position[1]-wall.start[1])*t[1];f.position[2]=transform.position[2];}
  else f.position=[transform.position[0],transform.position[1],f.position[2]];
  const result=snapFurniture(next,f,{grid,enabled:snap,axis});Object.assign(f,result.furniture);hints=result.hints;
 }else if(mode==='rotate'){
  if(f.mount==='wall')return {scene:next,hints:['挂墙家具沿墙定向'],errors:[]};
  let degrees=transform.rotation*180/Math.PI;if(snap)degrees=Math.round(degrees/15)*15;f.rotation_deg=round((degrees%360+360)%360);
 }else if(mode==='scale'){f.dimensions=f.dimensions.map((v,k)=>round(v*transform.scale[k]));f.dimension_source='user_input';}
 const errors=G.validate(next);return {scene:next,hints,errors};
}
class StudioState{
 constructor(initial){this.initial=normalized(initial);this.scene=copy(this.initial);this.history=[];this.future=[];this.selected=this.scene.furniture[0]?.id||null;this.serial=0;}
 current(){return this.scene.furniture.find(f=>f.id===this.selected);}
 id(){return 'furniture_'+Date.now()+'_'+(++this.serial);}
 commit(next,before=this.scene){next=normalized(next);if(JSON.stringify(next)===JSON.stringify(before))return false;this.history.push(copy(before));if(this.history.length>60)this.history.shift();this.future=[];this.scene=next;return true;}
 update(id,patch){const next=copy(this.scene),f=next.furniture.find(f=>f.id===id);if(!f)throw new Error('未选择家具');const changedSize=patch.dimensions&&patch.dimensions.some((v,k)=>Math.abs(v-f.dimensions[k])>1e-8);Object.assign(f,copy(patch));if(changedSize)f.dimension_source='user_input';this.commit(next);return f;}
 add(assetId,point=null){
  const asset=F.asset(this.scene,assetId);if(!asset)throw new Error('家具库中没有这个对象');
  let f={id:this.id(),kind:'furniture',label:asset.label,asset_id:asset.id,dimensions:[...asset.dimensions],position:[0,0,0],rotation_deg:0,mount:asset.mount,dimension_source:asset.dimension_source||'preset_unverified',...(asset.source_url?{source_url:asset.source_url}: {})};
  if(point&&f.mount!=='wall'){f.position=[point[0],point[1],f.mount==='floor'?0:this.scene.room.height-f.dimensions[2]];f=snapFurniture(this.scene,f).furniture;if(G.validate({...this.scene,furniture:[...this.scene.furniture,f]}).length)throw new Error('此位置放不下该家具，请换一个位置');}
  else {f=place(this.scene,f);if(!f)throw new Error('当前房间放不下这个尺寸的家具');}
  const next=copy(this.scene);next.furniture.push(f);this.commit(next);this.selected=f.id;return f;
 }
 duplicate(){const source=this.current();if(!source)throw new Error('先选择一件家具');const f=place(this.scene,{...copy(source),id:this.id(),label:source.label+' 副本'});if(!f)throw new Error('没有可复制到的位置');const next=copy(this.scene);next.furniture.push(f);this.commit(next);this.selected=f.id;return f;}
 remove(){if(!this.current())return;const next=copy(this.scene);next.furniture=next.furniture.filter(f=>f.id!==this.selected);this.commit(next);this.selected=null;}
 undo(){if(!this.history.length)return false;this.future.push(copy(this.scene));this.scene=this.history.pop();return true;}
 redo(){if(!this.future.length)return false;this.history.push(copy(this.scene));this.scene=this.future.pop();return true;}
 resizeRoom(length,width,height){const next=copy(this.scene);next.room={...next.room,length,width,height,dimension_source:'editor_user_input',height_confirmed:false};const positions={wall_side_a:[[0,0],[length,0]],wall_side_b:[[0,width],[length,width]],wall_window:[[0,0],[0,width]],wall_door_end:[[length,0],[length,width]]};for(const wall of next.walls){[wall.start,wall.end]=positions[wall.id];wall.height=height;}this.commit(next);}
 analyze(){return F.analyze(this.scene,{clearance:this.scene.layout_settings.clearance_m||.8});}
}
module.exports={G,F,StudioState,snapFurniture,placementScore,place,halfSize,normalized,valid,copy,round,fromTransform,loadStoredDraft};
