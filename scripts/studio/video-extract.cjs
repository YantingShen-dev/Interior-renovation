/* CPU-only local decoding; no reconstruction or model service is invoked. */
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto'),{execFile}=require('child_process');
const runtime=require('./reconstruction-runtime.cjs');
function media(root,tool,args,signal){
 const c=runtime.config(root),file=c?'wsl.exe':tool;
 const argv=c?['-d',c.distro,'--',c.runtime+'/env/bin/'+tool,...args]:args;
 return new Promise((resolve,reject)=>execFile(file,argv,{cwd:root,windowsHide:true,timeout:120000,maxBuffer:1024*1024,signal},(error,stdout)=>{
  if(error)return reject(new Error(signal?.aborted?'已取消视频读取':error.code==='ENOENT'?'本机找不到 FFmpeg，请检查项目视频环境。':'本机视频解码失败或超时，请确认视频可完整播放后重试。'));
  resolve(stdout);
 }));
}
const inputFlags=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,avi'];
async function extract(root,bytes,extension,{signal}={}){
 if(!['mp4','mov','mkv','webm','avi','m4v'].includes(extension))throw Error('视频格式不支持');
 if(!bytes.length||bytes.length>300*1024*1024)throw Error('请选择不超过 300MB 的视频');
 const cache=path.resolve(root,'.cache/video-frames');await fs.mkdir(cache,{recursive:true});
 const directory=await fs.mkdtemp(path.join(cache,'read-')),video=path.join(directory,'input.'+extension);
 const local=p=>runtime.config(root)?runtime.linuxPath(p):p;
 try{
  await fs.writeFile(video,bytes);signal?.throwIfAborted();
  const probe=async count=>JSON.parse(await media(root,'ffprobe',['-v','error',...inputFlags,...(count?['-count_frames']:[]),'-select_streams','v:0','-show_entries','format=duration:stream=duration,avg_frame_rate,nb_read_frames','-of','json',local(video)],signal));
  let info=await probe(false),stream=info.streams?.[0];if(!stream)throw Error('文件中没有可读取的视频画面');
  let duration=Number(stream.duration)||Number(info.format?.duration);
  if(!Number.isFinite(duration)||duration<=0){info=await probe(true);stream=info.streams?.[0];const [a,b]=String(stream?.avg_frame_rate||'0/1').split('/').map(Number);duration=Number(stream?.nb_read_frames)/(a/b);}
  if(!Number.isFinite(duration)||duration<=0)throw Error('本机也无法读取视频时长，请重新导出完整视频后再试');
  const step=duration/20;
  await media(root,'ffmpeg',['-hide_banner','-loglevel','error','-nostdin',...inputFlags,'-i',local(video),'-map','0:v:0','-an','-vf',`fps=fps=${20/duration}:start_time=0:round=down,scale=960:960:force_original_aspect_ratio=decrease`,'-frames:v','20','-q:v','4',local(path.join(directory,'%06d.jpg'))],signal);
  const files=(await fs.readdir(directory)).filter(n=>/^\d{6}\.jpg$/.test(n)).sort();
  if(files.length<2)throw Error('视频有效画面不足，请选择至少含两帧的完整视频');
  const frames=[];for(const [i,name]of files.entries())frames.push({image:'decoded-'+i,seconds:i*step,url:'data:image/jpeg;base64,'+(await fs.readFile(path.join(directory,name))).toString('base64')});
  return {frames,source:{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),duration,decoder:'local-ffmpeg'}};
 }finally{
  // Only this request's generated temporary child is removed.
  if(path.dirname(path.resolve(directory))!==cache)throw Error('临时目录越界');
  await fs.rm(directory,{recursive:true,force:true});
 }
}
module.exports={extract};
