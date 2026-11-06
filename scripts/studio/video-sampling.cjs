function issue(message){const e=new Error(message);e.code='VIDEO_SAMPLING';throw e;}
function samplingOptions(input={}){
 const limit=Number(input.limit??120);if(!Number.isInteger(limit)||limit<2||limit>120)issue('抽帧上限须为 2–120 帧');
 const mode=input.mode||'count';if(!['count','interval'].includes(mode))issue('抽帧方式无效');
 if(mode==='count'){const count=Number(input.count??Math.min(20,limit));if(!Number.isInteger(count)||count<2||count>limit)issue('请设置 2–'+limit+' 帧');return {mode,count,limit};}
 const interval=Number(input.interval);if(!Number.isFinite(interval)||interval<.1||interval>3600)issue('抽帧间隔须在 0.1–3600 秒之间');return {mode,interval,limit};
}
function samplingPlan(duration,input){
 const options=samplingOptions(input);if(!Number.isFinite(duration)||duration<=0)issue('无法读取有效视频时长');
 const count=options.mode==='count'?options.count:Math.ceil((duration-1e-8)/options.interval);
 if(count<2)issue('当前间隔只能得到一帧，请缩短抽帧间隔');
 if(count>options.limit)issue('当前间隔预计产生 '+count+' 帧，最多 '+options.limit+' 帧；请把间隔调至至少 '+(Math.ceil(duration/options.limit*100)/100)+' 秒，或使用均匀抽帧');
 const step=options.mode==='interval'?options.interval:Math.max(0,duration-Math.min(.05,duration/count))/(count-1);
 const times=Array.from({length:count},(_,i)=>i*step);
 return {options,count,step,times};
}
module.exports={samplingOptions,samplingPlan};
