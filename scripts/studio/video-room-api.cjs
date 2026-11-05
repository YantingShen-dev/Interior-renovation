const fs=require('fs'),path=require('path');
function frameIndex(runs,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('任务 ID 无效');
 const directory=path.join(runs,id,'project/preparation'),file=path.join(directory,'preparation.json');
 if(!fs.existsSync(file))throw new Error('该视频尚未完成抽帧');
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 const frames=(p.sampled_frames||[]).filter(f=>/^\d{6}\.jpg$/.test(f.image)&&fs.existsSync(path.join(directory,'frames',f.image)));
 if(!frames.length)throw new Error('还没有可用视频画面');
 return {id,source:{job_id:id,sha256:p.video_sha256,duration:p.duration_seconds},frames:frames.map(f=>({image:f.image,seconds:f.seconds,url:'/api/reconstruction/'+id+'/frames/'+f.image}))};
}
function latestFrames(runs){
 const items=[];if(fs.existsSync(runs))for(const id of fs.readdirSync(runs)){try{const data=frameIndex(runs,id);items.push({data,time:fs.statSync(path.join(runs,id,'project/preparation/preparation.json')).mtimeMs});}catch{}}
 items.sort((a,b)=>b.time-a.time);if(!items.length)throw new Error('还没有已抽帧的视频，请先选择本地视频');return items[0].data;
}
function frameFile(runs,id,name){
 const index=frameIndex(runs,id);if(!index.frames.some(f=>f.image===name))throw new Error('找不到该视频画面');return path.join(runs,id,'project/preparation/frames',name);
}
module.exports={frameIndex,latestFrames,frameFile};
