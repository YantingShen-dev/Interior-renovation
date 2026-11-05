const {ModelingSession,feedback}=require('./modeling-tools.cjs');
// A checkpoint is editable evidence, not a completed reconstruction. Never mutate it.
function draftFor(job){
 if(!['failed','cancelled'].includes(job.status)||!job.checkpoint?.walls?.length)return null;
 let scene;try{scene=new ModelingSession(job.checkpoint).scene;}catch{return null;}
 const suffix='_draft_'+job.id.slice(0,8),ids=new Map(scene.assets.map(a=>[a.id,a.id+suffix]));
 for(const a of scene.assets)a.id=ids.get(a.id);
 for(const f of scene.furniture)f.asset_id=ids.get(f.asset_id);
 scene.observed_furniture=structuredClone(scene.furniture);
 const info=feedback(scene);
 scene.ai_modeling={...scene.ai_modeling,completion:'partial',summary:'未完成的 AI 建模草稿：'+scene.walls.length+' 段墙、'+scene.openings.length+' 个门窗、'+scene.furniture.length+' 件家具。'+(info.enclosed?'已有闭合区域，仍需核对缺失项。':'墙体尚未闭合。'),plan:job.plan,source:job.source||{name:'视频'},mode:job.mode||'primitive',recovered_job:job.id,uncertainties:[...(job.plan?.uncertainties||[]),...info.warnings,job.message],tool_log:(job.diagnostics||[]).filter(d=>d.ok&&d.tool).map(d=>({tool:d.tool,arguments:d.arguments}))};
 scene.provenance={...scene.provenance,model_type:'vision_tool_partial',source_video_sha256:job.source?.sha256||'ai-draft-'+job.id,dimensions_measured:false};
 scene.space_review={...scene.space_review,accepted:false,notes:[scene.ai_modeling.summary,'尺寸均为估计值，尚未完成重建']};
 return scene;
}
module.exports={draftFor};
