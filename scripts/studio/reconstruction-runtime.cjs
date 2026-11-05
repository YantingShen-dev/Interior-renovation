/* Project-local runtime selection. WSL arguments never pass through a shell. */
const fs=require('fs'),path=require('path'),{execFile}=require('child_process');
function linuxPath(value){
 const absolute=path.win32.resolve(value),match=/^([a-z]):\\(.*)$/i.exec(absolute);
 if(!match)throw new Error('WSL 重建需要本机磁盘路径');
 return '/mnt/'+match[1].toLowerCase()+'/'+match[2].replace(/\\/g,'/');
}
function config(root){
 const file=path.join(root,'planargs.local.json');
 if(!fs.existsSync(file))return null;
 const c=JSON.parse(fs.readFileSync(file,'utf8'));
 if(c.backend!=='wsl-planargs'||!/^[-\w.]+$/.test(c.distro)||!/^\/[\w/.-]+$/.test(c.runtime))throw new Error('planargs.local.json 中的重建环境配置无效');
 return c;
}
function command(root,script,args=[]){
 const c=config(root);if(!c)throw new Error('尚未配置 PlanarGS，请参阅 scripts/planargs/README.md');
 return {file:'wsl.exe',args:['-d',c.distro,'--','env','PLANARGS_RUNTIME='+c.runtime,'bash',linuxPath(path.join(root,'scripts/planargs/launch.sh')),linuxPath(path.join(root,'scripts/planargs',script)),...args],options:{cwd:root,windowsHide:true}};
}
let cached=null,inflight=null;
async function status(root,{fresh=false}={}){
 const c=config(root);
 if(!c)return {ready:false,backend:'unconfigured',message:'未配置本机 PlanarGS 环境，请参阅 scripts/planargs/README.md'};
 if(!fresh&&cached&&cached.root===root&&Date.now()-cached.time<30000)return cached.value;
 if(inflight)return inflight;
 inflight=(async()=>{
  const output=path.join(root,'.cache/planargs-setup/server-preflight.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const cmd=command(root,'preflight.py',['--repo',linuxPath(path.resolve(root,'../PlanarGS')),'--checkpoints',c.runtime+'/checkpoints','--output',linuxPath(output)]);
  // Remove the old diagnostic so a failed WSL launch cannot look ready.
  if(fs.existsSync(output))fs.unlinkSync(output);
  const error=await new Promise(resolve=>execFile(cmd.file,cmd.args,{...cmd.options,timeout:90000,maxBuffer:1024*1024},err=>resolve(err)));
  let report={};try{report=JSON.parse(fs.readFileSync(output,'utf8'));}catch{}
  const missing=Object.entries(report.checks||{}).filter(([,v])=>!v.ok).map(([k])=>k);
  const ready=!error&&report.ready===true;
  const value={backend:c.backend,ready,gpu:report.gpu,missing,message:ready?'本机 PlanarGS 环境就绪；视频将在本机处理。':missing.length?'PlanarGS 尚缺：'+missing.join('、')+'。部署说明：scripts/planargs/README.md':'WSL 重建环境未能启动，请检查 Ubuntu 和项目部署说明。'};
  cached={root,time:Date.now(),value};return value;
 })();
 try{return await inflight;}finally{inflight=null;}
}
function worker(root,video,project){return command(root,'web_pipeline.py',['--video',linuxPath(video),'--project',linuxPath(project)]);}
module.exports={linuxPath,config,command,status,worker};
