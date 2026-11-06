import model from './state.cjs';
import {projectSceneSnapshot} from './project-snapshot.mjs';
// Legacy records remain designs. A confirmed room is an independent warehouse item.
export function cascadeProjectIds(items,ids){const selected=new Set(ids),roots=new Set(items.filter(p=>selected.has(p.id)&&projectKind(p)==='space').map(p=>p.id));for(const p of items)if(roots.has(p.scene.source_space?.id))selected.add(p.id);return [...selected];}
export const projectKind=item=>item.kind||(item.scene.space_review?.accepted===false?'draft':'design');
export function duplicateDesign(source,items,{id='space_'+crypto.randomUUID(),now=Date.now()}={}){
 if(!source||source.deleted_at||projectKind(source)!=='design')throw new Error('找不到可复制的设计方案');
 if(items.some(item=>item.id===id))throw new Error('方案 ID 已存在');
 const base=source.name+' · 副本',names=new Set(items.filter(item=>!item.deleted_at&&item.scene.source_space?.id===source.scene.source_space?.id).map(item=>item.name));let name=base,index=2;
 while(names.has(name))name=base+' '+index++;
 const item=model.copy(source);item.id=id;item.kind='design';item.name=name;item.updated=now;return item;
}
export function spaceTemplate(scene){
 const next=model.copy(scene);if(next.ai_modeling)next.observed_furniture=model.copy(next.furniture);next.furniture=next.ai_modeling?model.copy(next.observed_furniture||[]):[];next.assets=next.ai_modeling?next.assets:[];if(!next.ai_modeling)delete next.finishes;delete next.saved_views;delete next.source_space;delete next.drawing_state;
 next.space_review={...(next.space_review||{}),accepted:true,confirmed_at:new Date().toISOString()};
 delete next.space_review.pending_job;return next;
}
export function designFromSpace(item,assets){
 if(item.deleted_at||projectKind(item)!=='space'||item.scene.space_review?.accepted!==true)throw new Error('请先确认并保存空间');
 const scene=model.copy(item.scene);scene.furniture=model.copy(scene.observed_furniture||[]);const ids=new Set(assets.map(asset=>asset.id));scene.assets=[...model.copy(assets),...projectSceneSnapshot(scene).assets.filter(asset=>!ids.has(asset.id)).map(asset=>({...asset,unavailable:true}))];scene.source_space={id:item.id,name:item.name};scene.saved_views=[];return scene;
}

export function migrateOrigins(items){return items.map(item=>{if(projectKind(item)!=='design'||item.scene.source_space)return item;const candidates=items.filter(s=>projectKind(s)==='space'&&item.name.startsWith(s.name+' · 设计'));if(candidates.length!==1)return item;return {...item,scene:{...item.scene,source_space:{id:candidates[0].id,name:candidates[0].name}}};});}
export function designAlbums(items){
 const live=items.filter(p=>!p.deleted_at),groups=new Map(live.filter(p=>projectKind(p)==='space').map(p=>[p.id,{id:p.id,name:p.name,space:p,designs:[]}]));
 for(const p of live.filter(p=>projectKind(p)==='design')){
  const id=p.scene.source_space?.id;
  // Albums belong to real saved spaces. Never synthesize a legacy/practice album.
  if(!id||!groups.has(id))continue;
  groups.get(id).designs.push(p);
 }
 return [...groups.values()];
}
export function assetSnapshot(scene,library,removed){
 const retained=projectSceneSnapshot(scene).assets.filter(asset=>removed.includes(asset.id));
 return [...model.copy(library),...retained.map(asset=>({...model.copy(asset),unavailable:true}))];
}

export function enableFreePlacement(scene){for(const f of scene.furniture){if(!f.free_position){const pose=model.F.pose(scene,f);f.position=pose.position;f.rotation_deg=pose.rotation_deg;f.free_position=true;}}scene.layout_settings.free_placement=true;return scene;}
