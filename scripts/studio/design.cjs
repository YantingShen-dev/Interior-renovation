const {StudioState,normalized,copy,F}=require('./state.cjs');
const digestScene=s=>JSON.stringify({room:s.room,walls:s.walls,openings:s.openings,furniture:s.furniture,assets:s.assets.map(a=>({id:a.id,dimensions:a.dimensions,mount:a.mount}))});
function context(scene){return {units:'meter',room:scene.room,walls:scene.walls,openings:scene.openings.map(({id,kind,wall_id,u,width,height,bottom,status})=>({id,kind,wall_id,u,width,height,bottom,status})),furniture:scene.furniture,assets:[...scene.assets,...F.presets].map(({id,label,dimensions,mount,style,price_cny})=>({id,label,dimensions,mount,style,price_cny})),clearance_m:scene.layout_settings.clearance_m||.8};}
function proposal(scene,answer){
 if(!answer||typeof answer.message!=='string'||!Array.isArray(answer.operations)||answer.operations.length>30)throw new Error('模型须返回 message 与 operations 数组（最多 30 项）');
 const work=new StudioState(scene);let selected=null;
 for(const op of answer.operations){
  if(op.type==='add'){
   if(!F.asset(work.scene,op.asset_id))throw new Error('AI 引用了家具库中不存在的家具');
   work.add(op.asset_id);selected=work.selected;
   if(op.position||op.rotation_deg!==undefined||op.u!==undefined)patch(work,selected,op);
  }else if(op.type==='update'){if(!work.scene.furniture.some(f=>f.id===op.id))throw new Error('AI 引用了不存在的场景对象');patch(work,op.id,op);}
  else if(op.type==='remove'){if(!work.scene.furniture.some(f=>f.id===op.id))throw new Error('AI 删除对象不存在');work.selected=op.id;work.remove();}
  else throw new Error('不支持的 AI 操作类型');
 }
 const result=normalized(work.scene);return {message:answer.message,operations:answer.operations,scene:result,base:digestScene(scene),issues:F.analyze(result,{clearance:result.layout_settings.clearance_m||.8}).issues};
}
function patch(work,id,op){const value={};for(const k of ['position','rotation_deg','wall_id','u'])if(op[k]!==undefined)value[k]=copy(op[k]);if(op.dimensions)throw new Error('AI 设计保持家具尺寸，请通过属性面板手动修改');work.update(id,value);}
function applyProposal(store,p){if(digestScene(store.scene)!==p.base)throw new Error('场景已有变化，请重新生成设计，避免覆盖刚才的编辑');store.commit(p.scene);}
module.exports={context,proposal,applyProposal,digestScene};
