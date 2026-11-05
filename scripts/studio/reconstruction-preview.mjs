import * as THREE from 'three';
import {Preview} from './preview.mjs';
import {disposeGraph,visibleObject} from './scene.mjs';
import plan from '../plan_geometry.js';

// The editing viewport keeps the draft's world origin; saved scenes normalize it.
export function draftOrigin(walls){return walls.length?[0,1].map(k=>Math.min(...walls.flatMap(w=>[w.start[k],w.end[k]]))):[0,0];}
export function pickBuilding(raycaster,graph){
 if(!graph)return null;
 const hit=raycaster.intersectObject(graph.root,true).find(h=>h.object.isMesh&&visibleObject(h.object));
 return hit&&!['floor','ceiling'].includes(hit.object.userData.id)?hit:null;
}
export function metreGrid(size=100){const grid=new THREE.GridHelper(size,size,'#8598a8','#afbdc8');grid.rotation.x=Math.PI/2;grid.position.z=.028;grid.material.transparent=true;grid.material.opacity=.6;return grid;}

export class ReconstructionPreview extends Preview {
 constructor(element,editor){
  super(element);this.editing=true;this.disableCutaway=true;this.editor=editor;this.key='';this.raycaster=new THREE.Raycaster();this.world.background.set('#eaf0f5');
  this.environment.grid.visible=false;this.grid=metreGrid();this.world.add(this.grid);this.ghost=new THREE.Group();this.world.add(this.ghost);
  this.orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
  const canvas=this.renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','三维建模画布，中键拖动旋转，右键拖动平移');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  for(const type of ['down','move','up','cancel'])canvas.addEventListener('pointer'+type,e=>this.pointer(type,e),true);
  canvas.addEventListener('blur',()=>{if(this.gesture)this.cancelGesture();});
 }
 setEditing(enabled){this.editing=enabled;this.grid.visible=enabled;this.environment.grid.visible=!enabled;this.ghost.visible=enabled;this.orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};if(enabled)this.key='';}
 activate(){this.editor.setSurface(this.renderer.domElement,p=>this.project(p));this.sync(this.editor.state());}
 project(p){const v=new THREE.Vector3(...p,0).project(this.camera),r=this.renderer.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
 sync(state){
  if(!this.editing)return;this.state=state;const key=JSON.stringify([state.walls,state.openings,state.height,...(state.finishes?[state.finishes]:[]),...(state.furniture||state.assets?[state.furniture,state.assets]:[])]);
  if(key!==this.key){this.key=key;if(state.walls.length){const data=plan.createWallScene(state.walls,state.height,state.openings,state.assets||[],{preserveOrigin:true});data.furniture=structuredClone(state.furniture||[]);data.finishes=structuredClone(state.finishes||{});this.setScene(data);this.graph.root.position.set(0,0,0);this.graph.root.updateMatrixWorld(true);}else this.clear();}
  if(this.graph)for(const [id,group]of this.graph.entities){const selected=state.selected.includes(id)||id===state.opening;group.traverse(o=>{if(o.isMesh){o.material.userData.baseColor??=o.material.color.clone();o.material.color.copy(selected?new THREE.Color('#348ee8'):o.material.userData.baseColor);o.material.emissive?.set(selected?'#123d70':'#000000');}});}
  this.ghost.clear();
  if(this.ghostParts){disposeGraph(this.ghostParts);this.ghostParts=null;}
  const parts=new THREE.Group();this.ghostParts=parts;this.ghost.add(parts);
  const addLine=(points,color='#278bd4')=>{const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1],p[2]??.04)));parts.add(new THREE.Line(g,new THREE.LineBasicMaterial({color,depthTest:false})));};
  if(state.anchor&&state.hover){const a=state.anchor,b=state.hover,points=state.tool==='rectangle'?[a,[b[0],a[1]],b,[a[0],b[1]],a]:[a,b];addLine(points);for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(L<.001)continue;const w={start:p,end:q,thickness:state.thickness,reference_line:state.reference},poly=plan.wallFootprint(w),mid=poly.reduce((v,p)=>v.map((n,k)=>n+p[k]/4),[0,0]);const box=new THREE.Mesh(new THREE.BoxGeometry(L,state.thickness,state.height),new THREE.MeshBasicMaterial({color:'#398fda',transparent:true,opacity:.22,depthWrite:false}));box.position.set(...mid,state.height/2);box.rotation.z=Math.atan2(q[1]-p[1],q[0]-p[0]);parts.add(box);}}
  if(state.referencePreview){const r=state.referencePreview;for(const w of r.walls){addLine([w.start,w.end],'#0058a3');addLine([[...w.start,w.height],[...w.end,w.height]],'#0058a3');addLine([w.start,[...w.start,w.height]],'#0058a3');}addLine([r.base,r.target],'#e0ab00');}
  for(const g of state.guides||[])addLine([g.from,g.to],'#0058a3');
  this.renderer.domElement.style.cursor=state.tool==='select'?'default':state.tool==='pan'?'grab':'crosshair';
 }
 setScene(data,options={}){
  super.setScene(data,options);this.graph.entities.get('ceiling')?.traverse(o=>o.visible=false);
 }
 fit(){if(!this.graph){this.camera.position.set(8,-10,9);this.orbit.target.set(2,2,0);}else{const bounds=new THREE.Box3().setFromObject(this.graph.root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),d=Math.max(size.x,size.y,size.z,3)*Math.max(1,1/this.camera.aspect);this.camera.position.copy(center).add(new THREE.Vector3(d,-d*1.4,d));this.orbit.target.copy(center);}this.orbit.update();}
 cast(e){const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),this.camera);}
 cancelGesture(){this.editor.pointer('cancel',{});this.gesture=null;}
 pointer(type,e){
  if(!this.editing)return;const canvas=this.renderer.domElement,state=this.editor.state();
  if(type==='down'&&(e.button===1||e.button===2||e.altKey||state.tool==='pan'&&e.button===0)){
   e.preventDefault();this.navigation={button:e.button,x:e.clientX,y:e.clientY,moved:false};this.orbit.mouseButtons.LEFT=state.tool==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;return;
  }
  if(this.navigation){
   const nav=this.navigation;nav.moved ||= Math.hypot(e.clientX-nav.x,e.clientY-nav.y)>4;
   if(type==='up'||type==='cancel'){
    this.navigation=null;
    if(type==='up'&&nav.button===2&&!nav.moved&&['wall','rectangle','door','window','reference'].includes(state.tool)){this.editor.finish();canvas.focus();}
   }
   return;
  }
  e.preventDefault();e.stopImmediatePropagation();
  if(type==='cancel'){this.cancelGesture();return;}
  this.cast(e);const hit=pickBuilding(this.raycaster,this.graph),id=hit?.object.userData.id,o=state.openings.find(o=>o.id===id),wall=state.walls.find(w=>w.id===(o?.wall_id||id));
  let position=null;
  if(this.gesture)position=this.raycaster.ray.intersectPlane(this.gesture.plane,new THREE.Vector3());
  else if(['select','door','window','erase'].includes(state.tool)&&wall)position=hit.point;
  else position=this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());
  if(!position){if(type==='up')this.cancelGesture();return;}
  if(type==='down'){
   if(e.button!==0)return;canvas.focus();
   let normal=new THREE.Vector3(0,0,1);
   if(o&&state.tool==='select')normal.set(wall.end[1]-wall.start[1],wall.start[0]-wall.end[0],0).normalize();
   this.gesture={plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,position)};
   canvas.setPointerCapture(e.pointerId);
  }
  this.editor.pointer(type,{surface:canvas,worldPoint:[position.x,position.y],worldZ:position.z,wallId:wall?.id,openingId:o?.id,button:e.button,pointerId:e.pointerId,shiftKey:e.shiftKey,clientX:e.clientX,clientY:e.clientY,target:canvas,preventDefault:()=>e.preventDefault()});
  if(type==='up'){this.gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
 }
 dispose(){if(this.ghostParts)disposeGraph(this.ghostParts);super.dispose();}
}
