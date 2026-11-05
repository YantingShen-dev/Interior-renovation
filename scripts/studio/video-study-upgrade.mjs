import materials from './materials.cjs';
export function upgradeStudyAsset(asset){
 if(!/^ai_study_.*_cee5$/.test(asset.id)||asset.study_revision>=2)return asset;
 return {...asset,category:'soft',asset_type:'object',mobility:'fixed',study_revision:2,brand:'视频识别 · 固定设施（可编辑）'};
}
export function upgradeVideoStudy(scene){
 if(!scene.assets?.some(a=>/^ai_study_.*_cee5$/.test(a.id))||scene.provenance?.study_revision>=3)return scene;
 const s=structuredClone(scene);s.provenance={...s.provenance,study_revision:3};
 s.assets=s.assets.map(upgradeStudyAsset);
 for(const f of s.furniture||[])if(/^ai_study_.*_cee5$/.test(f.asset_id)){f.mobility='fixed';f.free_position=true;}
 s.finishes||={};
 s.finishes.walls||={...materials.presets.matte,type:'matte',color:[.9,.91,.9,1],pattern:'plain'};
 s.finishes.floor||={...materials.presets.paint,type:'paint',color:[.43,.46,.46,1],pattern:'tile'};
 for(const w of s.walls){if(!w.surface_material&&!w.material_override)w.surface_material={...materials.presets.matte,type:'matte',color:[.9,.91,.9,1],pattern:'plain'};w.skirt||={height:.09,color:[.025,.03,.03,1]};}
 for(const o of s.openings){if(o.kind==='window'){o.frame_color||=[.07,.09,.09,1];o.glass_color||=[.65,.75,.73,.3];}if(o.surface_material)continue;if(o.subtype==='elevator')o.surface_material={...materials.presets.metal,type:'metal',color:[.56,.58,.57,1],pattern:'plain'};else if(o.kind==='door')o.surface_material={...materials.presets.paint,type:'paint',color:o.material_override||[.79,.79,.72,1],pattern:'plain'};}
 if(s.drawing_state?.walls){for(const w of s.drawing_state.walls){const current=s.walls.find(a=>a.id===w.id);if(current){w.surface_material||=structuredClone(current.surface_material);w.skirt||=structuredClone(current.skirt);}}delete s.drawing_state.objects;}
 if(s.observed_furniture)s.observed_furniture=structuredClone(s.furniture);
 return s;
}
