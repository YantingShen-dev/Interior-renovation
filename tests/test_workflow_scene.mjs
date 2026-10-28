import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildRoomGraph,setCutaway} from '../scripts/studio/scene.mjs';
import {evidenceGraph} from '../scripts/studio/evidence.mjs';
import {attachAssetModel} from '../scripts/studio/models.mjs';
import state from '../scripts/studio/state.cjs';
const source=JSON.parse(fs.readFileSync(new URL('../单视频流程/试验01/furniture_layout/room.scene.json',import.meta.url),'utf8'));
const store=new state.StudioState(source),light=source.assets.find(a=>a.mount==='ceiling');store.add(light.id);const id=store.selected,graph=buildRoomGraph(store.scene);
setCutaway(graph,store.scene,new THREE.Vector3(2,-4,8),{plan:true});assert.equal(graph.furniture.get(id).visible,false);assert(store.scene.furniture.some(f=>f.id===id));
setCutaway(graph,store.scene,new THREE.Vector3(2,-4,8),{plan:false});assert.equal(graph.furniture.get(id).visible,true);console.log('PASS plan view hides ceiling fixtures without deleting them; 3D restores them');
const folder=new URL('../单视频流程/试验01/structure/',import.meta.url),sample=new URL('cleaned_sample.json',folder),planesFile=new URL('aligned_planes.json',folder);
// Private office scans are optional. A clean checkout exercises the same path
// with a deterministic synthetic plane, without publishing capture data.
const data=fs.existsSync(sample)&&fs.existsSync(planesFile)?{points:JSON.parse(fs.readFileSync(sample,'utf8')).points.filter((_,i)=>i%10===0),planes:JSON.parse(fs.readFileSync(planesFile,'utf8')).planes}:JSON.parse(fs.readFileSync(new URL('./fixtures/scan-plane.demo.json',import.meta.url),'utf8'));
const evidence=evidenceGraph(data,true);assert.equal(evidence.userData.pointCount,data.points.length);assert(evidence.children.some(o=>o.isPoints));assert(evidence.children.some(o=>o.isLine));assert(new THREE.Box3().setFromObject(evidence).isEmpty()===false);console.log('PASS scan preview uses actual surface samples and fitted plane contours in a consistent frame');
globalThis.ProgressEvent=class{constructor(type,data){this.type=type;Object.assign(this,data);}};
const small=structuredClone(source);small.furniture=[];small.assets=[];const bytes=state.G.exportGLB(small),asset={model_glb:'data:model/gltf-binary;base64,'+Buffer.from(bytes).toString('base64')};
const group=new THREE.Group(),root=new THREE.Group();root.add(group);group.userData.id='imported';group.add(new THREE.Mesh(new THREE.BoxGeometry(.8,.4,.75)));await attachAssetModel(group,asset,[.8,.4,.75]);assert(group.userData.modelLoaded);assert.equal(group.children[0].visible,false);const bounds=new THREE.Box3().setFromObject(group.children.at(-1)),size=bounds.getSize(new THREE.Vector3());for(const [i,k]of ['x','y','z'].entries())assert(Math.abs(size[k]-[.8,.4,.75][i])<1e-5);assert(Math.abs(bounds.min.z)<1e-5);console.log('PASS imported binary GLB is used as the actual furniture mesh and normalized to confirmed metric size');
console.log('3 new Three.js workflow checks passed without GPU rendering.');
