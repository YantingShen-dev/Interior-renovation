import scaleGeometry from '../scripts/studio/scale-geometry.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {setupPlanEditor} from '../scripts/studio/plan-editor.mjs';
import {ReconstructionPreview,draftOrigin,metreGrid,pickBuilding} from '../scripts/studio/reconstruction-preview.mjs';
import {buildRoomGraph,disposeGraph} from '../scripts/studio/scene.mjs';
import plan from '../scripts/plan_geometry.js';
const html=fs.readFileSync(new URL('../scripts/studio/hub.html',import.meta.url),'utf8'),ids={},buttons=[];
class Element {
 constructor(){this.children=[];this.style={};this.dataset={};this.value='';this.checked=false;this.classList={toggle(){}};this.parentElement=this;}
 setAttribute(k,v){this[k]=v;} append(e){this.children.push(e);} replaceChildren(){this.children=[];}
 getBoundingClientRect(){return {left:0,top:0,width:900,height:640};}getScreenCTM(){return {inverse(){return this;}};}
 focus(){document.activeElement=this;}select(){}closest(){return null;}setPointerCapture(){}hasPointerCapture(){return false;}
}
for(const m of html.matchAll(/<\w+\b([^>]+)>/g)){const attrs=m[1],id=attrs.match(/\bid="([^"]+)"/)?.[1],e=new Element();e.value=attrs.match(/\bvalue="([^"]+)"/)?.[1]||'';e.checked=/\bchecked\b/.test(attrs);if(id)ids[id]=e;const tool=attrs.match(/data-draw-tool="([^"]+)"/);if(tool){e.dataset.drawTool=tool[1];buttons.push(e);}}
ids['draw-reference'].value='center';
globalThis.document={activeElement:null,getElementById:id=>{assert(ids[id],id);return ids[id];},createElementNS:()=>new Element(),querySelectorAll:s=>s==='[data-draw-tool]'?buttons:[]};
globalThis.window={getSelection:()=>({removeAllRanges(){}})};
globalThis.ResizeObserver=class{observe(){}};
globalThis.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
let errors=[],saved;
const editor=setupPlanEditor({create(){},toast:m=>errors.push(m),onChange:s=>saved=s});
const event=(p,extra={})=>({worldPoint:p,pointerId:1,button:0,target:ids['plan-canvas'],preventDefault(){},...extra});
const down=(p,extra)=>editor.pointer('down',event(p,extra)),up=p=>editor.pointer('up',event(p));
const tool=t=>buttons.find(b=>b.dataset.drawTool===t).onclick();
const key=(key,target=ids['plan-canvas'])=>ids['draw-page'].onkeydown({key,code:key===' '?'Space':key,target,preventDefault(){}});
let count=0;const test=(name,fn)=>{errors=[];fn();assert.deepEqual(errors,[]);count++;console.log('PASS '+name);};
test('a closed wall chain finishes automatically and uses short-edge midpoints',()=>{for(const p of [[0,0],[4,0],[4,3],[0,3],[0,0]]){down(p);up(p);}assert.equal(editor.state().walls.length,4);assert.equal(editor.state().tool,'select');assert.equal(editor.state().anchor,null);assert.equal(saved.room.regions.length,1);for(const w of editor.state().walls){assert.equal(w.reference_line,'center');const f=plan.wallFootprint(w);assert.deepEqual(w.start,f[0].map((v,k)=>(v+f[3][k])/2));}});
test('Escape in a parameter input and right click both finish without extra segments',()=>{tool('wall');down([6,0]);key('Escape',{closest:()=>true});assert.equal(editor.state().tool,'select');assert.equal(editor.state().anchor,null);tool('wall');down([6,0]);down([6,1],{button:2});assert.equal(editor.state().walls.length,4);assert.equal(editor.state().tool,'select');});
test('orthogonal settings are global and are not rolled back by geometry undo or project load',()=>{assert.equal(ids['draw-ortho'].checked,false);key('Shift');assert.equal(ids['draw-ortho'].checked,true);ids['draw-undo'].onclick();assert.equal(ids['draw-ortho'].checked,true);ids['draw-redo'].onclick();editor.load(saved);assert.equal(ids['draw-ortho'].checked,true);key('Shift');assert.equal(ids['draw-ortho'].checked,false);});
test('rectangle finishes in one operation and selection alone preserves redo',()=>{tool('rectangle');down([6,0]);down([10,3]);assert.equal(editor.state().walls.length,8);assert.equal(editor.state().tool,'select');ids['draw-undo'].onclick();down([2,0]);up([2,0]);assert.equal(ids['draw-redo'].disabled,false);ids['draw-redo'].onclick();assert.equal(editor.state().walls.length,8);});
test('box selection does not enter history as a malformed geometry snapshot',()=>{tool('select');down([-1,-1]);editor.pointer('move',event([4.5,3.5]));up([4.5,3.5]);assert.equal(editor.state().selected.length,4);ids['draw-undo'].onclick();assert.equal(editor.state().walls.length,4);ids['draw-redo'].onclick();assert.equal(editor.state().walls.length,8);});
test('3D wall hits place doors and windows on their actual host wall',()=>{const w=editor.state().walls[0];tool('door');down([1,0],{wallId:w.id,worldZ:1});assert.equal(editor.state().openings.length,1);assert.equal(editor.state().openings[0].wall_id,w.id);tool('window');down([3,0],{wallId:w.id,worldZ:1.5});assert.equal(editor.state().openings.length,2);assert.equal(editor.state().openings[1].bottom,.9);});
test('window dragging in a vertical work plane updates sill height and is undoable',()=>{const o=editor.state().openings[1],before=o.bottom;tool('select');down([3,0],{wallId:o.wall_id,openingId:o.id,worldZ:1.5});editor.pointer('move',event([3,0],{worldZ:1.8}));up([3,0]);assert(Math.abs(editor.state().openings[1].bottom-before-.3)<1e-9);ids['draw-undo'].onclick();assert.equal(editor.state().openings[1].bottom,before);});
test('shared 3D model retains draft world origin and ray picks a wall rather than its edge lines',()=>{const w={id:'wall',start:[-3,2],end:[1,2],thickness:.24,reference_line:'center'},scene=plan.createWallScene([w]),graph=buildRoomGraph(scene);graph.root.position.set(...draftOrigin([w]),0);graph.root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(-1,0,1),new THREE.Vector3(0,1,0)),hit=pickBuilding(ray,graph);assert.equal(hit.object.userData.id,'wall');assert(Math.abs(hit.point.y-1.88)<1e-6);disposeGraph(graph.root);});
test('wall highlight restores every shared-material face without adding solid outlines',()=>{
 const state=editor.state(),graph=buildRoomGraph(plan.createWallScene(state.walls,state.height,state.openings)),preview=Object.create(ReconstructionPreview.prototype);
 Object.assign(preview,{editing:true,key:JSON.stringify([state.walls,state.openings,state.height]),graph,ghost:new THREE.Group(),renderer:{domElement:{style:{}}}});
 const colors=new Map();graph.root.traverse(o=>{if(o.isMesh)colors.set(o,o.material.color.getHex());});
 const selected=[state.walls[0].id];preview.sync({...state,selected});let blue=0;graph.entities.get(selected[0]).traverse(o=>{if(o.isMesh){assert.equal(o.material.color.getHexString(),'348ee8');blue++;}});assert.ok(blue>1);
 preview.sync({...state,selected:[]});for(const [mesh,color]of colors)assert.equal(mesh.material.color.getHex(),color);
 graph.root.traverse(o=>assert.ok(!o.isLineSegments));disposeGraph(graph.root);disposeGraph(preview.ghost);
});
test('3D grid has exactly one metre spacing and sits above the floor',()=>{const g=metreGrid(20),p=g.geometry.attributes.position;assert.equal(p.count,84);assert.equal(p.getX(4)-p.getX(0),0);assert.equal(p.getZ(4)-p.getZ(0),1);assert(g.position.z>0);disposeGraph(g);});
test('3D snapping does not use the zero width of the hidden 2D canvas',()=>{const surface=new Element();editor.setSurface(surface,p=>({x:p[0]*30,y:p[1]*30}));tool('wall');down([7,7],{surface});editor.pointer('move',event([9,8],{surface}));assert.deepEqual(editor.state().anchor,[7,7]);assert.deepEqual(editor.state().hover,[9,8]);editor.finish();editor.setSurface(null);});
console.log(count+' drawing interaction regression checks passed.');

