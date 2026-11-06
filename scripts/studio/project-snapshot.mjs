// Keep the warehouse separate from a design. Retain snapshots of used/deleted
// assets so an older design remains renderable after a warehouse change.
export function projectSceneSnapshot(scene){
 const refs=new Set([...(scene.furniture||[]),...(scene.observed_furniture||[])].map(f=>f.asset_id));
 for(const item of [...(scene.walls||[]),...(scene.openings||[]),...(scene.furniture||[]),...(scene.observed_furniture||[])])if(item.surface_material?.asset_id)refs.add(item.surface_material.asset_id);
 for(const finish of Object.values(scene.finishes||{}))if(finish?.asset_id)refs.add(finish.asset_id);
 for(const f of scene.space_review?.existing_furniture||[])if(f.asset_id)refs.add(f.asset_id);
 return {...scene,assets:scene.assets.filter(a=>refs.has(a.id))};
}
