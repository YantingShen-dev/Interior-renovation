import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {buildRoomGraph,disposeGraph,setCutaway,selectionOutline,floorPick,furnitureFromRay,addStudioLighting,makeCameras,insideWalkable,visibleObject} from './scene.mjs';
import state from './state.cjs';
import {evidenceGraph,clearEvidence} from './evidence.mjs';
import {attachAssetModel,exportGraph} from './models.mjs';
const {F,G,copy,fromTransform}=state;
export class Viewport{
 constructor(element,store,events={}){
  this.element=element;this.store=store;this.events=events;this.mode='3d';this.tool='select';this.axis=null;this.snap=true;this.gridSize=.05;this.fine=false;this.cutaway=true;this.showZones=false;this.keys=new Set();this.labels=[];this.drag=null;this.transaction=null;this.measureStart=null;this.measureEnd=null;
  this.world=new THREE.Scene();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','Three.js 三维房间视图');element.prepend(this.renderer.domElement);
  this.renderer.debug.onShaderError=(gl,program)=>this.events.fatal?.('三维着色器未能完成编译：'+(gl.getProgramInfoLog(program)||'当前图形环境不支持所需渲染能力'));
  this.renderer.domElement.addEventListener('webglcontextlost',()=>this.events.fatal?.('三维渲染上下文已中断，请先导出方案，再重新打开页面。'));
  this.environment=addStudioLighting(this.world,this.renderer);this.raycaster=new THREE.Raycaster();this.grid=new THREE.GridHelper(20,200,'#aaaaaa','#bbbbbb');this.grid.rotation.x=Math.PI/2;this.grid.position.z=.006;this.grid.material.transparent=true;this.grid.material.opacity=.13;this.grid.visible=false;this.world.add(this.grid);
  this.rebuild();this.cameras=makeCameras(store.scene.room,element.clientWidth/Math.max(1,element.clientHeight));this.camera=this.cameras.perspective;
  this.gizmo=new TransformControls(this.camera,this.renderer.domElement);this.gizmo.setSize(.75);this.world.add(this.gizmo.getHelper());this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.configureOrbit();this.orbit.target.copy(this.cameras.center);this.orbit.update();
  this.gizmo.addEventListener('dragging-changed',e=>{if(e.value){this.transaction={before:copy(this.store.scene),id:this.store.selected,last:copy(this.store.scene),errors:[]};this.orbit.enabled=false;}else {this.orbit.enabled=this.mode!=='human';this.finishTransform();}});
  this.gizmo.addEventListener('objectChange',()=>this.previewTransform());this.bind();this.resize();this.updateSelection();this.setTool('select');this.previousTime=performance.now();this.renderer.setAnimationLoop(time=>this.frame(time));
 }
 configureOrbit(){this.orbit.enableDamping=true;this.orbit.dampingFactor=.09;this.orbit.minDistance=.4;this.orbit.maxDistance=30;this.orbit.maxPolarAngle=this.mode==='2d'?Math.PI:Math.PI/2-.025;this.orbit.screenSpacePanning=true;this.orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};}
 rebuild(){
  this.gizmo?.detach();if(this.graph){this.world.remove(this.graph.root);disposeGraph(this.graph.root);}this.graph=buildRoomGraph(this.store.scene);this.world.add(this.graph.root);this.rebuildZones();
  this.modelLoads=[];for(const f of this.store.scene.furniture){const asset=F.asset(this.store.scene,f.asset_id);if(asset.model_glb)this.modelLoads.push(attachAssetModel(this.graph.furniture.get(f.id),asset,f.dimensions,f.material_override).then(()=>true).catch(e=>{this.events.toast?.('三维家具载入失败，显示尺寸占位：'+e.message,true);return false;}));}
  if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);this.outline=null;}this.updateSelection();
  if(this.evidenceMode)this.graph.root.visible=this.evidenceMode==='vector';
 }
 rebuildZones(){
  if(this.zones){this.world.remove(this.zones);disposeGraph(this.zones);}this.zones=new THREE.Group();
  for(const zone of F.doorZones(this.store.scene,this.store.scene.layout_settings.clearance_m||.8)){
   const shape=new THREE.Shape(zone.polygon.map(p=>new THREE.Vector2(...p))),mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#888888',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));mesh.position.z=.012;this.zones.add(mesh);
   const points=[...zone.polygon,zone.polygon[0]].map(p=>new THREE.Vector3(...p,.014)),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:'#777777',dashSize:.06,gapSize:.035,transparent:true,opacity:.55}));line.computeLineDistances();this.zones.add(line);
  }this.zones.visible=this.showZones;this.world.add(this.zones);
 }
 resize(){const W=Math.max(1,this.element.clientWidth),H=Math.max(1,this.element.clientHeight);this.renderer.setSize(W,H);if(this.cameras){this.cameras.perspective.aspect=W/H;this.cameras.perspective.updateProjectionMatrix();const room=this.store.scene.room,span=Math.max(room.width+.8,(room.length+.8)/(W/H)),top=this.cameras.top;top.left=-span*(W/H)/2;top.right=span*(W/H)/2;top.top=span/2;top.bottom=-span/2;top.updateProjectionMatrix();}}
 setView(mode){
  this.cancel();this.mode=mode;if(mode==='2d'&&this.store.current()?.mount==='ceiling'){this.store.selected=null;this.events.select?.(null);}const room=this.store.scene.room;
  if(mode==='2d'){this.camera=this.cameras.top;this.camera.position.set(room.length/2,room.width/2,15);this.camera.lookAt(room.length/2,room.width/2,0);this.camera.zoom=1;this.camera.updateProjectionMatrix();}
  else {this.camera=this.cameras.perspective;if(mode==='human'){this.camera.position.set(Math.max(.2,room.length-.6),room.width/2,Math.min(1.6,room.height-.15));this.lookYaw=Math.PI;this.lookPitch=-.08;this.updateLook();}else {this.camera.position.copy(this.cameras.center).add(new THREE.Vector3(room.length*.95,-room.length*1.25,room.height*1.26));this.camera.lookAt(this.cameras.center);}}
  this.orbit.dispose();this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.configureOrbit();this.orbit.enabled=mode!=='human';this.orbit.enableRotate=mode!=='2d';this.orbit.target.copy(mode==='2d'?new THREE.Vector3(room.length/2,room.width/2,0):this.cameras.center);if(mode==='human')this.updateLook();else this.orbit.update();this.gizmo.camera=this.camera;this.setTool(mode==='human'?'select':this.tool);this.resize();this.events.view?.(mode);
 }
 fit(){if(this.mode==='human'){this.setView('3d');return;}this.setView(this.mode);}
 focus(){const f=this.store.current();if(!f)return;const p=F.pose(this.store.scene,f),target=new THREE.Vector3(...p.position);target.z+=f.dimensions[2]*.5;if(this.mode==='human'){this.camera.lookAt(target);return;}this.orbit.target.copy(target);if(this.mode==='2d'){this.camera.position.x=target.x;this.camera.position.y=target.y;this.camera.zoom=1.6;this.camera.updateProjectionMatrix();}else {const offset=new THREE.Vector3(1,-1,.8).normalize().multiplyScalar(Math.max(...f.dimensions)*3+.9);this.camera.position.copy(target).add(offset);}this.orbit.update();}
 setTool(tool){
  if(this.transaction||this.drag&&!this.drag.walk)this.cancel();if(this.mode==='human')tool='select';const previous=this.tool;this.tool=tool;if(previous!==tool){this.axis=tool==='rotate'?'Z':null;this.events.axis?.(this.axis);}
  if(this.orbit){this.orbit.mouseButtons.LEFT=tool==='orbit'?THREE.MOUSE.ROTATE:tool==='pan'?THREE.MOUSE.PAN:null;this.orbit.enableRotate=this.mode!=='2d';}
  this.element.style.cursor=tool==='measure'?'crosshair':tool==='pan'?'grab':tool==='orbit'?'grab':'default';this.updateSelection();this.events.tool?.(tool);
 }
 updateSelection(){
  if(!this.graph)return;if(this.lastSelection!==this.store.selected){this.lastSelection=this.store.selected;this.axis=this.tool==='rotate'?'Z':null;this.events.axis?.(this.axis);}if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);this.outline=null;}
  const f=this.store.current();if(f){this.outline=selectionOutline(this.store.scene,f);this.world.add(this.outline);}
  if(!this.gizmo)return;this.gizmo.detach();const group=f&&this.graph.furniture.get(f.id);if(!group||this.mode==='human')return;
  if(['move','rotate','scale'].includes(this.tool)){
   if(f.mount==='wall'&&this.tool==='rotate'){this.events.toast?.('挂墙家具沿墙定向，可调整所属墙和沿墙位置');return;}
   const mode={move:'translate',rotate:'rotate',scale:'scale'}[this.tool];this.gizmo.attach(group);this.gizmo.setMode(mode);this.gizmo.setSpace(this.tool==='scale'||f.mount==='wall'?'local':'world');
   const axis=this.axis;this.gizmo.showX=this.tool!=='rotate'&&(!axis||axis==='X');this.gizmo.showY=this.tool!=='rotate'&&f.mount!=='wall'&&(!axis||axis==='Y');this.gizmo.showZ=this.tool==='rotate'||(this.tool==='scale'||f.mount==='wall')&&(!axis||axis==='Z');
   this.gizmo.showXY=!axis&&this.tool==='move'&&f.mount!=='wall';this.gizmo.showXZ=this.gizmo.showYZ=false;this.gizmo.showE=this.gizmo.showXYZE=false;
   this.gizmo.setTranslationSnap(this.snap&&!this.fine?this.gridSize:null);this.gizmo.setRotationSnap(this.snap&&!this.fine?Math.PI/12:null);this.gizmo.setScaleSnap(this.snap&&!this.fine ? .05 : null);
  }
 }
 setAxis(axis){const f=this.store.current();if(this.tool==='rotate'&&axis!=='Z'){this.events.toast?.('当前绕 Z 轴旋转，保持家具的落地或顶装方向');return;}if(axis==='Z'&&f&&f.mount!=='wall'&&this.tool==='move'){this.events.toast?.('落地和顶装家具保持贴合，当前可沿 X / Y 移动');return;}this.axis=this.axis===axis?null:axis;this.updateSelection();this.events.axis?.(this.axis);}
 mouseRay(event){const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);return this.raycaster;}
 select(id){this.store.selected=id;this.updateSelection();this.events.select?.(id);}
 previewTransform(){
  if(!this.transaction)return;const group=this.gizmo.object;if(!group)return;
  const result=fromTransform(this.transaction.before,this.transaction.id,{position:group.position.toArray(),rotation:group.rotation.z,scale:group.scale.toArray()},this.gizmo.mode,{snap:this.snap&&!this.fine,grid:this.gridSize,axis:this.axis||(['X','Y','Z'].includes(this.gizmo.axis)?this.gizmo.axis:null)});
  if(!result.errors.length){const furniture=result.scene.furniture.find(f=>f.id===this.transaction.id);group.position.fromArray(F.pose(result.scene,furniture).position);group.updateMatrixWorld(true);}
  this.transaction.last=result.scene;this.transaction.errors=result.errors;this.previewOutline(result.scene,result.errors.length>0);this.events.preview?.(result.scene,result.hints,result.errors);
 }
 previewOutline(scene,invalid){if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);}const f=scene.furniture.find(f=>f.id===this.store.selected);if(f){this.outline=selectionOutline(scene,f,invalid?'#bf6d56':'#222222');this.world.add(this.outline);}}
 finishTransform(){if(!this.transaction)return;const transaction=this.transaction;this.transaction=null;if(transaction.errors.length){this.events.toast?.(transaction.errors[0],true);this.rebuild();return;}if(this.store.commit(transaction.last,transaction.before))this.events.change?.();else this.rebuild();}
 cancel(){
  if(this.transaction){const before=this.transaction.before;this.transaction=null;this.store.scene=before;if(this.gizmo?.dragging)this.gizmo.reset();this.rebuild();}
  if(this.drag){this.drag=null;this.rebuild();}this.measureStart=null;this.keys.clear();if(this.orbit)this.orbit.enabled=this.mode!=='human';
 }
 measure(event){const hits=this.mouseRay(event).intersectObject(this.graph.root,true).filter(hit=>visibleObject(hit.object)),point=hits[0]?.point||floorPick(this.raycaster);if(!point)return;
  if(!this.measureStart){this.measureStart=point.clone();this.events.toast?.('已取起点，再点一个位置完成测距');return;}
  if(this.measureLine){this.world.remove(this.measureLine);disposeGraph(this.measureLine);}
  this.measureEnd=point.clone();this.measureLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.measureStart,this.measureEnd]),new THREE.LineBasicMaterial({color:'#444444',depthTest:false}));this.measureLine.renderOrder=150;this.world.add(this.measureLine);this.lastMeasurement={point:this.measureStart.clone().add(this.measureEnd).multiplyScalar(.5),text:this.measureStart.distanceTo(this.measureEnd).toFixed(3)+' m'};this.events.toast?.('测量距离 '+this.lastMeasurement.text);this.measureStart=null;
 }
 bind(){
  const canvas=this.renderer.domElement;this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.element);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
   canvas.focus({preventScroll:true});if(event.button===1)this.orbit.mouseButtons.MIDDLE=event.shiftKey?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
   if(event.button!==0)return;if(this.evidenceMode)return;if(this.mode==='human'){this.drag={walk:true,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();return;}
   if(this.gizmo.axis&&this.gizmo.enabled)return;if(['orbit','pan'].includes(this.tool))return;
   if(this.tool==='measure'){this.measure(event);return;}
   const ray=this.mouseRay(event),id=furnitureFromRay(ray,this.graph);
   if(!id){this.select(null);return;}this.select(id);
   if(this.tool==='select'||this.tool==='move'){
    const f=this.store.current(),planeZ=F.pose(this.store.scene,f).position[2],point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-planeZ),new THREE.Vector3());
    if(point){this.drag={before:copy(this.store.scene),id,start:point,planeZ,client:[event.clientX,event.clientY],candidate:null,errors:[]};this.orbit.enabled=false;canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();}
   }
  },true);
  canvas.addEventListener('pointermove',event=>{
   if(this.drag?.walk){this.lookYaw-=(event.clientX-this.drag.x)*.004;this.lookPitch=Math.max(-1.2,Math.min(1.2,this.lookPitch-(event.clientY-this.drag.y)*.004));this.drag.x=event.clientX;this.drag.y=event.clientY;this.updateLook();return;}
   if(!this.drag||this.gizmo.dragging)return;
   if(Math.hypot(event.clientX-this.drag.client[0],event.clientY-this.drag.client[1])<3)return;
   const ray=this.mouseRay(event),point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-this.drag.planeZ),new THREE.Vector3());if(!point)return;
   const source=this.drag.before.furniture.find(f=>f.id===this.drag.id),pose=F.pose(this.drag.before,source),delta=point.clone().sub(this.drag.start);let axis=this.axis;if(event.shiftKey&&!axis)axis=Math.abs(delta.x)>Math.abs(delta.y)?'X':'Y';if(axis==='X')delta.y=0;if(axis==='Y')delta.x=0;
   const result=fromTransform(this.drag.before,this.drag.id,{position:[pose.position[0]+delta.x,pose.position[1]+delta.y,pose.position[2]]},'translate',{snap:this.snap&&!event.shiftKey,grid:this.gridSize,axis});this.drag.candidate=result.scene;this.drag.errors=result.errors;
   const f=result.scene.furniture.find(f=>f.id===source.id),p=F.pose(result.scene,f),group=this.graph.furniture.get(f.id);group.position.fromArray(p.position);group.updateMatrixWorld(true);this.previewOutline(result.scene,result.errors.length>0);this.events.preview?.(result.scene,result.hints,result.errors);
  });
  canvas.addEventListener('pointerup',()=>{
   if(!this.drag)return;const drag=this.drag;this.drag=null;this.orbit.enabled=this.mode!=='human';if(drag.walk)return;
   if(drag.candidate&&!drag.errors.length){if(this.store.commit(drag.candidate,drag.before))this.events.change?.();else this.rebuild();}else {if(drag.errors.length)this.events.toast?.(drag.errors[0],true);this.rebuild();this.events.preview?.(this.store.scene,[],[]);}
  });
  canvas.addEventListener('pointercancel',()=>{this.cancel();this.orbit.enabled=this.mode!=='human';});
  this.element.addEventListener('dragover',event=>event.preventDefault());this.element.addEventListener('drop',event=>{event.preventDefault();const asset=event.dataTransfer.getData('application/x-room-asset');if(!asset)return;const point=floorPick(this.mouseRay(event));try{this.store.add(asset,point?[point.x,point.y]:null);this.events.change?.();this.setTool('move');}catch(error){this.events.toast?.(error.message,true);}});
 }
 updateLook(){const direction=new THREE.Vector3(Math.cos(this.lookYaw)*Math.cos(this.lookPitch),Math.sin(this.lookYaw)*Math.cos(this.lookPitch),Math.sin(this.lookPitch));this.camera.lookAt(this.camera.position.clone().add(direction));}
 updateWalking(delta){if(this.mode!=='human')return;const speed=(this.keys.has('shift')?1.6:.8)*delta,forward=new THREE.Vector3(Math.cos(this.lookYaw),Math.sin(this.lookYaw),0),side=new THREE.Vector3(-Math.sin(this.lookYaw),Math.cos(this.lookYaw),0),movement=new THREE.Vector3();if(this.keys.has('w'))movement.add(forward);if(this.keys.has('s'))movement.sub(forward);if(this.keys.has('a'))movement.add(side);if(this.keys.has('d'))movement.sub(side);if(movement.lengthSq()){movement.normalize().multiplyScalar(speed);const next=this.camera.position.clone().add(movement);if(insideWalkable(this.store.scene,next)){this.camera.position.copy(next);this.updateLook();}}}
 frame(time){try{const delta=Math.min((time-this.previousTime)/1000,.05);this.previousTime=time;this.updateWalking(delta);if(this.mode!=='human')this.orbit.update();setCutaway(this.graph,this.store.scene,this.camera.position,{enabled:this.cutaway,human:this.mode==='human',plan:this.mode==='2d'});this.renderer.render(this.world,this.camera);this.updateLabels();if(!this.firstFrame){this.firstFrame=true;this.events.ready?.();}}catch(error){this.renderer.setAnimationLoop(null);this.events.fatal?.(error.message);}}
 toScreen(point){const p=point.clone().project(this.camera);return {x:(p.x+1)/2*this.element.clientWidth,y:(1-p.y)/2*this.element.clientHeight,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1};}
 updateLabels(){
  const room=this.store.scene.room,labels=[];
  if(this.evidenceMode&&this.evidenceMode!=='vector'){this.events.labels?.([]);return;}
  if(this.mode!=='human'){labels.push({point:new THREE.Vector3(room.length/2,-.16,0),text:room.length.toFixed(2)+' m',type:'room'},{point:new THREE.Vector3(-.16,room.width/2,0),text:room.width.toFixed(2)+' m',type:'room'});}
  const preview=this.transaction?.last||this.drag?.candidate||this.store.scene,f=preview.furniture.find(f=>f.id===this.store.selected);if(f&&this.mode!=='human'){const p=F.pose(preview,f),group=this.graph.furniture.get(f.id);if(group){const point=new THREE.Vector3(...p.position);point.z+=f.dimensions[2]+.15;labels.push({point,text:f.dimensions.map(v=>Math.round(v*100)).join(' × ')+' cm',type:'selected'});this.events.context?.(this.toScreen(point));}}
  if(this.showNames&&this.mode==='2d')for(const f of preview.furniture){if(f.mount==='ceiling')continue;const p=F.pose(preview,f);labels.push({point:new THREE.Vector3(p.position[0],p.position[1],.05),text:f.label.replace(/^IKEA /,''),type:'name'});}
  if(this.lastMeasurement)labels.push({...this.lastMeasurement,type:'measurement'});this.events.labels?.(labels.map(label=>({...this.toScreen(label.point),text:label.text,type:label.type})));
 }
 snapshot(){this.renderer.render(this.world,this.camera);return this.renderer.domElement.toDataURL('image/png');}
 async referenceSnapshot(){if((await Promise.all(this.modelLoads)).some(ok=>!ok))throw new Error('请先解决家具三维模型载入问题，再捕获渲染参考');const hidden=[this.gizmo.getHelper(),this.outline,this.zones,this.grid,this.measureLine].filter(Boolean),visibility=hidden.map(o=>o.visible);try{hidden.forEach(o=>o.visible=false);return this.snapshot();}finally{hidden.forEach((o,i)=>o.visible=visibility[i]);}}
 showEvidence(mode,data){this.cancel();clearEvidence(this);this.evidenceMode=mode;this.graph.root.visible=mode==='vector';this.gizmo?.detach();if(this.outline)this.outline.visible=false;
  if(mode==='vector'){this.setView('3d');return;}
  this.setView('3d');this.evidence=evidenceGraph(data,mode==='segments');this.world.add(this.evidence);const box=new THREE.Box3().setFromObject(this.evidence);if(!box.isEmpty()){const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();this.orbit.maxDistance=Math.max(30,size*4);this.camera.far=Math.max(100,size*8);this.camera.updateProjectionMatrix();this.orbit.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(size*.6,-size*.7,size*.5));this.orbit.update();}}
 hideEvidence(){clearEvidence(this);this.evidenceMode=null;this.graph.root.visible=true;this.setView('3d');this.updateSelection();}
 async exportGLB(){if((await Promise.all(this.modelLoads)).some(ok=>!ok))throw new Error('有家具三维文件未成功载入，请先导出 JSON 保存后再检查模型');return exportGraph(this.graph);}
}
