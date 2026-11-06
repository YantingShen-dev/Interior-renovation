import {readMeshResult} from './mesh-result.mjs';

// Retry polling reuses the paid task ID. Never silently re-submit an incomplete task.
export async function upgradeMeshes(scene,{request,save=async()=>{},status=()=>{},cancelled=()=>false,pause=ms=>new Promise(r=>setTimeout(r,ms)),timeout=15*60*1000}){
 const assets=scene.assets.filter(a=>a.asset_type!=='finish'&&a.ai_source&&!a.model_glb);
 for(const [index,a]of assets.entries()){
  if(cancelled())break;if(!a.reference_image)continue;status(`图片转 3D · ${index+1}/${assets.length} · ${a.label}`);
  try{
   let retryDownload=!!a.mesh_task_id;
   if(!a.mesh_task_id){
    if(a.mesh_submission_pending)throw Error('上次提交结果未确认，请先核对服务商任务');
    a.mesh_submission_pending=true;
    await save(scene);
    const task=await request('/api/tripo',{image:a.reference_image});
    if(!task.id)throw Error('服务未返回任务 ID');
    a.mesh_task_id=task.id;a.mesh_status='running';delete a.mesh_submission_pending;
    await save(scene);
   }
   const deadline=Date.now()+timeout;
   for(;;){
    if(cancelled())break;
    const task=await request('/api/tripo/'+encodeURIComponent(a.mesh_task_id)+(retryDownload?'?retry_download=1':''));
    retryDownload=false;
    if(task.status==='success'){
     a.model_glb=await readMeshResult(task);a.mesh_status='ready';delete a.mesh_error;a.brand='视频识别 · 图片转 3D';break;
    }
    if(['download_failed','failed','cancelled','canceled','banned','expired','unknown'].includes(task.status))throw Error(task.error||'模型未就绪，已保留简模与任务 ID');
    if(Date.now()>deadline)throw Error('模型生成尚未完成，可稍后继续查询');
    await pause(3000);
   }
  }catch(e){a.mesh_status='incomplete';a.mesh_error=e.message;}
  await save(scene);
 }
 return scene;
}
