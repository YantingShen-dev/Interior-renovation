// Recover reusable finishes from existing video scenes without replacing user edits.
export function catalogObservedFinishes(scene){
 if(!scene.ai_modeling&&!scene.provenance?.study_revision)return scene;
 const next=structuredClone(scene);let changed=false;
 const entries=[...next.walls,...next.openings,...(next.furniture||[])].map(o=>[o.label||o.id,o.surface_material]);
 entries.push(...Object.entries(next.finishes||{}));
 for(const [label,m]of entries){
  if(!m||m.asset_id&&!m.asset_id.startsWith('video_finish_')&&next.assets.some(a=>a.id===m.asset_id))continue;
  const signature=JSON.stringify([m.type||'matte',m.color,m.pattern||'plain',m.texture_scale||1,m.texture||null]);let hash=2166136261;for(const char of signature)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;const id='video_finish_'+hash.toString(16);
  if(next.assets.some(a=>a.id===id)){if(m.asset_id!==id){m.asset_id=id;changed=true;}continue;}
  next.assets.push({id,label:({floor:'地面',walls:'墙面',ceiling:'顶面'}[label]||label)+' · 视频材质',asset_type:'finish',category:'hard',material_type:m.type||'matte',color:m.color,pattern:m.pattern||'plain',texture_scale:m.texture_scale||1,...(m.texture?.startsWith('data:image/')?{reference_image:m.texture}:{}),dimensions:[1,1,.03],mount:'wall',style:'box',target:label==='floor'?'floor':'walls',brand:'视频识别 · 颜色与质感估计',price_unit:'m²'});
  m.asset_id=id;changed=true;
 }
 const used=new Set(entries.map(([,m])=>m?.asset_id));const assets=next.assets.filter(a=>!a.id.startsWith('video_finish_')||used.has(a.id));if(assets.length!==next.assets.length){next.assets=assets;changed=true;}
 return changed?next:scene;
}
