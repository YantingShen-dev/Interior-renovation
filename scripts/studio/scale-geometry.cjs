const {scaleScene}=require('./modeling-tools.cjs');
function scaleAround(scene,base,factor){
 if(!Array.isArray(base)||base.length!==2||!base.every(Number.isFinite))throw Error('请在地面平面指定缩放基点');
 if(!scene.walls.length)throw Error('请先建立空间');
 const wall=scene.walls[0],length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]);
 const next=scaleScene(scene,wall.id,length*factor),offset=base.map(v=>v*(1-factor));
 const point=p=>p.map((v,k)=>v+(offset[k]||0));
 for(const w of next.walls){w.start=point(w.start);w.end=point(w.end);}
 if(next.room.outline)next.room.outline=next.room.outline.map(point);
 if(next.room.regions)next.room.regions=next.room.regions.map(r=>r.map(point));
 for(const f of next.furniture)f.position=point(f.position);
 next.observed_furniture=structuredClone(next.furniture);
 next.room.origin=[0,1].map(k=>Math.min(...next.walls.flatMap(w=>[w.start[k],w.end[k]])));
 next.reference_scale={...next.reference_scale,method:'base_reference_target',base:[...base],note:'基点保持不动；尺寸等比推算，原仓库资产不变'};
 return next;
}
module.exports={scaleAround};
