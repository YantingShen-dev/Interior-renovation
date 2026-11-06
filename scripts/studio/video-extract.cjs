/* CPU-only local decoding; no reconstruction or model service is invoked. */
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto'),{execFile}=require('child_process');
const {resolveMedia}=require('./media-runtime.cjs');
const {samplingPlan}=require('./video-sampling.cjs');
function media(root,command,args,signal){
 return new Promise((resolve,reject)=>execFile(command.file,[...command.prefix,...args],{cwd:root,windowsHide:true,timeout:120000,maxBuffer:1024*1024,signal},(error,stdout)=>{
  if(error)return reject(new Error(signal?.aborted?'已取消视频读取':error.code==='ENOENT'?'视频解码程序不存在，请检查项目 FFmpeg 环境。':'本机视频解码失败或超时，请确认视频可完整播放后重试。'));
  resolve(stdout);
 }));
}
const inputFlags=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,avi'];
async function extract(root,bytes,extension,{signal,sampling,env=process.env}={}){
 if(!['mp4','mov','mkv','webm','avi','m4v'].includes(extension))throw Error('视频格式不支持');
 if(!bytes.length||bytes.length>300*1024*1024)throw Error('请选择不超过 300MB 的视频');
 const tools=resolveMedia(root,{env}),cache=path.resolve(root,'.cache/video-frames');await fs.mkdir(cache,{recursive:true});
 const directory=await fs.mkdtemp(path.join(cache,'read-')),video=path.join(directory,'input.'+extension);
 try{
  await fs.writeFile(video,bytes);signal?.throwIfAborted();
  let duration;
  if(tools.ffprobe){
   const probe=async count=>JSON.parse(await media(root,tools.ffprobe,['-v','error',...inputFlags,...(count?['-count_frames']:[]),'-select_streams','v:0','-show_entries','format=duration:stream=duration,avg_frame_rate,nb_read_frames','-of','json',video],signal));
   let info=await probe(false),stream=info.streams?.[0];if(!stream)throw Error('文件中没有可读取的视频画面');
   duration=Number(stream.duration)||Number(info.format?.duration);
   if(!Number.isFinite(duration)||duration<=0){info=await probe(true);stream=info.streams?.[0];const [a,b]=String(stream?.avg_frame_rate||'0/1').split('/').map(Number);duration=Number(stream?.nb_read_frames)/(a/b);}
  }else{
   // Decode presentation timestamps; packet-copy DTS can underestimate B-frame video.
   const progress=await media(root,tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...inputFlags,'-i',video,'-map','0:v:0','-an','-sn','-dn','-f','null','-progress','pipe:1','-nostats','-'],signal);
   const times=[...progress.matchAll(/^out_time_us=(\d+)\s*$/gm)].map(m=>Number(m[1])/1e6);duration=Math.max(0,...times);
  }
  if(!Number.isFinite(duration)||duration<=0)throw Error('本机也无法读取视频时长，请重新导出完整视频后再试');
  const plan=samplingPlan(duration,sampling),step=plan.step;
  await media(root,tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...inputFlags,'-i',video,'-map','0:v:0','-an','-vf',`fps=fps=${1/step}:start_time=0:round=up:eof_action=pass,scale=960:960:force_original_aspect_ratio=decrease`,'-frames:v',String(plan.count),'-q:v','4',path.join(directory,'%06d.jpg')],signal);
  const files=(await fs.readdir(directory)).filter(n=>/^\d{6}\.jpg$/.test(n)).sort();
  if(files.length<2)throw Error('视频有效画面不足，请选择至少含两帧的完整视频');
  const frames=[];for(const [i,name]of files.entries())frames.push({image:'decoded-'+i+'-'+Math.round(i*step*1000),seconds:i*step,url:'data:image/jpeg;base64,'+(await fs.readFile(path.join(directory,name))).toString('base64')});
  return {frames,source:{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),duration,decoder:'local-ffmpeg',sampling:{...plan.options,actual_count:frames.length,interval_seconds:step}}};
 }finally{
  // Only this request's generated temporary child is removed.
  if(path.dirname(path.resolve(directory))!==cache)throw Error('临时目录越界');
  await fs.rm(directory,{recursive:true,force:true});
 }
}
module.exports={extract};
