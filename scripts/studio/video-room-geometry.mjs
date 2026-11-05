import plan from '../plan_geometry.js';
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
export function wallProjection(photoCorners,length,height){
 if(!Array.isArray(photoCorners)||photoCorners.length!==4||!photoCorners.every(finitePoint))throw new Error('请依次标记墙面的四个角');
 if(!Number.isFinite(length)||!Number.isFinite(height)||length<.1||height<2)throw new Error('请先填写实际墙长和层高');
 const turns=photoCorners.map((p,i)=>cross(p,photoCorners[(i+1)%4],photoCorners[(i+2)%4]));
 if(Math.abs(plan.area(photoCorners))<.003||!turns.every(v=>v>1e-5)&&!turns.every(v=>v< -1e-5))throw new Error('四角不能交叉或挤在一条线上，请按地脚 A → 地脚 B → 顶角 B → 顶角 A 标记');
 const target=[[0,0],[length,0],[length,height],[0,height]],rows=[];
 photoCorners.forEach(([x,y],i)=>{const [u,v]=target[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 for(let k=0;k<8;k++){let pivot=k;for(let j=k+1;j<8;j++)if(Math.abs(rows[j][k])>Math.abs(rows[pivot][k]))pivot=j;[rows[k],rows[pivot]]=[rows[pivot],rows[k]];if(Math.abs(rows[k][k])<1e-10)throw new Error('墙面透视过于极端，请换一张更正面的画面');const d=rows[k][k];for(let j=k;j<=8;j++)rows[k][j]/=d;for(let i=0;i<8;i++)if(i!==k){const f=rows[i][k];for(let j=k;j<=8;j++)rows[i][j]-=f*rows[k][j];}}
 return [...rows.map(r=>r[8]),1];
}
export function projectPhoto(h,[x,y]){const d=h[6]*x+h[7]*y+1;if(Math.abs(d)<1e-8)throw new Error('标注超出可用投影范围');return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
export function openingFromPhoto({corners,wall,points,kind,id,existing=[]}){
 if(!['door','window'].includes(kind)||points.length!==2||!points.every(finitePoint))throw new Error('请选择门或窗，并标记两个对角');
 if(!points.every(p=>plan.contains(p,corners)))throw new Error('门窗必须位于已标定的墙面内');
 const length=Math.hypot(...wall.end.map((v,k)=>v-wall.start[k])),h=wallProjection(corners,length,wall.height),p=points.map(q=>projectPhoto(h,q));
 const u=Math.min(p[0][0],p[1][0]),right=Math.max(p[0][0],p[1][0]),bottom=kind==='door'?0:Math.min(p[0][1],p[1][1]),top=Math.max(p[0][1],p[1][1]);
 if(right-u<.1||top-bottom<.1||u<-.02||right>length+.02||bottom<-.02||top>wall.height+.02)throw new Error('门窗尺寸无效，请重新标记两个对角');
 const o={id,kind,wall_id:wall.id,u:Math.max(0,u),width:Math.min(length,right)-Math.max(0,u),bottom:Math.max(0,bottom),height:Math.min(wall.height,top)-Math.max(0,bottom),status:'photo_estimated',label:(kind==='door'?'门':'窗')+' · 视频标注',door_direction:'start-in'};
 if(existing.some(a=>a.wall_id===o.wall_id&&o.u<a.u+a.width-.001&&o.u+o.width>a.u+.001&&o.bottom<a.bottom+a.height-.001&&o.bottom+o.height>a.bottom+.001))throw new Error('此处与已有门窗重叠，请先移除或调整原门窗');
 return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='number'?Math.round(v*1000)/1000:v]));
}
export function rectangularDraft(length,width,height){
 if(![length,width].every(v=>Number.isFinite(v)&&v>=.5&&v<=100))throw new Error('请填写 0.5–100 米的实测长和宽');
 const scene=plan.createScene([[0,0],[length,0],[length,width],[0,width]],height);
 scene.room.dimension_source='user_measured';scene.provenance.model_type='video_assisted_measured_room';
 scene.space_review={...scene.space_review,accepted:false,empty:false};return scene;
}
export function attachVideoEvidence(scene,source,annotations){
 const next=structuredClone(scene);next.video_assistance={version:1,geometry_signature:wallSignature(scene),source:structuredClone(source),annotations:structuredClone(annotations)};
 next.provenance={...next.provenance,source_video_sha256:source.sha256,model_type:'video_assisted_measured_room',auto_extraction_claim:false,scan_overlay_registered:false};
 next.space_review={...next.space_review,accepted:false,empty:false,video_assisted:true};
 delete next.space_review.pending_job;delete next.drawing_state;
 return next;
}
export function wallSignature(scene){return JSON.stringify(scene.walls.map(w=>[w.id,w.start,w.end,w.height]));}
