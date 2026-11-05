import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ReconstructionPreview} from '../scripts/studio/reconstruction-preview.mjs';

const doc=new EventTarget(),canvas=new EventTarget();
Object.assign(canvas,{ownerDocument:doc,style:{},clientWidth:900,clientHeight:600,getRootNode:()=>doc,setPointerCapture(){},releasePointerCapture(){},focus(){}});
const camera=new THREE.PerspectiveCamera(42,1.5,.01,200);camera.up.set(0,0,1);camera.position.set(7,-8,6);
const orbit=new OrbitControls(camera,canvas);let tool='wall',finished=0;
const view=Object.create(ReconstructionPreview.prototype);
Object.assign(view,{orbit,grid:{},environment:{grid:{}},ghost:{},renderer:{domElement:canvas},editor:{state:()=>({tool}),finish:()=>finished++}});
view.setEditing(true);
function pointer(type,button,x,y){const e=new Event('pointer'+type,{cancelable:true});Object.assign(e,{button,clientX:x,clientY:y,pageX:x,pageY:y,pointerId:1,pointerType:'mouse'});view.pointer(type,e);(type==='down'?canvas:doc).dispatchEvent(e);}
const offset=()=>camera.position.clone().sub(orbit.target);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
test('middle drag rotates the actual camera around a fixed target',()=>{const before=offset(),target=orbit.target.clone();pointer('down',1,200,200);pointer('move',1,270,230);pointer('up',1,270,230);assert(before.angleTo(offset())>.1);assert(orbit.target.distanceTo(target)<1e-8);assert(Math.abs(before.length()-offset().length())<1e-8);assert.equal(finished,0);});
test('right drag pans camera and target together without finishing a wall',()=>{const before=offset(),target=orbit.target.clone();pointer('down',2,200,200);pointer('move',2,260,240);pointer('up',2,260,240);assert(orbit.target.distanceTo(target)>.1);assert(before.distanceTo(offset())<1e-8);assert.equal(finished,0);});
test('right click ends drawing on release, not on press',()=>{pointer('down',2,200,200);assert.equal(finished,0);pointer('up',2,200,200);assert.equal(finished,1);});
test('a right drag returning to its origin is still a drag',()=>{pointer('down',2,200,200);pointer('move',2,250,200);pointer('move',2,200,200);pointer('up',2,200,200);assert.equal(finished,1);});
test('right click outside a drawing tool preserves selection',()=>{tool='select';pointer('down',2,200,200);pointer('up',2,200,200);assert.equal(finished,1);});
orbit.dispose();console.log(count+' drawing camera navigation checks passed.');
