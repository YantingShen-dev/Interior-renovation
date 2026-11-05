import model from './state.cjs';
// Legacy records remain designs. A confirmed room is an independent warehouse item.
export function cascadeProjectIds(items,ids){const selected=new Set(ids),roots=new Set(items.filter(p=>selected.has(p.id)&&projectKind(p)==='space').map(p=>p.id));for(const p of items)if(roots.has(p.scene.source_space?.id))selected.add(p.id);return [...selected];}
export const projectKind=item=>item.kind||(item.scene.space_review?.accepted===false?'draft':'design');
export function spaceTemplate(scene){
 const next=model.copy(scene);if(next.ai_modeling)next.observed_furniture=model.copy(next.furniture);next.furniture=next.ai_modeling?model.copy(next.observed_furniture||[]):[];next.assets=next.ai_modeling?next.assets:[];if(!next.ai_modeling)delete next.finishes;delete next.saved_views;delete next.source_space;delete next.drawing_state;
 next.space_review={...(next.space_review||{}),accepted:true,confirmed_at:new Date().toISOString()};
 delete next.space_review.pending_job;return next;
}
export function designFromSpace(item,assets){
 if(item.deleted_at||projectKind(item)!=='space'||item.scene.space_review?.accepted!==true)throw new Error('请先确认并保存空间');
 const scene=model.copy(item.scene);scene.assets=model.copy(assets);scene.furniture=model.copy(scene.observed_furniture||[]);scene.source_space={id:item.id,name:item.name};scene.saved_views=[];return scene;
}

export function migrateOrigins(items){return items.map(item=>{if(projectKind(item)!=='design'||item.scene.source_space)return item;const candidates=items.filter(s=>projectKind(s)==='space'&&item.name.startsWith(s.name+' · 设计'));if(candidates.length!==1)return item;return {...item,scene:{...item.scene,source_space:{id:candidates[0].id,name:candidates[0].name}}};});}
export function designAlbums(items){
 const live=items.filter(p=>!p.deleted_at),groups=new Map(live.filter(p=>projectKind(p)==='space').map(p=>[p.id,{id:p.id,name:p.name,space:p,designs:[]}]));
 for(const p of live.filter(p=>projectKind(p)==='design')){
  const origin=p.scene.source_space,id=origin?.id||'legacy';
  // Do not resurrect a deleted/missing space as an album from its saved designs.
  if(origin?.id&&!groups.has(id))continue;
  if(!groups.has(id))groups.set(id,{id,name:'既有设计',space:null,designs:[]});
  groups.get(id).designs.push(p);
 }
 return [...groups.values()];
}
export function assetSnapshot(scene,library,removed){const refs=new Set([...(scene.furniture||[]).map(f=>f.asset_id),...Object.values(scene.finishes||{}).map(f=>f.asset_id)]);return [...model.copy(library),...scene.assets.filter(a=>removed.includes(a.id)&&refs.has(a.id)).map(a=>({...model.copy(a),unavailable:true}))];}

export function enableFreePlacement(scene){for(const f of scene.furniture){if(!f.free_position){const pose=model.F.pose(scene,f);f.position=pose.position;f.rotation_deg=pose.rotation_deg;f.free_position=true;}}scene.layout_settings.free_placement=true;return scene;}
