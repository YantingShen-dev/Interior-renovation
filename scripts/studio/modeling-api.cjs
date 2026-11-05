const crypto=require('crypto'),fs=require('fs'),path=require('path');
const {ModelingSession}=require('./modeling-tools.cjs'),vision=require('./vision-modeling.cjs');
const {draftFor}=require('./modeling-draft.cjs');
function createAPI({root,env,body,provider}){
 const jobs=new Map(),sessions=new Map(),directory=path.join(root,'.cache/ai-modeling');
 const publicJob=job=>({id:job.id,status:job.status,message:job.message,source:job.source,mode:job.mode,events:job.events,plan:job.plan,diagnostics:job.diagnostics||[],checkpoint:job.checkpoint,scene:job.scene});
 const persist=job=>{const file=path.join(directory,job.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(publicJob(job),null,2));fs.renameSync(file+'.tmp',file);};

 return async(req,res,url)=>{
  const route=url.pathname;if(route!=='/mcp'&&!route.startsWith('/api/ai-modeling'))return false;
  const json=(v,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(v));return true;};
  if(route==='/mcp'){
   if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'});res.end();return true;}
   const m=JSON.parse((await body(req,2*1024*1024)).toString());let id=req.headers['mcp-session-id'];
   for(const [key,s]of sessions)if(Date.now()-s.touched>3600000)sessions.delete(key);
   let session=sessions.get(id);
   if(m.method==='initialize'){if(sessions.size>=20)throw Error('MCP 会话过多，请稍后再试');id=crypto.randomUUID();session={model:new ModelingSession(),touched:Date.now()};sessions.set(id,session);}
   if(!session)return json({error:'MCP session expired; initialize first'},404);
   session.touched=Date.now();const result=session.model.rpc(m);if(!result){res.writeHead(202);res.end();return true;}
   return json(result,200,{'Mcp-Session-Id':id});
  }
  if(route==='/api/ai-modeling/config'&&req.method==='GET'){const c=vision.config(env());return json({configured:!!(c.base&&c.model&&c.key)&&!require('./provider-catalog.cjs').visionModelIssue(c.model),base:c.base||'',model:c.model||'',issue:require('./provider-catalog.cjs').visionModelIssue(c.model)});}
  if(route==='/api/ai-modeling/latest-draft'&&req.method==='GET'){
   const files=fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(file=>({file,time:fs.statSync(path.join(directory,file)).mtimeMs})).sort((a,b)=>b.time-a.time):[];
   for(const {file}of files){try{const job=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));if(job.status==='running'&&!jobs.has(job.id)){job.status='failed';job.message='服务中断；草稿尚未完成';}const draft=draftFor(job);if(draft)return json({id:job.id,draft,plan:job.plan,events:job.events,message:job.message});}catch{}}
   return json({draft:null});
  }
  if(route==='/api/ai-modeling'&&req.method==='POST'){
   if([...jobs.values()].some(j=>j.status==='running'))throw Error('已有自动建模任务在执行');
   const c=vision.config(env());if(!c.base||!c.model||!c.key)throw Error('请在首页「配置服务 → 视觉与对话模型」完成配置');
   const data=JSON.parse((await body(req,30*1024*1024)).toString());
   if(data.mode==='mesh'&&!env().TRIPO_API_KEY)throw Error('精细网格模式需要先配置图片转 3D 服务，或选择组合简模');
   for(const [oldID,old]of jobs)if(old.status!=='running'&&jobs.size>=20)jobs.delete(oldID);
   const id=crypto.randomUUID(),controller=new AbortController(),job={id,status:'running',message:'准备视觉检查…',events:[],diagnostics:[],controller,source:{name:String(data.source?.name||'视频').slice(0,160),sha256:String(data.source?.sha256||'').slice(0,80)},mode:data.mode};jobs.set(id,job);
   fs.mkdirSync(directory,{recursive:true});
   persist(job);
   const jobEnv=env(),safe=message=>String(message).split(jobEnv.CHAT_API_KEY).join('[密钥已隐藏]');
   vision.run(data,jobEnv,provider,message=>{job.message=safe(message);job.events.push(job.message);if(job.events.length>200)job.events.shift();persist(job);},controller.signal,event=>{
    const {checkpoint,...detail}=event;job.diagnostics.push(detail);if(event.plan)job.plan=event.plan;if(checkpoint)job.checkpoint=structuredClone(checkpoint);persist(job);
   }).then(result=>{
    if(controller.signal.aborted)return;Object.assign(job,{status:'ready',message:'房间和家具已自动建立，尺寸暂估',scene:result.scene});persist(job);
   }).catch(e=>{job.status=controller.signal.aborted?'cancelled':'failed';job.message=safe(e.message);job.events.push(job.message);persist(job);});
   return json({id});
  }
  const match=route.match(/^\/api\/ai-modeling\/([a-f0-9-]{36})(\/diagnostics)?$/);
  if(match){let job=jobs.get(match[1]);if(!job&&req.method==='GET'){const file=path.join(directory,match[1]+'.json');if(fs.existsSync(file)){job=JSON.parse(fs.readFileSync(file,'utf8'));if(job.status==='running'){job.status='failed';job.message='服务重启中断任务；已保留诊断和最后有效草稿';}}}if(!job)throw Error('找不到自动建模任务');
   if(req.method==='DELETE'){job.controller?.abort();job.status='cancelled';job.message='已取消，未修改房间';persist(job);return json({status:job.status});}
   if(req.method==='GET'){if(match[2])return json(publicJob(job),200,{'Content-Disposition':'attachment; filename="modeling-'+job.id+'.json"'});return json({id:job.id,status:job.status,message:job.message,events:job.events,plan:job.plan,scene:job.scene,draft:draftFor(job)});}
  }
  return json({error:'Not found'},404);
 };
}
module.exports={createAPI};
