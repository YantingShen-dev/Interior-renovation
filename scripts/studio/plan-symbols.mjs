import door from '../door_geometry.js';
import plan from '../plan_geometry.js';

// All symbols share the wall's physical faces, including legacy inner/outer references.
export function wallFrame(w, faces = []) {
 const length = Math.hypot(w.end[0]-w.start[0], w.end[1]-w.start[1]);
 const tangent = w.end.map((v,k)=>(v-w.start[k])/length), normal = plan.wallNormal(w,faces);
 const thickness = w.thickness ?? .12;
 const offset = w.reference_line==='center' ? -thickness/2 : w.reference_line==='outer' ? -thickness : 0;
 const at = (u,depth) => w.start.map((v,k)=>v+tangent[k]*u+normal[k]*(offset+depth));
 const box = (a,b,near=0,far=thickness) => [at(a,near),at(b,near),at(b,far),at(a,far)];
 return {length,thickness,at,box};
}

export function wallPlanSolids(w, openings, faces = []) {
 const f=wallFrame(w,faces), spans=[]; let cursor=0;
 const cuts=openings.filter(o=>o.wall_id===w.id).map(o=>[Math.max(0,o.u),Math.min(f.length,o.u+o.width)]).sort((a,b)=>a[0]-b[0]);
 for(const [a,b] of cuts){if(a>cursor)spans.push(f.box(cursor,a));cursor=Math.max(cursor,b);}
 if(cursor<f.length)spans.push(f.box(cursor,f.length));
 return spans;
}

export function openingPlanSymbol(w,o,faces=[]) {
 const f=wallFrame(w,faces),a=o.u,b=a+o.width,t=f.thickness,j=Math.min(.04,o.width/8,t/3);
 const symbol={hole:f.box(a,b),handles:[f.at(a,t/2),f.at(b,t/2)],frames:[f.box(a,a+j),f.box(b-j,b)],lines:[],leaves:[],arcs:[]};
 if(o.kind==='window') {
  // Frame and glazing stay inside the wall reveal at every wall thickness.
  symbol.frames.push(f.box(a+j,b-j,t*.18,t*.82));
  for(const d of [t*.42,t*.58])symbol.lines.push([f.at(a+j,d),f.at(b-j,d)]);

 } else if(o.subtype==='elevator'||o.subtype==='sliding') {
  symbol.frames.push(f.box(a+j,(a+b)/2,t*.3,t*.48),f.box((a+b)/2,b-j,t*.52,t*.7));
 } else {
  const host={...w,outward:plan.wallNormal(w,faces)};
  for(const side of o.subtype==='double_hinged'?[0,1]:[null]) {
   const p=door.pose(host,{...o,u:a+j,width:o.width-2*j},side),end=p.at(Math.PI/2),leaf=.03;
   symbol.leaves.push([p.hinge,end,end.map((v,k)=>v+p.closed[k]*leaf),p.hinge.map((v,k)=>v+p.closed[k]*leaf)]);
   symbol.arcs.push({center:p.hinge,start:p.at(0),end,radius:p.radius});
  }
 }
 return symbol;
}
