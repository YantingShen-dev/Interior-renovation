import assert from 'node:assert/strict';
import D from '../scripts/door_geometry.js';
import G from '../scripts/room_geometry.js';
import F from '../scripts/furniture_geometry.js';
import plan from '../scripts/plan_geometry.js';
import {openingPlanSymbol} from '../scripts/studio/plan-symbols.mjs';
for(const end of [[5,0],[0,5],[3,4],[-3,-4]])for(const reference_line of ['inner','center','outer'])for(const direction of D.directions){
 const scene=plan.createWallScene([{id:'w',start:[0,0],end,reference_line,thickness:.24}]);
 const w=scene.walls[0],o={id:'d',label:'Door',wall_id:'w',kind:'door',subtype:'hinged',u:1,width:.9,height:2.1,bottom:0,door_direction:direction,open_angle_deg:90};scene.openings=[o];
 const p=D.pose(w,o),panel=G.buildParts(scene).find(p=>p.id==='d_panel').boxes[0],target=p.at(Math.PI/2);
 for(let k=0;k<2;k++)assert.ok(Math.abs(panel.center[k]-(p.hinge[k]+target[k])/2)<1e-8);
 const symbol=openingPlanSymbol(w,o),arc=symbol.arcs[0];assert.ok((arc.end[0]-arc.center[0])*p.swing[0]+(arc.end[1]-arc.center[1])*p.swing[1]>0);
 const zone=F.doorZones(scene)[0].polygon;assert.deepEqual(zone,D.sector(w,o));
 const near=p.hinge.map((v,k)=>v+.3*p.closed[k]+.3*p.swing[k]),far=p.hinge.map((v,k)=>v+.3*p.closed[k]-.3*p.swing[k]);
 assert.ok(F.overlap(F.rect(near,.1,.1,0),zone));assert.ok(!F.overlap(F.rect(far,.1,.1,0),zone));
 assert.equal(JSON.parse(JSON.stringify(scene)).openings[0].door_direction,direction);
}
const scene=plan.createScene([[0,0],[5,0],[5,4],[0,4]],2.8);scene.openings=[{id:'win',kind:'window',wall_id:scene.walls[0].id,u:1,width:1.2,height:1.2,bottom:.9}];
const parts=G.buildParts(scene).filter(p=>p.parent==='win');assert.deepEqual(parts.map(p=>p.role),['window_frame','glass']);assert.equal(parts[0].boxes.length,4);assert.equal(parts[1].boxes.length,1);
console.log('PASS 48 door direction/orientation/reference cases: 2D, 3D, clearance, serialization; single-pane windows');