test('door subtype selection persists and updates the existing opening without duplication',()=>{const o=editor.state().openings[0];tool('select');down([o.u+.1,0],{openingId:o.id,wallId:o.wall_id});up([o.u+.1,0]);ids['draw-door-type'].value='elevator';ids['draw-door-type'].onchange();assert.equal(editor.state().openings[0].subtype,'elevator');assert.equal(editor.state().openings.length,2);ids['draw-undo'].onclick();assert.equal(editor.state().openings[0].subtype,'hinged');});
test('reference point mode consumes canvas clicks without drawing or moving a wall and Escape cancels',()=>{const before=structuredClone(editor.state().walls),points=[];let cancelled=false;editor.beginReference({click:p=>points.push(p),move:()=>null,cancel:()=>{cancelled=true;editor.endReference();}});down([1,1]);down([2,1]);assert.equal(points.length,2);assert.deepEqual(editor.state().walls,before);key('Escape');assert(cancelled);assert.equal(editor.state().tool,'select');});

test('Scale undo and redo restore wall, opening, furniture and height as a single drawing operation',()=>{
 let scene=plan.createScene([[0,0],[4,0],[4,3],[0,3]],3);scene.assets=[{id:'scale_asset',label:'box',dimensions:[.5,.5,.5],mount:'floor',style:'box',color:[1,1,1,1]}];scene.furniture=[{id:'box',asset_id:'scale_asset',kind:'furniture',label:'box',mount:'floor',free_position:true,position:[1,1,0],rotation_deg:0,dimensions:[.5,.5,.5]}];
 const scaleEditor=setupPlanEditor({create(){},toast:m=>errors.push(m),getObjects:()=>({assets:scene.assets,furniture:scene.furniture,finishes:scene.finishes}),onRestoreObjects:o=>Object.assign(scene,o),onChange:s=>{scene={...scene,...s,assets:scene.assets,furniture:scene.furniture};}});scaleEditor.load(scene);
 const before=structuredClone(scene),next=scaleGeometry.scaleAround(scene,[4,0],1.2);scaleEditor.applyScaled(next);scene=structuredClone(next);scaleEditor.endReference();
 ids['draw-undo'].onclick();assert.deepEqual(scene.furniture,before.furniture);assert.deepEqual(scene.walls[0].start,before.walls[0].start);assert.equal(scene.room.height,3);
 ids['draw-redo'].onclick();assert.deepEqual(scene.furniture,next.furniture);assert.deepEqual(scene.walls[0].start,next.walls[0].start);assert(Math.abs(scene.room.height-3.6)<1e-8);
});

test('wall endpoint dragging keeps a shared corner connected and supports undo, redo and Escape',()=>{
 const fresh=plan.createScene([[0,0],[4,0],[4,3],[0,3]],3),edit=setupPlanEditor({create(){},toast:m=>errors.push(m),onChange:s=>saved=s});edit.load(fresh);
 const wall=edit.state().walls[0],original=structuredClone(edit.state().walls),handle={dataset:{wall:wall.id,endpoint:'end'}};
 const start=()=>edit.pointer('down',event([4,0],{target:{closest:s=>s==='[data-endpoint]'?handle:null}}));
 start();edit.pointer('move',event([5,0]));assert.deepEqual(edit.state().walls[0].end,[5,0]);assert.deepEqual(edit.state().walls[1].start,[5,0]);edit.pointer('up',event([5,0]));
 assert.equal(saved.room.regions.length,1);ids['draw-undo'].onclick();assert.deepEqual(edit.state().walls,original);ids['draw-redo'].onclick();assert.deepEqual(edit.state().walls[0].end,[5,0]);
 start();edit.pointer('move',event([6,0]));edit.finish();assert.deepEqual(edit.state().walls[0].end,[5,0]);
});
