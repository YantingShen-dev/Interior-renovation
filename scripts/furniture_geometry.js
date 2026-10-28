/* Furniture envelopes, parametric display meshes and layout checks. Metres, Z up. */
(function(root){
const EPS=1e-7;
const presets=[
 {id:'desk',label:'办公桌',dimensions:[1.2,.6,.75],mount:'floor',color:[.72,.53,.33,1]},
 {id:'chair',label:'办公椅',dimensions:[.55,.55,.9],mount:'floor',color:[.21,.4,.44,1]},
 {id:'sofa',label:'双人接待沙发',dimensions:[1.4,.7,.8],mount:'floor',color:[.42,.57,.5,1]},
 {id:'coffee',label:'小茶几',dimensions:[.6,.45,.45],mount:'floor',color:[.7,.57,.43,1]},
 {id:'cabinet',label:'收纳柜',dimensions:[.6,.4,1.8],mount:'floor',color:[.72,.75,.7,1]},
 {id:'camera',label:'相机与脚架占位',dimensions:[.6,.6,1.6],mount:'floor',color:[.23,.28,.32,1]},
 {id:'backdrop',label:'拍摄背景架占位',dimensions:[1.5,.4,2],mount:'floor',color:[.81,.76,.66,1]},
 {id:'shelf',label:'壁挂层架',dimensions:[.8,.25,.35],mount:'wall',color:[.61,.44,.3,1]},
 {id:'light',label:'顶装灯具',dimensions:[.6,.4,.1],mount:'ceiling',color:[.91,.84,.57,1]}
];
function asset(s,id){return [...presets,...(s.assets||[])].find(p=>p.id===id);}
function pose(s,f){
 const [w,d,h]=f.dimensions;
 if(f.mount==='wall'){
  const wall=s.walls.find(v=>v.id===f.wall_id);if(!wall)throw new Error('挂墙家具缺少墙体');
  const length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]),t=wall.end.map((v,k)=>(v-wall.start[k])/length);
  return {position:[wall.start[0]+t[0]*f.u-wall.outward[0]*d/2,wall.start[1]+t[1]*f.u-wall.outward[1]*d/2,f.position[2]],rotation_deg:Math.atan2(t[1],t[0])*180/Math.PI};
 }
 return {position:[f.position[0],f.position[1],f.mount==='ceiling'?s.room.height-h:0],rotation_deg:f.rotation_deg};
}
function rect(center,width,depth,angle){const a=angle*Math.PI/180,c=Math.cos(a),n=Math.sin(a);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+x*width/2*c-y*depth/2*n,center[1]+x*width/2*n+y*depth/2*c]);}
function footprint(s,f){const p=pose(s,f);return rect(p.position,...f.dimensions.slice(0,2),p.rotation_deg);}
function overlap(a,b){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const next=poly[(i+1)%poly.length],v=poly[i],axis=[-(next[1]-v[1]),next[0]-v[0]];
  const pa=a.map(p=>p[0]*axis[0]+p[1]*axis[1]),pb=b.map(p=>p[0]*axis[0]+p[1]*axis[1]);
  if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=EPS)return false;
 }return true;
}
function validate(s){
 const errors=[];
 if(s.furniture!==undefined&&!Array.isArray(s.furniture))return ['家具数据必须为数组'];
 if(s.assets!==undefined&&!Array.isArray(s.assets))return ['家具库数据必须为数组'];
 const assetIds=new Set(presets.map(a=>a.id));
 for(const a of s.assets||[]){
  if(typeof a.id!=='string'||assetIds.has(a.id)||!Array.isArray(a.dimensions)||a.dimensions.length!==3||!a.dimensions.every(v=>Number.isFinite(v)&&v>.02)||!['floor','wall','ceiling'].includes(a.mount))errors.push('自定义家具库条目无效或 ID 重复');
  assetIds.add(a.id);
  if(a.source_url&&!/^https:\/\//i.test(a.source_url))errors.push('商品来源链接必须采用 HTTPS');
  if(a.reference_image&&!/^data:image\/(jpeg|png|webp);base64,/i.test(a.reference_image))errors.push('家具参考图格式不支持');
 }
 for(const f of s.furniture||[]){
  if(f.kind!=='furniture'||!['floor','wall','ceiling'].includes(f.mount)||!Array.isArray(f.dimensions)||f.dimensions.length!==3||!f.dimensions.every(v=>Number.isFinite(v)&&v>.02)||!Array.isArray(f.position)||f.position.length!==3||!f.position.every(Number.isFinite)||!Number.isFinite(f.rotation_deg)){errors.push(`${f.label||f.id} 家具参数无效`);continue;}
  if(!asset(s,f.asset_id)){errors.push(`${f.label} 缺少家具库条目`);continue;}
  if(f.mount==='wall'){
   const wall=s.walls.find(w=>w.id===f.wall_id);
   if(!wall||!Number.isFinite(f.u)){errors.push(`${f.label} 缺少有效挂墙位置`);continue;}
   const length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]);
   if(f.u-f.dimensions[0]/2 < -EPS||f.u+f.dimensions[0]/2>length+EPS)errors.push(`${f.label} 超出挂墙范围`);
  }
  const p=pose(s,f),xy=footprint(s,f);
  if(xy.some(v=>v[0]<-EPS||v[1]<-EPS||v[0]>s.room.length+EPS||v[1]>s.room.width+EPS)||p.position[2]<-EPS||p.position[2]+f.dimensions[2]>s.room.height+EPS)errors.push(`${f.label} 超出房间边界`);
 }return errors;
}
function buildParts(s){
 const parts=[];
 for(const f of s.furniture||[]){
  const [w,d,h]=f.dimensions,p=pose(s,f),a=p.rotation_deg*Math.PI/180,boxes=[],preset=asset(s,f.asset_id),style=preset?.style||f.asset_id;
  function box(x,y,z,sx,sy,sz,color){if([sx,sy,sz].some(v=>v<=0))return;boxes.push({center:[p.position[0]+x*Math.cos(a)-y*Math.sin(a),p.position[1]+x*Math.sin(a)+y*Math.cos(a),p.position[2]+z],size:[sx,sy,sz],yaw:a,...(color?{color}: {})});}
  if(style==='micke'){
   box(0,0,h-.015,w,d,.03);box(-w/2+.018,0,(h-.03)/2,.036,d,h-.03);
   box(w/2-.02,0,h-.08,.04,d,.13);for(const y of [-1,1])box(w/2-.02,y*d*.43,(h-.14)/2,.025,.025,h-.14);
   box(0,d/2-.025,h-.08,w-.075,.035,.10);box(0,-d/2+.02,h-.16,w-.075,.03,.13);
  }else if(style==='ps2026_chair'){
   const wood=[.79,.66,.46,1],blue=[.08,.35,.67,1],red=[.72,.12,.1,1],black=[.09,.13,.17,1];
   box(0,0,h*46/76,w*38/45,d*35/51,.025,blue);box(0,-d*.4,h-.065,w,.035,.13,red);
   for(const x of [-1,1]){box(x*w*.43,-d*.36,h*.48,w*.07,d*.07,h*.96,wood);box(x*w*.43,d*.4,h*.29,w*.07,d*.07,h*.58,black);}
   box(0,-d*.36,h*.3,w*.9,.025,.03,wood);
  }else if(style==='trolley'){
   for(const level of [.16,.5,.9]){const z=h*level;box(0,0,z,w,d,.015);for(const x of [-1,1])box(x*(w/2-.006),0,z+.027,.012,d,.055);for(const y of [-1,1])box(0,y*(d/2-.006),z+.027,w,.012,.055);}
   for(const x of [-1,1])for(const y of [-1,1]){box(x*w*.4,y*d*.4,h*.46,.015,.015,h*.86);box(x*w*.4,y*d*.4,.025,.04,.04,.05,[.18,.2,.2,1]);}
   for(const x of [-1,1])box(x*w*.4,0,h-.008,.016,d*.9,.016);
  }else if(['desk','coffee'].includes(style)){
   const t=Math.min(.05,h*.15);box(0,0,h-t/2,w,d,t);for(const x of [-1,1])for(const y of [-1,1])box(x*w*.42,y*d*.37,(h-t)/2,Math.min(.04,w*.1),Math.min(.04,d*.1),h-t);
  }else if(style==='chair'){
   box(0,0,h*.47,w,d,.07*h);box(0,-d*.45,h*.75,w,d*.1,h*.5);for(const x of [-1,1])for(const y of [-1,1])box(x*w*.35,y*d*.35,h*.22,w*.07,d*.07,h*.44);
  }else if(style==='sofa'){
   box(0,0,h*.28,w,d,h*.55);box(0,-d*.4,h*.7,w,d*.2,h*.6);for(const x of [-1,1])box(x*w*.44,0,h*.53,w*.12,d,h*.5);
  }else if(['kallax','bookcase'].includes(style)){
   const t=.025;for(const x of [-1,1])box(x*(w-t)/2,0,h/2,t,d,h);
   const levels=style==='kallax'?Math.max(2,Math.round(h/.38)):Math.max(3,Math.round(h/.35));
   for(let i=0;i<=levels;i++)box(0,0,t/2+(h-t)*i/levels,w,d,t);
   if(style==='kallax')box(0,0,h/2,t,d,h);else box(0,-d/2+.005,h/2,w,.01,h);
  }else if(['floor_lamp','pendant','track_light','wall_light'].includes(style)){
   if(style==='floor_lamp'){box(0,0,.02,w*.6,d*.6,.04);box(0,0,h*.48,.025,.025,h*.94);box(0,0,h*.9,w,d,h*.2);}
   if(style==='pendant'){box(0,0,h*.75,.012,.012,h*.5);box(0,0,h*.25,w,d,h*.5);}
   if(style==='track_light'){box(0,0,h*.95,w,.04,h*.1);for(const x of [-.35,0,.35])box(w*x,0,h*.45,w*.17,d,h*.7);}
   if(style==='wall_light'){box(0,-d*.4,h*.5,w*.5,d*.2,h);box(0,d*.15,h*.55,w,d*.7,h*.65);}
  }else if(style==='shelf'){
   for(const z of [.06,.94])box(0,0,z*h,w,d,h*.12);for(const x of [-1,1])box(x*w*.47,0,h/2,w*.06,d,h);
  }else if(style==='camera'){
   box(0,0,h*.45,w*.07,d*.07,h*.9);box(0,0,h*.92,w*.42,d*.32,h*.16);for(const x of [-1,1])box(x*w*.23,0,h*.025,w*.54,d*.08,h*.05);box(0,d*.22,h*.025,w*.08,d*.54,h*.05);
  }else if(style==='backdrop'){
   box(0,0,h/2,w,d*.06,h);for(const x of [-1,1])box(x*w*.43,0,h*.025,w*.05,d,h*.05);
  }else box(0,0,h/2,w,d,h);
  const groups=new Map();for(const b of boxes){const color=f.material_override||b.color||f.color||preset?.color||[.57,.66,.7,1],key=color.join(',');if(!groups.has(key))groups.set(key,{color,boxes:[]});groups.get(key).boxes.push(b);}
  let group=0;for(const {color,boxes:geometry} of groups.values())parts.push({id:f.id+'_body_'+(group++),parent:f.id,color,boxes:geometry,role:'furniture'});
 }return parts;
}
function doorZones(s,clearance=.8){
 return s.openings.filter(o=>o.kind==='door').map(o=>{
  const wall=s.walls.find(w=>w.id===o.wall_id),length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]),t=wall.end.map((v,k)=>(v-wall.start[k])/length);
  const depth=Math.max(clearance,o.subtype==='elevator'?0:o.width/(o.subtype==='double_hinged'?2:1));
  const center=wall.start.map((v,k)=>v+t[k]*(o.u+o.width/2)-wall.outward[k]*depth/2);
  return {id:o.id,label:o.label,polygon:rect(center,o.width,depth,Math.atan2(t[1],t[0])*180/Math.PI),center:wall.start.map((v,k)=>v+t[k]*(o.u+o.width/2)-wall.outward[k]*(clearance/2+.08)),height:o.height,bottom:o.bottom,width:o.width};
 });
}
function pointDistance(point,polygon){
 let inside=true,min=Infinity,sign=0,area=0;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],cross=dx*(point[1]-a[1])-dy*(point[0]-a[0]);
  if(Math.abs(cross)>EPS){if(sign&&Math.sign(cross)!==sign)inside=false;sign=Math.sign(cross);}
  area+=a[0]*b[1]-b[0]*a[1];const denominator=dx*dx+dy*dy;if(denominator<1e-16)continue;
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/denominator));
  min=Math.min(min,Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy));
 }return inside&&Math.abs(area)>EPS?0:min;
}
function analyze(s,options={}){
 const clearance=Number.isFinite(options.clearance)&&options.clearance>0?options.clearance:.8,items=s.furniture||[],issues=[],zones=doorZones(s,clearance);
 const data=items.map(f=>({f,pose:pose(s,f),polygon:footprint(s,f)}));
 for(let i=0;i<data.length;i++){
  const a=data[i],bottom=a.pose.position[2],top=bottom+a.f.dimensions[2];
  for(let j=i+1;j<data.length;j++){
   const b=data[j],bb=b.pose.position[2],bt=bb+b.f.dimensions[2];
   if(Math.min(top,bt)-Math.max(bottom,bb)>EPS&&overlap(a.polygon,b.polygon))issues.push({type:'collision',ids:[a.f.id,b.f.id],message:`${a.f.label} 与 ${b.f.label} 的占用空间重叠`});
  }
  for(const zone of zones)if(top>zone.bottom&&bottom<zone.bottom+zone.height&&overlap(a.polygon,zone.polygon))issues.push({type:'door_clearance',ids:[a.f.id,zone.id],message:`${a.f.label} 进入 ${zone.label} 的门前预留区`});
  if(a.f.mount==='wall')for(const o of s.openings.filter(o=>o.wall_id===a.f.wall_id))if(Math.min(a.f.u+a.f.dimensions[0]/2,o.u+o.width)-Math.max(a.f.u-a.f.dimensions[0]/2,o.u)>EPS&&Math.min(top,o.bottom+o.height)-Math.max(bottom,o.bottom)>EPS)issues.push({type:'opening_overlap',ids:[a.f.id,o.id],message:`${a.f.label} 遮挡 ${o.label}`});
 }
 // Configuration-space grid: inflate envelopes by half the requested passage width.
 const radius=clearance/2,step=Math.max(.08,Math.max(s.room.length,s.room.width)/180),xs=[],ys=[];
 for(let x=radius+.001;x<s.room.length-radius;x+=step)xs.push(x);
 for(let y=radius+.001;y<s.room.width-radius;y+=step)ys.push(y);
 const obstacles=data.filter(a=>a.pose.position[2]<1.8&&a.pose.position[2]+a.f.dimensions[2]>.1),blocked=new Uint8Array(xs.length*ys.length),labels=new Int32Array(blocked.length);let group=0;
 for(let y=0;y<ys.length;y++)for(let x=0;x<xs.length;x++)if(obstacles.some(a=>pointDistance([xs[x],ys[y]],a.polygon)<radius-EPS))blocked[y*xs.length+x]=1;
 for(let i=0;i<blocked.length;i++)if(!blocked[i]&&!labels[i]){
  group++;const queue=[i];labels[i]=group;
  for(let k=0;k<queue.length;k++){const v=queue[k],x=v%xs.length,y=Math.floor(v/xs.length);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=xs.length||yy>=ys.length)continue;const n=yy*xs.length+xx;if(!blocked[n]&&!labels[n]){labels[n]=group;queue.push(n);}}}
 }
 const entries=zones.map(zone=>{
  let best=Infinity,label=0;
  for(let y=0;y<ys.length;y++)for(let x=0;x<xs.length;x++){
   const index=y*xs.length+x;if(!labels[index])continue;const distance=Math.hypot(xs[x]-zone.center[0],ys[y]-zone.center[1]);
   if(distance<best){best=distance;label=labels[index];}
  }
  if(best>step*2||zone.width<clearance){label=0;issues.push({type:'route',ids:[zone.id],message:`按 ${clearance.toFixed(2)} 米通行宽度，${zone.label} 附近未找到可达网格`});}
  return {id:zone.id,label,nearest_distance:best};
 });
 const active=entries.filter(e=>e.label);const connected=entries.length>0&&active.length===entries.length&&new Set(active.map(e=>e.label)).size===1;
 if(active.length>1&&new Set(active.map(e=>e.label)).size>1)issues.push({type:'route',ids:active.map(e=>e.id),message:'当前家具使部分门之间的通行区域断开'});
 return {issues,door_zones:zones,route:{connected,clearance_m:clearance,grid_step_m:step,entries,method:'2D_envelope_inflation_grid_four_neighbour',scope:'Layout estimate using current unverified door positions; not a code compliance assessment.'}};
}
const api={presets,asset,pose,rect,footprint,overlap,validate,buildParts,doorZones,pointDistance,analyze};root.RoomFurniture=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
