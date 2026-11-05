/* The editor and AI share geometry, validation and reference-scale operations. */
const P=require('../plan_geometry.js'),G=require('../room_geometry.js'),F=require('../furniture_geometry.js');
const copy=x=>structuredClone(x);
const materials=require('./materials.cjs');
const number={type:'number'},text={type:'string',maxLength:160},explanation={type:'string',maxLength:2000};
const vector=n=>({type:'array',items:number,minItems:n,maxItems:n});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const arr=(items,maxItems=100)=>({type:'array',items,minItems:1,maxItems});
const part=object({center:vector(3),size:vector(3),color:vector(4)});
const tools=[
 ['read_scene','Read the current editable scene and IDs.',object({})],
 ['create_room','Create an arbitrary simple closed polygon, including concave/non-orthogonal rooms. Coordinates in metres, min X/Y must be zero. Does not assume a rectangle. Replaces only this draft.',object({outline:arr(vector(2)),height:number,reason:explanation})],
 ['set_walls','Replace the wall network, including partitions or multiple rooms. Preserve wall IDs referenced by openings. Min X/Y must be zero.',object({walls:arr(object({id:text,start:vector(2),end:vector(2),thickness:number})),height:number,reason:explanation})],
 ['add_opening','Create/update a door/window. XY is the horizontal FLOOR plane; Z is vertical. u and width run ALONG the wall in XY: 0 <= u and u + width <= wall length. bottom and height are vertical Z: 0 <= bottom and bottom + height <= wall height. A wall along Y is NOT a vertical wall segment. Read returned wall lengths before placing openings.',object({id:text,wall_id:text,kind:{type:'string',enum:['door','window']},u:number,width:number,bottom:number,height:number,reason:explanation,subtype:{type:'string',enum:['hinged','double_hinged','sliding','elevator','fixed']},color:vector(4)},['id','wall_id','kind','u','width','bottom','height','reason'])],
 ['register_furniture','Register a reusable warehouse asset. dimensions=[width X,depth Y,height Z] in metres. Parts are NORMALIZED boxes, NOT metres: x/y [-.5,.5], z [0,1]. A whole cabinet box is center=[0,0,0.5],size=[1,1,1]; do not copy dimensions into size or use z=0 for its centre. Multiple boxes model legs/backrests/cushions. source_frame is a supplied frame ID; bbox is normalized [left,top,right,bottom] tightly enclosing ONE object.',object({id:text,label:text,dimensions:vector(3),color:vector(4),parts:arr(part,48),source_frame:text,bbox:vector(4),reason:explanation,mobility:{type:'string',enum:['movable','fixed','unknown']},mount:{type:'string',enum:['floor','wall','ceiling']}},['id','label','dimensions','color','parts','source_frame','bbox','reason'])],
 ['place_furniture','Place/update one observed furniture instance using warehouse asset. Position is centre X/Y and bottom Z in metres; yaw in degrees. Reuse ID across frames to avoid duplicates.',object({id:text,asset_id:text,position:vector(3),rotation_deg:number,reason:explanation})],
 ['set_material','Set observed color and physical surface on one wall, door, window, furniture, floor or ceiling. Use object ID; floor/ceiling are literal IDs. Automatically registers the material in the hard-finish warehouse. For a distinctive visible texture provide material_name, source_frame and bbox enclosing a clean surface patch (no furniture or edges), plus pattern and texture_scale. Colors are estimated from video, not measured.',object({object_id:text,type:{type:'string',enum:Object.keys(materials.presets)},color:vector(4),roughness:number,metalness:number,opacity:number,transmission:number,material_name:text,pattern:{type:'string',enum:['plain','tile','wood','stripes']},texture_scale:number,source_frame:text,bbox:vector(4)},['object_id','type','color','roughness','metalness','opacity','transmission'])],
 ['remove_object','Remove an opening or furniture instance; asset remains in warehouse. Use set_walls to edit wall networks.',object({id:text})],
 ['scale_by_wall','Uniformly scale all room geometry, openings and furniture using a measured wall length.',object({wall_id:text,length:number})],
 ['finish_model','Finish only after creating a coherent enclosed room. Explain inferred/occluded boundaries and unresolved uncertainties. Never present guessed dimensions as measured.',object({summary:explanation,uncertainties:{type:'array',items:explanation,maxItems:30}})]
].map(([name,description,inputSchema])=>({name,description,inputSchema}));
function check(value,s,path='arguments'){
 if(s.enum&&!s.enum.includes(value))throw Error(path+' 无效');
 if(s.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+' 必须是对象');for(const k of s.required||[])if(value[k]===undefined)throw Error(path+'.'+k+' 缺失');for(const [k,v]of Object.entries(value)){if(!s.properties[k])throw Error(path+'.'+k+' 不支持');check(v,s.properties[k],path+'.'+k);}}
 if(s.type==='array'){if(!Array.isArray(value)||value.length<(s.minItems||0)||value.length>(s.maxItems||1000))throw Error(path+' 数组长度无效');value.forEach((v,i)=>check(v,s.items,path+'['+i+']'));}
 if(s.type==='number'&&(!Number.isFinite(value)||Math.abs(value)>10000))throw Error(path+' 数值无效');
 if(s.type==='string'){if(typeof value!=='string')throw Error(path+' 必须是文本');if(value.length>(s.maxLength||1000))throw Error(path+' 长度 '+value.length+' 超过上限 '+(s.maxLength||1000)+'，请缩短文字');}
}
const rounded=n=>Math.round(n*10000)/10000;
function feedback(scene){
 const walls=scene.walls.map(w=>({id:w.id,start:w.start,end:w.end,length:rounded(G.length(w)),height:w.height,openings:scene.openings.filter(o=>o.wall_id===w.id).map(o=>({id:o.id,u:o.u,width:o.width,bottom:o.bottom,height:o.height}))}));
 const closed=!!(scene.room.outline?.length||scene.room.regions?.length);
 const loose=scene.walls.flatMap(w=>[w.start,w.end].filter(p=>!scene.walls.some(other=>other!==w&&P.boundaryDistance(p,[other.start,other.end])<.0001)).map(point=>({wall_id:w.id,point})));
 return {units:'metres; XY=floor plane, Z=height',walls,enclosed:closed,unconnected_endpoints:loose,warnings:closed?[]:['当前没有闭合地面。set_walls 会替换全部墙体；根据画面修复漏掉的边界，不能将未闭合草稿称为完整房间。']};
}
function openingBounds(scene,o){
 const w=scene.walls.find(w=>w.id===o.wall_id);if(!w)throw Error('门窗 '+o.id+' 找不到墙 '+o.wall_id+'；有效墙 ID：'+scene.walls.map(w=>w.id).join(', '));
 const L=G.length(w),end=o.u+o.width,top=o.bottom+o.height;
 if(o.u<0||o.width<=.05||end>L+1e-7||o.bottom<0||o.height<=.05||top>w.height+1e-7)throw Error('门窗 '+o.id+' 超出墙体范围或尺寸无效：墙 '+w.id+' 平面长度 L='+rounded(L)+'m，高 H='+w.height+'m；u + width = '+o.u+' + '+o.width+' = '+rounded(end)+'m（须 <= '+rounded(L)+'）；bottom + height = '+o.bottom+' + '+o.height+' = '+rounded(top)+'m（须 <= '+w.height+'）。当前 u 下最大宽度为 '+rounded(Math.max(0,L-o.u))+'m。XY 是地面，不是高度；竖向只有 Z。若画面中的窗更宽，应修正所属墙段或墙体网络，不能只改窗高。');
 for(const other of scene.openings.filter(v=>v.id!==o.id&&v.wall_id===o.wall_id))if(Math.min(end,other.u+other.width)-Math.max(o.u,other.u)>1e-7&&Math.min(top,other.bottom+other.height)-Math.max(o.bottom,other.bottom)>1e-7)throw Error('门窗 '+o.id+' 与 '+other.id+' 重叠；已有洞口 '+JSON.stringify({u:other.u,width:other.width,bottom:other.bottom,height:other.height})+'。同一洞口请复用原 ID 更新，不要换 ID 重复创建。');
}
function valid(scene){const entities=[...scene.walls,...scene.openings,...(scene.furniture||[])];if(new Set(entities.map(o=>o.id)).size!==entities.length)throw Error('墙体、门窗和家具实例 ID 必须互不重复');if(entities.length>500||(scene.assets||[]).length>500)throw Error('场景对象过多');for(const o of scene.openings)openingBounds(scene,o);const e=G.validate(scene);if(e.length)throw Error(e.join('；'));return scene;}
function scaleScene(input,wallId,length){
 const s=copy(input),wall=s.walls.find(w=>w.id===wallId);if(!wall)throw Error('请选择参照墙');
 const previous=G.length(wall),factor=length/previous;if(!Number.isFinite(length)||length<.1||length>100||factor<.05||factor>20)throw Error('参照长度须为 0.1–100 m，缩放比例须为 0.05–20');
 if(s.room.height*factor<2||s.room.height*factor>8)throw Error('当前编辑器支持 2–8 m 层高；此次等比缩放超出范围，请检查参照长度或先修正估计层高');
 const point=p=>p.map(v=>v*factor);
 for(const k of ['length','width','height'])s.room[k]*=factor;
 if(s.room.outline)s.room.outline=s.room.outline.map(point);
 if(s.room.regions)s.room.regions=s.room.regions.map(r=>r.map(point));
 for(const w of s.walls){w.start=point(w.start);w.end=point(w.end);w.height*=factor;w.thickness*=factor;if(w.skirt)w.skirt.height*=factor;}
 for(const o of s.openings)for(const k of ['u','width','bottom','height'])o[k]*=factor;
 for(const f of s.furniture||[]){f.position=point(f.position);f.dimensions=point(f.dimensions);if(Number.isFinite(f.u))f.u*=factor;f.dimension_source='reference_wall_scaled';}
 // Catalog assets retain their own dimensions; instance dimensions control mesh scaling.
 if(s.observed_furniture)s.observed_furniture=copy(s.furniture);
 delete s.drawing_state;delete s.saved_views;
 s.room.dimension_source='reference_wall_scaled';s.room.height_confirmed=false;
 s.reference_scale={wall_id:wallId,previous_length:previous,measured_length:length,factor,at:new Date().toISOString(),scope:'uniform_room_openings_furniture',note:'仅参照墙长为实测；其余尺寸按比例推算'};
 if(s.ai_modeling)s.ai_modeling.scale_status='reference_wall_scaled';
 return valid(s);
}
class ModelingSession{
 constructor(scene=null){this.scene=scene?valid(copy(scene)):null;this.log=[];this.finished=false;}
 call(name,args={}){
  const tool=tools.find(t=>t.name===name);if(!tool)throw Error('未知建模工具');check(args,tool.inputSchema);let s=copy(this.scene);
  if(name==='read_scene')return s?{...s,modeling_feedback:feedback(s)}:null;
  if(name==='create_room'||name==='set_walls'){
   const points=name==='create_room'?args.outline:args.walls.flatMap(w=>[w.start,w.end]);
   if([0,1].some(k=>Math.abs(Math.min(...points.map(p=>p[k])))>1e-6))throw Error('统一坐标原点：最小 X 和 Y 必须为零');
   if(args.height<2||args.height>8)throw Error('层高须为 2–8 m');
   const base=name==='create_room'?P.createScene(args.outline,args.height):P.createWallScene(args.walls,args.height,s?.openings||[],s?.assets||[]);
   for(const wall of base.walls)wall.reference_line='center';
   if(name==='set_walls')base.furniture=s?.furniture||[];
   s={...s,...base,room:{...base.room,dimension_source:'ai_estimated',height_confirmed:false},ai_modeling:{...s?.ai_modeling,scale_status:'estimated'},space_review:{accepted:true,empty:false,notes:['AI 估计尺寸，请用参照 Scale 校准']}};
  }else{
   if(!s)throw Error('请先调用 create_room 或 set_walls');
   if(name==='add_opening'){const {reason,...o}=args;openingBounds(s,o);o.kind=args.kind;o.label=args.kind==='door'?'门':'窗';o.subtype=args.subtype||(o.kind==='door'?'hinged':'fixed');if(o.color){o.material_override=o.color;delete o.color;}o.status='ai_estimated';o.door_direction='start-in';s.openings=s.openings.filter(v=>v.id!==o.id);s.openings.push(o);}
   if(name==='set_material'){
    const {object_id,material_name,source_frame,bbox,...material}=args;
    if(bbox&&(!source_frame||bbox.some(v=>v<0||v>1)||bbox[2]<=bbox[0]||bbox[3]<=bbox[1]))throw Error('材质纹理须引用有效关键帧与单一表面裁剪框');
    const fingerprint=JSON.stringify([material.type,material.color,material.pattern||'plain',source_frame,bbox]);
    let id=s.assets.find(a=>a.material_fingerprint===fingerprint)?.id;if(!id){let n=s.assets.length;do{id='ai_finish_'+n++;}while(s.assets.some(a=>a.id===id));}
    const asset={id,material_fingerprint:fingerprint,label:material_name||({matte:'哑光墙面',paint:'半光饰面',metal:'金属饰面',glass:'透明玻璃',reflective:'反光饰面'}[material.type])+' · 视频估计',asset_type:'finish',category:'hard',material_type:material.type,color:material.color,pattern:material.pattern||'plain',texture_scale:material.texture_scale||1,target:object_id==='floor'?'floor':'walls',dimensions:[1,1,.03],mount:'wall',style:'box',brand:'视频识别 · 硬装材质',price_unit:'m²',...(source_frame&&bbox?{ai_source:{frame:source_frame,bbox,reason:'画面可见材质纹理；光照与透视未校准'}}:{})};
    s.assets=s.assets.filter(a=>a.id!==id);s.assets.push(asset);s=materials.apply(s,object_id,{...material,asset_id:id});
   }
   if(name==='register_furniture'){
    const {id,label,dimensions,color,parts,source_frame,bbox,reason}=args;
    if(dimensions.some(v=>v<.03||v>20)||color.some(v=>v<0||v>1))throw Error('家具尺寸或颜色无效');
    if(!id.startsWith('ai_'))throw Error('资产 ID 请使用 ai_ 前缀');
    if(bbox.some(v=>v<0||v>1)||bbox[2]<=bbox[0]||bbox[3]<=bbox[1])throw Error('家具裁剪框无效');
    for(const [index,p]of parts.entries()){if(p.size.some(v=>v<=0||v>1)||p.color.some(v=>v<0||v>1)||p.center.some((v,k)=>k===2?v-p.size[k]/2<-.001||v+p.size[k]/2>1.001:Math.abs(v)+p.size[k]/2>.501))throw Error('parts['+index+'] 超出归一化包围盒：center='+JSON.stringify(p.center)+'，size='+JSON.stringify(p.size)+'。x/y 须满足 abs(center)+size/2 <= 0.5；z 须满足 center-size/2 >= 0 且 center+size/2 <= 1；不是米。整盒示例 center=[0,0,0.5], size=[1,1,1]');}
    const a={id,label,dimensions,color,parts,mount:args.mount||'floor',mobility:args.mobility||'unknown',asset_type:'object',style:'compound',category:'soft',dimension_source:'ai_estimated',ai_source:{frame:source_frame,bbox,reason},brand:'视频识别 · AI 简模'};
    s.assets=s.assets.filter(v=>v.id!==id);s.assets.push(a);
   }
   if(name==='place_furniture'){const a=s.assets.find(v=>v.id===args.asset_id);if(!a)throw Error('请先注册该家具');s.furniture=s.furniture.filter(f=>f.id!==args.id);s.furniture.push({id:args.id,kind:'furniture',label:a.label,asset_id:a.id,dimensions:copy(a.dimensions),mount:a.mount||'floor',mobility:a.mobility||'unknown',free_position:true,position:args.position,rotation_deg:args.rotation_deg,dimension_source:'ai_estimated'});}
   if(name==='remove_object'){s.openings=s.openings.filter(o=>o.id!==args.id);s.furniture=s.furniture.filter(f=>f.id!==args.id);}
   if(name==='scale_by_wall')s=scaleScene(s,args.wall_id,args.length);
   if(name==='finish_model'){
    if(!s.room.outline&&!s.room.regions?.length)throw Error('尚未形成闭合房间，请继续修正墙体');
    s.ai_modeling={...s.ai_modeling,summary:args.summary,uncertainties:args.uncertainties};s.observed_furniture=copy(s.furniture);
   }
  }
  valid(s);this.scene=s;this.finished=name==='finish_model';this.log.push({tool:name,arguments:copy(args)});
  return {ok:true,...feedback(s),openings:s.openings.length,furniture:s.furniture.length,assets:s.assets.map(a=>a.id)};
 }
 rpc(message){
  const response={jsonrpc:'2.0',id:message.id};
  if(message.jsonrpc!=='2.0'||typeof message.method!=='string')return {...response,error:{code:-32600,message:'Invalid Request'}};
  if(message.id===undefined)return null;
  if(message.method==='initialize')return {...response,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'room-modeler',version:'1.0.0'}}};
  if(message.method==='ping')return {...response,result:{}};
  if(message.method==='tools/list')return {...response,result:{tools}};
  if(message.method==='tools/call'){try{return {...response,result:{content:[{type:'text',text:JSON.stringify(this.call(message.params?.name,message.params?.arguments))}]}};}catch(e){return {...response,result:{isError:true,content:[{type:'text',text:e.message}]}};}}
  return {...response,error:{code:-32601,message:'Method not found'}};
 }
}
module.exports={tools,ModelingSession,scaleScene,check,feedback};
