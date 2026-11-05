import assert from 'node:assert/strict';
import {openingDrag,scaleOutline} from '../scripts/studio/plan-interactions.mjs';
import {saveView,validateView} from '../scripts/studio/views.mjs';
import {enableFreePlacement} from '../scripts/studio/projects.mjs';
import model from '../scripts/studio/state.cjs';
import plan from '../scripts/plan_geometry.js';
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const points=[[0,0],[6,0],[6,3],[3,3],[3,5],[0,5]],door={id:'d',kind:'door',wall_id:'draw_wall_0',u:1,width:.9,height:2.1,bottom:0,open_angle_deg:0};
test('door drag keeps wall attachment and clamps at both endpoints',()=>{const a=openingDrag(points,door,[4,1],'move',.45);assert.equal(a.u,3.55);assert.equal(a.wall_id,door.wall_id);assert.equal(openingDrag(points,door,[-10,0],'move',.45).u,0);assert.equal(openingDrag(points,door,[100,0],'move',.45).u,5.1);assert.equal(door.u,1);});
test('opening handles resize from either edge without crossing or leaving wall',()=>{const a=openingDrag(points,door,[.5,0],'start');assert.equal(a.u,.5);assert(Math.abs(a.width-1.4)<1e-8);const b=openingDrag(points,door,[4,0],'end');assert.equal(b.width,3);assert.equal(openingDrag(points,door,[.1,0],'end').width,.1);});
test('calibration preserves concave outline and rescales wall-relative openings',()=>{const scene=plan.createScene(points,3,[door]),scaled=scaleOutline(scene,'draw_wall_0',12,3);assert.equal(scaled.room.outline.length,6);assert.equal(Math.abs(plan.area(scaled.room.outline)),96);assert.equal(scaled.openings[0].u,2);assert.equal(scaled.openings[0].width,1.8);assert.equal(model.G.validate(scaled).length,0);assert.equal(scene.room.length,6);});
test('canvas coordinates outside previous bounds remain valid and normalize on save',()=>{const scene=plan.createScene([[-50,-60],[40,-60],[40,20],[-50,20]],3);assert.equal(scene.room.length,90);assert.equal(scene.room.width,80);assert.equal(model.G.validate(scene).length,0);});
test('free XYZ transforms move floor objects vertically and reject floor, wall and ceiling crossing',()=>{const store=new model.StudioState(plan.createScene([[0,0],[5,0],[5,4],[0,4]],3));enableFreePlacement(store.scene);store.add('desk');const f=store.current();let result=model.fromTransform(store.scene,f.id,{position:[2,2,1.1]},'translate',{snap:false});assert.equal(result.errors.length,0);assert.equal(model.F.pose(result.scene,result.scene.furniture[0]).position[2],1.1);for(const p of [[2,2,-.1],[2,2,2.9],[0,2,1]])assert(model.fromTransform(store.scene,f.id,{position:p},'translate',{snap:false}).errors.length);});
test('saved views retain distinct camera states across JSON persistence and updates',()=>{const camera={mode:'3d',position:[5,-6,4],target:[2,2,1],focal:35,zoom:1,yaw:0,pitch:0},a=saveView([],camera,'入口'),b=saveView(a,{...camera,position:[2,3,1.6],focal:50},'客厅');const reloaded=JSON.parse(JSON.stringify(b));assert.equal(reloaded.length,2);assert.equal(reloaded[0].focal,35);assert.equal(reloaded[1].focal,50);assert.deepEqual(validateView(reloaded[0]).position,camera.position);assert.equal(saveView(reloaded,camera,'入口新角度',reloaded[0].id)[0].name,'入口新角度');assert.throws(()=>validateView({...camera,position:[NaN,0,0]}));});

import server from '../scripts/studio/server.cjs';
import fs from 'node:fs';
import path from 'node:path';
const originalRead=fs.readFileSync,originalWrite=fs.writeFileSync;let saved;
try{fs.readFileSync=(file,...args)=>String(file).endsWith(path.join('project','project.json'))?JSON.stringify({input:{video_sha256:'fixture-video'}}):originalRead(file,...args);fs.writeFileSync=(file,data,...args)=>{if(String(file).endsWith('confirmed-room.scene.json')){saved=JSON.parse(data);return;}return originalWrite(file,data,...args);};
 test('scan confirmation persists the supplied concave outline, not a bounding rectangle',()=>{const result=server.confirmScene({id:'00000000-0000-0000-0000-000000000001',status:'review'},{outline:points,height:3,openings:[door]});assert.equal(result.walls.length,6);assert.equal(Math.abs(plan.area(result.room.outline)),24);assert.equal(result.provenance.source_video_sha256,'fixture-video');assert.equal(result.provenance.auto_extraction_claim,false);assert.deepEqual(saved.room.outline,points);assert.equal(result.openings.length,1);});
}finally{fs.readFileSync=originalRead;fs.writeFileSync=originalWrite;}

console.log(`${count} interaction checks passed.`);
