export async function readMeshResult(task,fetchModel=fetch){
 if(task.model_glb)return task.model_glb;
 if(!/^\/api\/tripo\/[a-f0-9-]{36}\/model$/.test(task.model_url||''))throw Error('任务缺少可用的 GLB 模型');
 const response=await fetchModel(task.model_url);
 if(!response.ok)throw Error('无法读取本地 GLB，可继续查询原任务');
 const blob=await response.blob();
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error||Error('无法读取 GLB 文件'));
  reader.readAsDataURL(blob);
 });
}
