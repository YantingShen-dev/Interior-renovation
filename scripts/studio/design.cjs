const {StudioState,normalized,copy,F}=require('./state.cjs');
const P=require('../plan_geometry.js');
const digestScene=s=>JSON.stringify({room:s.room,walls:s.walls,openings:s.openings,furniture:s.furniture,assets:s.assets.map(a=>({id:a.id,dimensions:a.dimensions,mount:a.mount,deleted_at:a.deleted_at,unavailable:a.unavailable,label:a.label,category:a.category,price_cny:a.price_cny}))});
function context(scene){return {units:'meter',room:scene.room,room_bounds:P.bounds(scene),walls:scene.walls,openings:scene.openings.map(({id,kind,subtype,wall_id,u,width,height,bottom,status,door_direction,open_angle_deg})=>({id,kind,subtype,wall_id,u,width,height,bottom,status,door_direction,open_angle_deg})),door_clearance_zones:F.doorZones(scene,scene.layout_settings.clearance_m||.8),furniture:scene.furniture,assets:scene.assets.filter(a=>a.asset_type!=='finish'&&!a.deleted_at&&!a.unavailable).map(({id,label,dimensions,mount,style,price_cny})=>({id,label,dimensions,mount,style,price_cny})),clearance_m:scene.layout_settings.clearance_m||.8};}
function proposal(scene,answer,{preserveExisting=false}={}){
 if(!answer||typeof answer.message!=='string'||!Array.isArray(answer.operations)||answer.operations.length>30)throw new Error('模型须返回 message 与 operations 数组（最多 30 项）');
 const work=new StudioState(scene),operations=[];let selected=null;
 for(const op of answer.operations){
  const previous=work.history.length;
  if(op.type==='add'){
   if(!work.scene.assets.some(a=>a.id===op.asset_id&&!a.deleted_at&&!a.unavailable))throw new Error('AI 引用了家具库中不存在的家具');
   work.add(op.asset_id);selected=work.selected;
   if(op.position||op.rotation_deg!==undefined||op.u!==undefined)patch(work,selected,op);
  }else if(op.type==='update'){if(!work.scene.furniture.some(f=>f.id===op.id))throw new Error('AI 引用了不存在的场景对象');patch(work,op.id,op);}
  else if(op.type==='remove'){if(preserveExisting)throw new Error('当前已要求保留现有物品，不能移除家具');if(!work.scene.furniture.some(f=>f.id===op.id))throw new Error('AI 删除对象不存在');work.selected=op.id;work.remove();}
  else throw new Error('不支持的 AI 操作类型');
  if(work.history.length>previous)operations.push(op);
 }
 const result=normalized(work.scene);return {message:answer.message,operations,scene:result,base:digestScene(scene),issues:F.analyze(result,{clearance:result.layout_settings.clearance_m||.8}).issues};
}
function patch(work,id,op){const value={};for(const k of ['position','rotation_deg','wall_id','u'])if(op[k]!==undefined)value[k]=copy(op[k]);if(op.dimensions)throw new Error('AI 设计保持家具尺寸，请通过属性面板手动修改');work.update(id,value);}
function applyProposal(store,p){if(digestScene(store.scene)!==p.base)throw new Error('场景已有变化，请重新生成设计，避免覆盖刚才的编辑');store.commit(p.scene);}
module.exports={context,proposal,applyProposal,digestScene};
