import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addStudioLighting,sunAngles,eyeHeight,walkStart,insideWalkable,setCutaway} from '../scripts/studio/scene.mjs';
import {Viewport} from '../scripts/studio/viewport.mjs';

// Preview lighting follows offset rooms and the window-facing side, without editing geometry.
const world=new THREE.Scene(),lighting=addStudioLighting(world),original=lighting.sun.position.clone();
assert.equal(lighting.sun.castShadow,false,'layout starts without sun shadows');
const basicWorld=new THREE.Scene(),basicRenderer={shadowMap:{}},basicLighting=addStudioLighting(basicWorld,basicRenderer);assert.equal(basicRenderer.shadowMap.enabled,false);assert.equal(basicWorld.environment,null,'layout must not allocate the reflection environment');assert.equal(basicLighting.sun.castShadow,false);
const data={room:{length:18,width:7,height:3,origin:[22,-9]},walls:[{id:'north',start:[22,-2],end:[40,-2]}],openings:[{kind:'window',wall_id:'north',u:4,width:3,height:2}]};
const before=JSON.stringify(data);
lighting.setPreview(true,data);
assert.equal(lighting.sun.castShadow,true);
assert.equal(lighting.sun.target.position.x,31);assert.equal(lighting.sun.target.position.y,-5.5);
assert(lighting.sun.position.y>lighting.sun.target.position.y,'daylight comes from the window side');
assert(lighting.sun.shadow.camera.right>Math.hypot(18,7)/2,'shadow coverage fits a larger room');
assert(lighting.sun.shadow.camera.far>24);
assert.equal(JSON.stringify(data),before);
lighting.setPreview(false,data);assert(lighting.sun.position.equals(original));assert.equal(world.environmentIntensity,1);assert.equal(lighting.sun.shadow.camera.far,24);
assert.equal(lighting.sun.castShadow,false);
const off={renderPreview:false,store:{scene:data},environment:{setPreview(){assert.fail('changing sun parameters must not enable rendering');}}};Viewport.prototype.previewSun.call(off,{azimuth:30,elevation:45});assert.equal(off.renderPreview,false);
const previousWindow=globalThis.window;globalThis.window={devicePixelRatio:1};try{let disposed=0,reported;const helper={visible:false},view={renderPreview:true,quickRender:{dispose(){disposed++;}},grid:{visible:false},zones:{visible:false},environment:{grid:{visible:false},setPreview(enabled){assert.equal(enabled,false);}},gizmo:{getHelper:()=>helper},renderer:{setPixelRatio(){}},setTool(){},updateSelection(){},resize(){},store:{scene:data},events:{renderMode:value=>reported=value}};Viewport.prototype.setRenderPreview.call(view,false);assert.equal(disposed,1);assert.equal(view.quickRender,null);assert.equal(view.renderPreview,false);assert.equal(reported,false);}finally{globalThis.window=previousWindow;}
const viewport={renderer:{toneMappingExposure:1.05}};
for(const [input,expected] of [[4,4],[.1,.1],[12,4],[-2,.1],[NaN,.1],[1.05,1.05]])assert.equal(Viewport.prototype.setExposure.call(viewport,input),expected);
assert.equal(viewport.renderer.toneMappingExposure,1.05);
console.log('PASS preview window lighting, large offset room shadow coverage, geometry preservation, exit restoration and exposure bounds');

const sunData={...data,render_settings:{sun:{azimuth:225,elevation:25}}};
lighting.setPreview(true,sunData);const low=lighting.sun.position.clone().sub(lighting.sun.target.position);
assert(low.x<0&&low.y<0);assert(Math.abs(THREE.MathUtils.radToDeg(Math.atan2(low.z,Math.hypot(low.x,low.y)))-25)<1e-8);
lighting.setPreview(true,sunData,{azimuth:90,elevation:75});const high=lighting.sun.position.clone().sub(lighting.sun.target.position);
assert(high.y>0);assert(Math.hypot(low.x,low.y)/low.z>Math.hypot(high.x,high.y)/high.z,'lower sun casts longer shadows');
lighting.setPreview(false,sunData);lighting.setPreview(true,sunData);assert(lighting.sun.position.clone().sub(lighting.sun.target.position).distanceTo(low)<1e-8,'saved angles survive preview toggle');
assert.deepEqual(sunAngles({...data,render_settings:{sun:{azimuth:NaN,elevation:Infinity}}}),sunAngles(data));

const walkData={room:{length:6,width:4,height:2.8,origin:[10,20],outline:[[10,20],[16,20],[16,24],[10,24]]},walls:[{id:'divider',start:[13,20],end:[13,24],thickness:.2}],openings:[{id:'door',kind:'door',wall_id:'divider',u:1.5,width:1,height:2.2}],furniture:[]};
assert.equal(eyeHeight(walkData,99),2.65);assert.equal(eyeHeight(walkData,-1),.3);
const start=walkStart(walkData,1.6);assert(start&&insideWalkable(walkData,start));assert(start.x>10&&start.y>20,'offset rooms start inside their actual boundaries');
assert(!insideWalkable(walkData,new THREE.Vector3(13,21,1.6)),'cannot cross an internal wall');
assert(insideWalkable(walkData,new THREE.Vector3(13,22,1.6)),'door opening allows passage');
assert(!insideWalkable(walkData,new THREE.Vector3(13,22,2.5)),'viewpoint cannot pass above the lintel');
for(const [key,dx,dy]of [['w',1,0],['s',-1,0],['a',0,1],['d',0,-1]]){
 const walker={mode:'human',renderPreview:true,store:{scene:walkData},keys:new Set([key]),lookYaw:0,camera:new THREE.PerspectiveCamera(),updateLook(){}};walker.camera.position.set(11,22,1.6);
 Viewport.prototype.updateWalking.call(walker,.1);assert(Math.abs(walker.camera.position.x-(11+dx*.08))<1e-8);assert(Math.abs(walker.camera.position.y-(22+dy*.08))<1e-8);assert.equal(walker.camera.position.z,1.6);
}
const graph={entities:new Map([['divider',{visible:false}],['door',{visible:false}],['ceiling',{visible:false}]])};
setCutaway(graph,walkData,new THREE.Vector3(11,22,1.6),{human:true,enabled:true});for(const group of graph.entities.values())assert(group.visible,'human mode restores all walls, openings and ceiling');
console.log('PASS saved sun angles, moving light direction/height, walk height limits, offset-room spawn, wall/door collision, WASD handedness in render mode, and full human-view walls');
