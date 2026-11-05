/* Wall networks and floor regions shared by drawing, geometry and placement. */
(function(root){
const EPS=1e-7;
const area=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
function boundaryDistance(p,poly){return Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}));}
function contains(p,poly){if(boundaryDistance(p,poly)<EPS)return true;let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function intersect(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const on=(p,q,r)=>Math.abs(cross(p,q,r))<EPS&&r[0]>=Math.min(p[0],q[0])-EPS&&r[0]<=Math.max(p[0],q[0])+EPS&&r[1]>=Math.min(p[1],q[1])-EPS&&r[1]<=Math.max(p[1],q[1])+EPS;return cross(a,b,c)*cross(a,b,d)<-EPS&&cross(c,d,a)*cross(c,d,b)<-EPS||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
function validate(poly){
 if(!Array.isArray(poly)||poly.length<3||poly.length>500||poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw new Error('地面轮廓需要 3–500 个有效拐点');
 if(Math.abs(area(poly))<.25)throw new Error('房间面积至少为 0.25㎡');
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<.1)throw new Error('每段墙至少长 10cm');for(let j=i+1;j<poly.length;j++){if(j===i+1||i===0&&j===poly.length-1)continue;if(intersect(a,b,poly[j],poly[(j+1)%poly.length]))throw new Error('地面轮廓不能交叉或重叠：边 '+i+' '+JSON.stringify([a,b])+' 与边 '+j+' '+JSON.stringify([poly[j],poly[(j+1)%poly.length]])+' 相交。按边界顺序排列拐点，末点会自动连接首点；不要沿已走过的边折返。');}}
 return poly;
}
function insideRegions(footprint,polys){
 const inside=p=>polys.some(poly=>contains(p,poly));if(!footprint.every(inside))return false;
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length],r=b.map((v,k)=>v-a[k]),ts=[0,1];for(const poly of polys)for(let j=0;j<poly.length;j++){const c=poly[j],d=poly[(j+1)%poly.length],s=d.map((v,k)=>v-c[k]),ca=c.map((v,k)=>v-a[k]),den=cross(r,s);if(Math.abs(den)>EPS){const t=cross(ca,s)/den,u=cross(ca,r)/den;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}}ts.sort((a,b)=>a-b);for(let j=1;j<ts.length;j++){const t=(ts[j]+ts[j-1])/2;if(!inside(a.map((v,k)=>v+r[k]*t)))return false;}}
 return true;
}
function insideFootprint(footprint,poly){
 if(!footprint.every(p=>contains(p,poly)))return false;
 // Split each furniture edge at every room vertex coordinate. This catches a
 // rotated rectangle bridging a concave notch even if all four corners fit.
 for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length],ts=[0,1];for(const p of poly)for(const k of [0,1])if(Math.abs(b[k]-a[k])>EPS){const t=(p[k]-a[k])/(b[k]-a[k]);if(t>0&&t<1)ts.push(t);}ts.sort((x,y)=>x-y);for(let j=1;j<ts.length;j++){const t=(ts[j]+ts[j-1])/2;if(!contains([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],poly))return false;}}
 return true;
}
function floorBoxes(poly,z){const xs=[...new Set(poly.map(p=>p[0]))].sort((a,b)=>a-b),ys=[...new Set(poly.map(p=>p[1]))].sort((a,b)=>a-b),boxes=[];for(let x=1;x<xs.length;x++)for(let y=1;y<ys.length;y++){const cx=(xs[x]+xs[x-1])/2,cy=(ys[y]+ys[y-1])/2;if(contains([cx,cy],poly))boxes.push({center:[cx,cy,z],size:[xs[x]-xs[x-1],ys[y]-ys[y-1],.05],yaw:0});}return boxes;}
function createScene(points,height=2.8,openings=[],assets=[]){
 validate(points);if(!Number.isFinite(height)||height<2||height>8)throw new Error('层高请输入 2–8 米');
 const min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),poly=points.map(p=>p.map((v,k)=>Math.round((v-min[k])*1000)/1000)),ccw=area(poly)>0;
 const length=Math.max(...poly.map(p=>p[0])),width=Math.max(...poly.map(p=>p[1]));if(length>1000||width>1000)throw new Error('单个空间长宽请控制在 1000 米内');
 const walls=poly.map((start,i)=>{const end=poly[(i+1)%poly.length],L=Math.hypot(end[0]-start[0],end[1]-start[1]),dx=(end[0]-start[0])/L,dy=(end[1]-start[1])/L;return {id:'draw_wall_'+i,label:'墙 '+(i+1),kind:'wall',start,end,outward:ccw?[dy,-dx]:[-dy,dx],height,thickness:.12,status:'user_drawn'};});
 return {schema_version:'room-pilot-1',units:'meter',coordinate_system:'RH_Z_UP',room:{length,width,height,outline:poly,dimension_source:'user_drawn',height_confirmed:true},walls,openings:structuredClone(openings),assets:structuredClone(assets),furniture:[],layout_settings:{clearance_m:.8},provenance:{source_video_sha256:'drawn-'+Date.now(),model_type:'user_drawn_outline'},space_review:{accepted:true,notes:[],existing_furniture:[]}};
}
// Split crossings for face discovery only. Original wall IDs stay stable for openings.
function regions(walls){
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>a.map((v,k)=>v-b[k]),key=p=>p.map(v=>Math.round(v*10000)).join(','),nodes=new Map();
 const add=(a,b)=>{const ka=key(a),kb=key(b);if(ka===kb)return;for(const [k,p,q]of [[ka,a,kb],[kb,b,ka]]){if(!nodes.has(k))nodes.set(k,{p,links:new Set()});nodes.get(k).links.add(q);}};
 for(const w of walls){const a=w.start,r=sub(w.end,a),rr=r[0]**2+r[1]**2,ts=[0,1];for(const other of walls){const c=other.start,s=sub(other.end,c),ca=sub(c,a),d=cross(r,s);if(Math.abs(d)>EPS){const t=cross(ca,s)/d,u=cross(ca,r)/d;if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS)ts.push(t);}else if(Math.abs(cross(ca,r))<EPS)for(const p of [c,other.end]){const t=sub(p,a).reduce((n,v,k)=>n+v*r[k],0)/rr;if(t>EPS&&t<1-EPS)ts.push(t);}}ts.sort((a,b)=>a-b);for(let i=1;i<ts.length;i++)add(a.map((v,k)=>v+r[k]*ts[i-1]),a.map((v,k)=>v+r[k]*ts[i]));}
 for(const n of nodes.values())n.links=[...n.links].sort((a,b)=>{const p=nodes.get(a).p,q=nodes.get(b).p;return Math.atan2(p[1]-n.p[1],p[0]-n.p[0])-Math.atan2(q[1]-n.p[1],q[0]-n.p[0]);});
 const visited=new Set(),result=[];
 for(const [a,n]of nodes)for(const b of n.links){let from=a,to=b,loop=[];if(visited.has(a+'>'+b))continue;while(!visited.has(from+'>'+to)){visited.add(from+'>'+to);loop.push(nodes.get(from).p);const next=nodes.get(to),i=next.links.indexOf(from),end=next.links[(i+next.links.length-1)%next.links.length];from=to;to=end;}
  // Remove dangling partitions from the face walk, then redundant straight vertices.
  let changed=true;while(changed&&loop.length>2){changed=false;for(let i=0;i<loop.length;i++){const p=loop[(i+loop.length-1)%loop.length],q=loop[i],r=loop[(i+1)%loop.length];if(key(p)===key(r)||Math.abs(cross(sub(q,p),sub(r,q)))<EPS){loop.splice(i,1);changed=true;break;}}}
  if(loop.length>=3&&area(loop)>=.25){try{validate(loop);result.push(loop);}catch{}}
 }
 return result;
}
function wallNormal(w,faces=[]){const L=Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]),n=[(w.end[1]-w.start[1])/L,-(w.end[0]-w.start[0])/L],mid=w.start.map((v,k)=>(v+w.end[k])/2),inside=s=>faces.some(p=>contains(mid.map((v,k)=>v+s*n[k]*.02),p));return inside(1)&&!inside(-1)?n.map(v=>-v):n;}
function wallFootprint(w,faces=[]){const n=wallNormal(w,faces),t=w.thickness??.12,offset=w.reference_line==='center'?-t/2:w.reference_line==='outer'?-t:0,at=(p,d)=>p.map((v,k)=>v+n[k]*d);return [at(w.start,offset),at(w.end,offset),at(w.end,offset+t),at(w.start,offset+t)];}
function createWallScene(segments,height=2.8,openings=[],assets=[],options={}){
 if(!Array.isArray(segments)||!segments.length||segments.length>500)throw new Error('请绘制 1–500 段墙');
 const ids=new Set();for(const w of segments){if(!w.id||ids.has(w.id)||![w.start,w.end].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1])<.1)throw new Error('墙段需要唯一编号和至少 10cm 的有效长度');ids.add(w.id);}
 const pts=segments.flatMap(w=>[w.start,w.end]),min=[0,1].map(k=>Math.min(...pts.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...pts.map(p=>p[k]))),span=max.map((v,k)=>Math.max(.5,v-min[k]));
 const scene=createScene([[0,0],[span[0],0],span,[0,span[1]]],height,openings,assets);
 scene.walls=segments.map(w=>{const start=w.start.map((v,k)=>v-(options.preserveOrigin?0:min[k])),end=w.end.map((v,k)=>v-(options.preserveOrigin?0:min[k])),L=Math.hypot(end[0]-start[0],end[1]-start[1]);return {...structuredClone(w),id:w.id,label:w.label||'墙',kind:'wall',start,end,outward:[(end[1]-start[1])/L,-(end[0]-start[0])/L],height,thickness:w.thickness??.12,reference_line:w.reference_line||'inner',status:'user_drawn'};});
 if(options.preserveOrigin)scene.room.origin=[...min];
 const faces=regions(scene.walls);delete scene.room.outline;scene.room.regions=faces;scene.room.floor_mode=faces.length?'regions':'extent';scene.provenance.model_type='user_drawn_walls';
 // Boundary walls point outward; interior partitions stay visible in cutaway views.
 for(const w of scene.walls){const mid=w.start.map((v,k)=>(v+w.end[k])/2),inside=sign=>faces.some(p=>contains(mid.map((v,k)=>v+sign*w.outward[k]*.02),p)),left=inside(-1),right=inside(1);if(right&&!left)w.outward=w.outward.map(v=>-v);w.interior=left===right;}
 return scene;
}
function triangulate(poly){const p=area(poly)>0?[...poly]:[...poly].reverse(),out=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);while(p.length>3){let found=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(cross(a,b,c)<=EPS)continue;if(p.some(q=>q!==a&&q!==b&&q!==c&&cross(a,b,q)>=-EPS&&cross(b,c,q)>=-EPS&&cross(c,a,q)>=-EPS))continue;out.push([a,b,c]);p.splice(i,1);found=true;break;}if(!found)throw new Error('地面轮廓无法三角化');}out.push(p);return out;}
function floorGeometry(poly,z){if(poly.every((p,i)=>Math.abs(p[0]-poly[(i+1)%poly.length][0])<EPS||Math.abs(p[1]-poly[(i+1)%poly.length][1])<EPS))return floorBoxes(poly,z);return triangulate(poly).map(t=>({center:[0,0,0],size:[0,0,0],yaw:0,vertices:[...t,t[2]].map(p=>[...p,z-.025]).concat([...t,t[2]].map(p=>[...p,z+.025]))}));}
const api={area,contains,boundaryDistance,validate,insideFootprint,insideRegions,floorBoxes,floorGeometry,triangulate,regions,createScene,createWallScene,wallNormal,wallFootprint,intersect};root.RoomPlan=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
