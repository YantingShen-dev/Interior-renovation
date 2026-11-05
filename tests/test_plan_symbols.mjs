import assert from 'node:assert/strict';
import plan from '../scripts/plan_geometry.js';
import {wallFrame,wallPlanSolids,openingPlanSymbol} from '../scripts/studio/plan-symbols.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
let cases=0;
for(const end of [[5,0],[0,5],[3,4],[-3,-4]])for(const reference_line of ['inner','center','outer'])for(const thickness of [.05,.12,.24,.6]){
 const w={id:'wall',start:[0,0],end,thickness,reference_line},f=wallFrame(w);
 const door={wall_id:w.id,u:.5,width:.9,kind:'door'},window={wall_id:w.id,u:2,width:1.2,kind:'window'};
 assert.deepEqual(f.box(0,5),plan.wallFootprint(w));
 const solids=wallPlanSolids(w,[window,door]);assert.equal(solids.length,3);
 const area=solids.reduce((sum,p)=>sum+Math.abs(plan.area(p)),0);near(area,(5-.9-1.2)*thickness);
 const local=p=>{const d=p.map((v,k)=>v-f.at(0,0)[k]),n=plan.wallNormal(w);return [d.reduce((s,v,k)=>s+v*end[k]/5,0),d.reduce((s,v,k)=>s+v*n[k],0)];};
 for(const polygon of solids){const us=polygon.map(p=>local(p)[0]);for(const o of [door,window])assert.ok(Math.max(...us)<=o.u+1e-8||Math.min(...us)>=o.u+o.width-1e-8);}
 for(const o of [door,window]){
  const symbol=openingPlanSymbol(w,o);
  assert.deepEqual(symbol.hole,f.box(o.u,o.u+o.width));
  for(const p of symbol.frames.flat().concat(symbol.lines.flat())){const [u,d]=local(p);assert.ok(u>=o.u-1e-8&&u<=o.u+o.width+1e-8);assert.ok(d>=-1e-8&&d<=thickness+1e-8);}
  for(const arc of symbol.arcs){near(Math.hypot(...arc.start.map((v,k)=>v-arc.center[k])),arc.radius);near(Math.hypot(...arc.end.map((v,k)=>v-arc.center[k])),arc.radius);assert.ok(local(arc.end)[1]<0);}
 }
 cases++;
}
const walls=[[0,0],[5,0],[5,4],[0,4]].map((p,i,a)=>({id:String(i),start:p,end:a[(i+1)%4],thickness:.24,reference_line:'center'})),faces=plan.regions(walls);
for(const wall of walls){const o={u:1,width:1,kind:'door'},s=openingPlanSymbol(wall,o,faces);assert.ok(plan.contains(s.arcs[0].end,faces[0]));}
const w=walls[0];assert.equal(openingPlanSymbol(w,{u:1,width:1.8,kind:'door',subtype:'double_hinged'}).arcs.length,2);
assert.equal(openingPlanSymbol(w,{u:1,width:1.8,kind:'door',subtype:'elevator'}).arcs.length,0);
assert.equal(wallPlanSolids(w,[{wall_id:w.id,u:0,width:5}]).length,0);
console.log(`PASS ${cases} orientation/reference/thickness combinations; room-facing swings, double/sliding doors, full-width opening`);
