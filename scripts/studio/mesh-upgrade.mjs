// Retry polling reuses the paid task ID. Never silently re-submit an incomplete task.
export async function upgradeMeshes(scene,{request,save=async()=>{},status=()=>{},cancelled=()=>false,pause=ms=>new Promise(r=>setTimeout(r,ms)),timeout=15*60*1000}){
 const assets=scene.assets.filter(a=>a.asset_type!=='finish'&&a.ai_source&&!a.model_glb);
 for(const [index,a]of assets.entries()){
  if(cancelled())break;if(!a.reference_image)continue;status(`图片转 3D · ${index+1}/${assets.length} · ${a.label}`);
  try{
   if(!a.mesh_task_id){const task=await request('/api/tripo',{image:a.reference_image});if(!task.id)throw Error('服务未返回任务 ID');a.mesh_task_id=task.id;a.mesh_status='running';await save(scene);}
   const deadline=Date.now()+timeout;
   for(;;){if(cancelled())break;const t=await request('/api/tripo/'+a.mesh_task_id);if(t.status==='success'){if(!t.model_glb)throw Error('服务未返回网格');a.model_glb=t.model_glb;a.mesh_status='ready';delete a.mesh_error;a.brand='视频识别 · 图片转 3D';break;}if(['failed','cancelled','canceled','banned','expired','unknown'].includes(t.status))throw Error(t.error||'模型生成失败，保留简模与任务 ID');if(Date.now()>deadline)throw Error('模型生成尚未完成，可稍后继续查询');await pause(3000);}
  }catch(e){a.mesh_status='incomplete';a.mesh_error=e.message;}
  await save(scene);
 }
 return scene;
}
