import plan from '../plan_geometry.js';
import furniture from '../furniture_geometry.js';
import {wallPlanSolids, openingPlanSymbol} from './plan-symbols.mjs';

// Covers are derived from scene geometry, independent of the editor camera or selection.
export function planThumbnail(scene) {
 if (!scene || scene.space_review?.empty) return undefined;
 const walls=(scene.walls||[]).filter(w=>Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1])>1e-6);
 const faces=walls.length?plan.regions(walls):(scene.room?.regions||[scene.room?.outline].filter(Boolean));
 const openings=scene.openings||[],shapes=[];
 const add=(points,fill,stroke,closed=true)=>{
  if(points?.length&&points.every(p=>p.slice(0,2).every(Number.isFinite)))shapes.push({points,fill,stroke,closed});
 };
 for(const face of faces)add(face,'#f1f4f7','none');
 for(const wall of walls)for(const polygon of wallPlanSolids(wall,openings,faces))add(polygon,'#bec8d1','#536b7d');
 for(const item of scene.furniture||[]){
  try{add(furniture.footprint(scene,item),'#dbe7f2','#8aa2b8');}catch{/* A missing legacy asset must not hide the room cover. */}
 }
 for(const opening of openings){
  const wall=walls.find(w=>w.id===opening.wall_id);if(!wall)continue;
  const symbol=openingPlanSymbol(wall,opening,faces),color=opening.kind==='window'?'#377f9f':'#536b7d';
  add(symbol.hole,'#ffffff','none');
  for(const p of symbol.frames)add(p,'#f7fafc',color);
  for(const p of symbol.leaves)add(p,'#ffffff',color);
  for(const p of symbol.lines)add(p,'none',color,false);
  for(const arc of symbol.arcs){
   const a=Math.atan2(arc.start[1]-arc.center[1],arc.start[0]-arc.center[0]);
   const b=Math.atan2(arc.end[1]-arc.center[1],arc.end[0]-arc.center[0]);
   const delta=Math.atan2(Math.sin(b-a),Math.cos(b-a));
   add(Array.from({length:25},(_,i)=>[arc.center[0]+arc.radius*Math.cos(a+delta*i/24),arc.center[1]+arc.radius*Math.sin(a+delta*i/24)]),'none',color,false);
  }
 }
 if(!shapes.length)return undefined;
 const points=shapes.flatMap(s=>s.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const width=480,height=260,padding=24,scale=Math.min((width-2*padding)/Math.max(maxX-minX,.01),(height-2*padding)/Math.max(maxY-minY,.01));
 const xy=p=>[(width/2+(p[0]-(minX+maxX)/2)*scale).toFixed(2),(height/2-(p[1]-(minY+maxY)/2)*scale).toFixed(2)].join(',');
 const body=shapes.map(s=>`<${s.closed?'polygon':'polyline'} points="${s.points.map(xy).join(' ')}" fill="${s.fill}" stroke="${s.stroke}"/>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260"><rect width="480" height="260" fill="#ffffff"/><g stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
