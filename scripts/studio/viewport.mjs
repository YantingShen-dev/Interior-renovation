import {QuickRender} from './quick-render.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {buildRoomGraph,disposeGraph,setCutaway,selectionOutline,floorPick,furnitureFromRay,entityFromRay,addStudioLighting,makeCameras,insideWalkable,visibleObject,eyeHeight,walkStart,sunAngles} from './scene.mjs';
import state from './state.cjs';
import {setModelDetail,setPlanFloor,lowDetailMode,fullDetailScope} from './display-quality.mjs';
import {attachAssetModel,reuseAssetModels,exportGraph,clearModelCache} from './models.mjs';
const {F,G,copy,fromTransform}=state;
export class Viewport{
 constructor(element,store,events={}){
  this.element=element;this.store=store;this.events=events;this.mode='3d';this.tool='select';this.axis=null;this.snap=true;this.gridSize=.05;this.fine=false;this.cutaway=true;this.showZones=false;this.keys=new Set();this.labels=[];this.drag=null;this.transaction=null;this.measureStart=null;this.measureEnd=null;this.quality='high';this.renderPreview=false;this.needsRender=true;
  this.world=new THREE.Scene();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','Three.js 三维房间视图');element.prepend(this.renderer.domElement);
  this.renderer.debug.onShaderError=(gl,program)=>this.events.fatal?.('三维着色器未能完成编译：'+(gl.getProgramInfoLog(program)||'当前图形环境不支持所需渲染能力'));
  this.renderer.domElement.addEventListener('webglcontextlost',()=>this.events.fatal?.('三维渲染上下文已中断，请先导出方案，再重新打开页面。'));
  this.environment=addStudioLighting(this.world,this.renderer);this.raycaster=new THREE.Raycaster();this.grid=new THREE.GridHelper(20,200,'#aaaaaa','#bbbbbb');this.grid.rotation.x=Math.PI/2;this.grid.position.z=.006;this.grid.material.transparent=true;this.grid.material.opacity=.13;this.grid.visible=false;this.world.add(this.grid);
  this.rebuild();this.cameras=makeCameras(store.scene.room,element.clientWidth/Math.max(1,element.clientHeight));this.camera=this.cameras.perspective;
  this.gizmo=new TransformControls(this.camera,this.renderer.domElement);this.gizmo.setSize(.75);this.world.add(this.gizmo.getHelper());this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.configureOrbit();this.orbit.target.copy(this.cameras.center);this.orbit.update();
  this.gizmo.addEventListener('dragging-changed',e=>{if(e.value){this.transaction={before:copy(this.store.scene),id:this.store.selected,last:copy(this.store.scene),errors:[]};this.orbit.enabled=false;}else {this.orbit.enabled=this.mode!=='human';this.finishTransform();}});
  this.gizmo.addEventListener('objectChange',()=>this.previewTransform());this.bind();this.resize();this.updateSelection();this.setTool('select');this.previousTime=performance.now();this.renderer.setAnimationLoop(time=>this.frame(time));
 }
 configureOrbit(){this.orbit.enableDamping=true;this.orbit.dampingFactor=.09;this.orbit.minDistance=.4;this.orbit.maxDistance=30;this.orbit.maxPolarAngle=this.mode==='2d'?Math.PI:Math.PI/2-.025;this.orbit.screenSpacePanning=true;this.orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};this.orbit.addEventListener('change',()=>{this.needsRender=true;this.cameraMovingUntil=performance.now()+220;});}
 rebuild(data=this.store.scene,{fullModels=false}={}){
  const detailed=this.quality!=='fast'||fullModels;
  this.needsRender=true;this.pendingPreview=null;this.gizmo?.detach();const previous=this.graph,next=buildRoomGraph(data),reused=detailed?reuseAssetModels(previous,next,data):new Set();if(previous){this.world.remove(previous.root);disposeGraph(previous.root);}this.graph=next;this.world.add(next.root);this.rebuildZones();
  this.modelLoads=[...(this.graph.textureLoads||[])];for(const f of detailed?data.furniture:[]){const asset=F.asset(data,f.asset_id);if(asset.model_glb)this.modelLoads.push(reused.has(f.id)?Promise.resolve(true):attachAssetModel(this.graph.furniture.get(f.id),asset,f.dimensions,f.material_override,f.surface_material).then(()=>{this.needsRender=true;return true;}).catch(e=>{this.events.toast?.('三维家具载入失败，显示尺寸占位：'+e.message,true);return false;}));}Promise.all(this.graph.textureLoads||[]).then(()=>{this.needsRender=true;});
  if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);this.outline=null;}this.updateSelection();
  if(this.renderPreview)this.environment.setPreview(true,data);
  if(this.mode==='human')this.setEyeHeight(data.render_settings?.eye_height_m??1.6);
 }
 rebuildZones(){
  if(this.zones){this.world.remove(this.zones);disposeGraph(this.zones);}this.zones=new THREE.Group();
  for(const zone of F.doorZones(this.store.scene,this.store.scene.layout_settings.clearance_m||.8)){
   const shape=new THREE.Shape(zone.polygon.map(p=>new THREE.Vector2(...p))),mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#888888',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));mesh.position.z=.012;this.zones.add(mesh);
   const points=[...zone.polygon,zone.polygon[0]].map(p=>new THREE.Vector3(...p,.014)),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:'#777777',dashSize:.06,gapSize:.035,transparent:true,opacity:.55}));line.computeLineDistances();this.zones.add(line);
  }this.zones.visible=this.showZones;this.world.add(this.zones);
 }
 resize(){this.needsRender=true;const W=Math.max(1,this.element.clientWidth),H=Math.max(1,this.element.clientHeight);this.renderer.setSize(W,H);this.quickRender?.resize(W,H);if(this.cameras){this.cameras.perspective.aspect=W/H;if(this.focalCamera===this.cameras.perspective)this.cameras.perspective.setFocalLength(this.focalValue);else this.cameras.perspective.updateProjectionMatrix();this.events.focal?.(this.cameras.perspective.getFocalLength());const room=this.store.scene.room,span=Math.max(room.width+.8,(room.length+.8)/(W/H)),top=this.cameras.top;top.left=-span*(W/H)/2;top.right=span*(W/H)/2;top.top=span/2;top.bottom=-span/2;top.updateProjectionMatrix();}}
 setView(mode){
  if(mode!=='human'&&document.pointerLockElement===this.renderer.domElement)document.exitPointerLock?.();
  this.cancel();this.mode=mode;if(mode==='2d'&&this.store.current()?.mount==='ceiling'){this.store.selected=null;this.events.select?.(null);}const room=this.store.scene.room;
  if(mode==='2d'){this.camera=this.cameras.top;this.camera.position.set(this.cameras.center.x,this.cameras.center.y,15);this.camera.lookAt(this.cameras.center.x,this.cameras.center.y,0);this.camera.zoom=1;this.camera.updateProjectionMatrix();}
  else {this.camera=this.cameras.perspective;if(mode==='human'){const start=walkStart(this.store.scene,eyeHeight(this.store.scene,this.store.scene.render_settings?.eye_height_m));if(!start){this.events.toast?.('空间内没有足够的漫游位置，请先调整布局',true);this.mode='3d';return this.setView('3d');}this.camera.position.copy(start);this.lookYaw=Math.PI;this.lookPitch=-.08;this.updateLook();}else {const d=Math.max(room.length,room.width,room.height)*Math.max(1,1/Math.max(.35,this.element.clientWidth/Math.max(1,this.element.clientHeight)))*1.12;this.camera.position.copy(this.cameras.center).add(new THREE.Vector3(d*.95,-d*1.25,d*.95));this.camera.lookAt(this.cameras.center);}}
  this.orbit.dispose();this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.configureOrbit();this.orbit.enabled=mode!=='human';this.orbit.enableRotate=mode!=='2d';this.orbit.target.copy(mode==='2d'?new THREE.Vector3(this.cameras.center.x,this.cameras.center.y,0):this.cameras.center);if(mode==='human')this.updateLook();else this.orbit.update();this.gizmo.camera=this.camera;this.setTool(mode==='human'?'select':this.tool);this.resize();this.events.view?.(mode);
 }
 fit(){if(this.mode==='human'){this.setView('3d');return;}this.setView(this.mode);}
 focus(){const f=this.store.current();if(!f)return;const p=F.pose(this.store.scene,f),target=new THREE.Vector3(...p.position);target.z+=f.dimensions[2]*.5;if(this.mode==='human'){this.camera.lookAt(target);return;}this.orbit.target.copy(target);if(this.mode==='2d'){this.camera.position.x=target.x;this.camera.position.y=target.y;this.camera.zoom=1.6;this.camera.updateProjectionMatrix();}else {const offset=new THREE.Vector3(1,-1,.8).normalize().multiplyScalar(Math.max(...f.dimensions)*3+.9);this.camera.position.copy(target).add(offset);}this.orbit.update();}
 setTool(tool){
  if(this.renderPreview&&['move','rotate','scale','measure'].includes(tool))this.setRenderPreview(false);
  if(this.transaction||this.drag&&!this.drag.walk)this.cancel();if(this.mode==='human')tool='select';const previous=this.tool;this.tool=tool;if(previous!==tool){this.axis=tool==='rotate'?'Z':null;this.events.axis?.(this.axis);}
  if(this.orbit){this.orbit.mouseButtons.LEFT=tool==='orbit'?THREE.MOUSE.ROTATE:tool==='pan'?THREE.MOUSE.PAN:null;this.orbit.enableRotate=this.mode!=='2d';}
  this.element.style.cursor=tool==='measure'?'crosshair':tool==='pan'?'grab':tool==='orbit'?'grab':'default';this.updateSelection();this.events.tool?.(tool);
 }
 updateSelection(){
  if(!this.graph)return;if(this.lastSelection!==this.store.selected){this.lastSelection=this.store.selected;this.axis=this.tool==='rotate'?'Z':null;this.events.axis?.(this.axis);}if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);this.outline=null;}
  const f=this.store.current();if(f){this.outline=selectionOutline(this.store.scene,f);this.world.add(this.outline);}else if(this.store.selected&&this.graph.entities.has(this.store.selected)){this.outline=new THREE.BoxHelper(this.graph.entities.get(this.store.selected),'#0058a3');this.world.add(this.outline);}
  if(!this.gizmo)return;this.gizmo.detach();const group=f&&this.graph.furniture.get(f.id);if(!group||this.mode==='human')return;
  if(['move','rotate','scale'].includes(this.tool)){
   if(f.mount==='wall'&&!f.free_position&&this.tool==='rotate'){this.events.toast?.('挂墙家具沿墙定向，可调整所属墙和沿墙位置');return;}
   const mode={move:'translate',rotate:'rotate',scale:'scale'}[this.tool];this.gizmo.attach(group);this.gizmo.setMode(mode);this.gizmo.setSpace(this.tool==='scale'||f.mount==='wall'&&!f.free_position?'local':'world');
   const axis=this.axis;this.gizmo.showX=this.tool!=='rotate'&&(!axis||axis==='X');this.gizmo.showY=this.tool!=='rotate'&&(f.mount!=='wall'||!!f.free_position)&&(!axis||axis==='Y');this.gizmo.showZ=this.tool==='rotate'||(this.tool==='scale'||f.mount==='wall'||!!f.free_position)&&(!axis||axis==='Z');
   this.gizmo.showXY=!axis&&this.tool==='move'&&(f.mount!=='wall'||!!f.free_position);this.gizmo.showXZ=this.gizmo.showYZ=false;this.gizmo.showE=this.gizmo.showXYZE=false;
   this.gizmo.setTranslationSnap(this.snap&&!this.fine?this.gridSize:null);this.gizmo.setRotationSnap(this.snap&&!this.fine?Math.PI/12:null);this.gizmo.setScaleSnap(this.snap&&!this.fine ? .05 : null);
  }
 }
 setAxis(axis){const f=this.store.current();if(this.tool==='rotate'&&axis!=='Z'){this.events.toast?.('当前绕 Z 轴旋转，保持家具的落地或顶装方向');return;}if(axis==='Z'&&f&&!f.free_position&&f.mount!=='wall'&&this.tool==='move'){this.events.toast?.('落地和顶装家具保持贴合，当前可沿 X / Y 移动');return;}this.axis=this.axis===axis?null:axis;this.updateSelection();this.events.axis?.(this.axis);}
 mouseRay(event){const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);return this.raycaster;}
 select(id){this.store.selected=id;this.updateSelection();this.events.select?.(id);}
 previewTransform(){
  if(!this.transaction)return;const group=this.gizmo.object;if(!group)return;
  const result=fromTransform(this.transaction.before,this.transaction.id,{position:group.position.toArray(),rotation:group.rotation.z,scale:group.scale.toArray()},this.gizmo.mode,{snap:this.snap&&!this.fine,grid:this.gridSize,axis:this.axis||(['X','Y','Z'].includes(this.gizmo.axis)?this.gizmo.axis:null)});
  if(!result.errors.length){const furniture=result.scene.furniture.find(f=>f.id===this.transaction.id);group.position.fromArray(F.pose(result.scene,furniture).position);group.updateMatrixWorld(true);}
  this.transaction.last=result.scene;this.transaction.errors=result.errors;this.previewOutline(result.scene,result.errors.length>0);this.pendingPreview={scene:result.scene,hints:result.hints,errors:result.errors};this.needsRender=true;
 }
 previewOutline(scene,invalid){this.needsRender=true;if(this.outline){this.world.remove(this.outline);disposeGraph(this.outline);}const f=scene.furniture.find(f=>f.id===this.store.selected);if(f){this.outline=selectionOutline(scene,f,invalid?'#bf6d56':'#222222');this.world.add(this.outline);}}
 finishTransform(){if(!this.transaction)return;const transaction=this.transaction;this.transaction=null;if(transaction.errors.length){this.events.toast?.(transaction.errors[0],true);this.rebuild();return;}if(this.store.commit(transaction.last,transaction.before))this.events.change?.();else this.rebuild();}
 cancel(){
  if(this.transaction){const before=this.transaction.before;this.transaction=null;this.store.scene=before;if(this.gizmo?.dragging)this.gizmo.reset();this.rebuild();}
  if(this.drag){this.drag=null;this.rebuild();}this.measureStart=null;this.keys.clear();if(this.orbit)this.orbit.enabled=this.mode!=='human';
 }
 measure(event){this.needsRender=true;const hits=this.mouseRay(event).intersectObject(this.graph.root,true).filter(hit=>visibleObject(hit.object)),point=hits[0]?.point||floorPick(this.raycaster);if(!point)return;
  if(!this.measureStart){this.measureStart=point.clone();this.events.toast?.('已取起点，再点一个位置完成测距');return;}
  if(this.measureLine){this.world.remove(this.measureLine);disposeGraph(this.measureLine);}
  this.measureEnd=point.clone();this.measureLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.measureStart,this.measureEnd]),new THREE.LineBasicMaterial({color:'#444444',depthTest:false}));this.measureLine.renderOrder=150;this.world.add(this.measureLine);this.lastMeasurement={point:this.measureStart.clone().add(this.measureEnd).multiplyScalar(.5),text:this.measureStart.distanceTo(this.measureEnd).toFixed(3)+' m'};this.events.toast?.('测量距离 '+this.lastMeasurement.text);this.measureStart=null;
 }
 bind(){
  const canvas=this.renderer.domElement;this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.element);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
   canvas.focus({preventScroll:true});if(event.button===1)this.orbit.mouseButtons.MIDDLE=event.shiftKey?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
   if(event.button!==0)return;if(this.mode==='human'){this.drag={walk:true,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();return;}if(this.renderPreview)return;
   if(this.gizmo.axis&&this.gizmo.enabled)return;if(['orbit','pan'].includes(this.tool))return;
   if(this.tool==='measure'){this.measure(event);return;}
   const ray=this.mouseRay(event),id=entityFromRay(ray,this.graph);
   if(!id){this.select(null);return;}this.select(id);
   if((this.tool==='select'||this.tool==='move')&&this.store.current()){
    const f=this.store.current(),planeZ=F.pose(this.store.scene,f).position[2],point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-planeZ),new THREE.Vector3());
    if(point){this.drag={before:copy(this.store.scene),id,start:point,planeZ,client:[event.clientX,event.clientY],candidate:null,errors:[]};this.orbit.enabled=false;canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();}
   }
  },true);
  canvas.addEventListener('pointermove',event=>{
   if(this.drag?.walk){if(!(event.buttons&1)){this.drag=null;return;}this.lookYaw-=(event.clientX-this.drag.x)*.004;this.lookPitch=Math.max(-1.2,Math.min(1.2,this.lookPitch-(event.clientY-this.drag.y)*.004));this.drag.x=event.clientX;this.drag.y=event.clientY;this.updateLook();return;}
   if(!this.drag||this.gizmo.dragging)return;
   if(Math.hypot(event.clientX-this.drag.client[0],event.clientY-this.drag.client[1])<3)return;
   const ray=this.mouseRay(event),point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-this.drag.planeZ),new THREE.Vector3());if(!point)return;
   const source=this.drag.before.furniture.find(f=>f.id===this.drag.id),pose=F.pose(this.drag.before,source),delta=point.clone().sub(this.drag.start);let axis=this.axis;if(event.shiftKey&&!axis)axis=Math.abs(delta.x)>Math.abs(delta.y)?'X':'Y';if(axis==='X')delta.y=0;if(axis==='Y')delta.x=0;
   const result=fromTransform(this.drag.before,this.drag.id,{position:[pose.position[0]+delta.x,pose.position[1]+delta.y,pose.position[2]]},'translate',{snap:this.snap&&!event.shiftKey,grid:this.gridSize,axis});this.drag.candidate=result.scene;this.drag.errors=result.errors;
   const f=result.scene.furniture.find(f=>f.id===source.id),p=F.pose(result.scene,f),group=this.graph.furniture.get(f.id);group.position.fromArray(p.position);group.updateMatrixWorld(true);this.previewOutline(result.scene,result.errors.length>0);this.pendingPreview={scene:result.scene,hints:result.hints,errors:result.errors};this.needsRender=true;
  });
  canvas.addEventListener('pointerup',()=>{
   if(!this.drag)return;const drag=this.drag;this.drag=null;this.orbit.enabled=this.mode!=='human';if(drag.walk)return;
   if(drag.candidate&&!drag.errors.length){if(this.store.commit(drag.candidate,drag.before))this.events.change?.();else this.rebuild();}else {if(drag.errors.length)this.events.toast?.(drag.errors[0],true);this.rebuild();this.events.preview?.(this.store.scene,[],[]);}
  });
  canvas.addEventListener('pointercancel',()=>{this.cancel();this.orbit.enabled=this.mode!=='human';});
  canvas.addEventListener('lostpointercapture',()=>{if(this.drag?.walk)this.drag=null;});
  window.addEventListener('blur',()=>{if(this.drag?.walk)this.drag=null;this.keys.clear();});
  document.addEventListener('focusin',event=>{if(event.target!==canvas)this.keys.clear();});
  this.element.addEventListener('dragover',event=>event.preventDefault());this.element.addEventListener('drop',event=>{event.preventDefault();const asset=event.dataTransfer.getData('application/x-room-asset');if(!asset)return;const point=floorPick(this.mouseRay(event));try{if(this.events.addAsset)this.events.addAsset(asset,point?[point.x,point.y]:null);else{this.store.add(asset,point?[point.x,point.y]:null);this.events.change?.();this.setTool('move');}}catch(error){this.events.toast?.(error.message,true);}});
 }
 updateLook(){const direction=new THREE.Vector3(Math.cos(this.lookYaw)*Math.cos(this.lookPitch),Math.sin(this.lookYaw)*Math.cos(this.lookPitch),Math.sin(this.lookPitch));this.camera.lookAt(this.camera.position.clone().add(direction));}
 updateWalking(delta){if(this.mode!=='human')return;const speed=(this.keys.has('shift')?1.6:.8)*delta,forward=new THREE.Vector3(Math.cos(this.lookYaw),Math.sin(this.lookYaw),0),side=new THREE.Vector3(-Math.sin(this.lookYaw),Math.cos(this.lookYaw),0),movement=new THREE.Vector3();if(this.keys.has('w'))movement.add(forward);if(this.keys.has('s'))movement.sub(forward);if(this.keys.has('a'))movement.add(side);if(this.keys.has('d'))movement.sub(side);if(movement.lengthSq()){movement.normalize().multiplyScalar(speed);const next=this.camera.position.clone().add(movement);if(insideWalkable(this.store.scene,next)){this.camera.position.copy(next);this.updateLook();}}}
 frame(time){
  if(document.hidden||document.body.dataset.page&&document.body.dataset.page!=='editor'){this.previousTime=time;return;}
  try{
   const delta=Math.min((time-this.previousTime)/1000,.05);this.previousTime=time;this.updateWalking(delta);if(this.mode!=='human'&&this.orbit.update())this.needsRender=true;
   const active=!!(this.transaction||this.drag||this.keys.size||time<(this.cameraMovingUntil||0)),low=lowDetailMode(this.quality,this.mode,active,this.renderPreview);
   const key=[this.mode,this.cutaway,this.showNames,this.showZones,this.grid.visible,this.store.selected,this.renderPreview,this.tool,this.axis,this.quality,this.camera.zoom,this.camera.fov].join('|');
   if(key!==this.lastRenderKey||this.graph.lowDetail!==low||active||this.renderPreview)this.needsRender=true;
   if(!this.needsRender||Number.isFinite(this.lastRenderTime)&&time-this.lastRenderTime<1000/(active?45:30))return;
   setModelDetail(this.graph,low);setPlanFloor(this.graph,this.mode==='2d'&&!this.renderPreview);
   const ratio=Math.min(window.devicePixelRatio||1,this.quality==='fast'||this.renderPreview?1:1.5);if(this.renderer.getPixelRatio()!==ratio){this.renderer.setPixelRatio(ratio);this.resize();}this.renderer.shadowMap.enabled=!!this.renderPreview;
   setCutaway(this.graph,this.store.scene,this.camera.position,{enabled:this.cutaway,human:this.mode==='human',plan:this.mode==='2d'});
   if(this.renderPreview)for(const o of [this.gizmo.getHelper(),this.outline,this.zones,this.grid,this.measureLine,this.environment.grid])if(o)o.visible=false;
   this.renderFrame();this.updateLabels();this.needsRender=false;this.lastRenderTime=time;this.lastRenderKey=key;
   if(this.pendingPreview&&time-(this.lastPreviewTime||0)>60){const p=this.pendingPreview;this.pendingPreview=null;this.lastPreviewTime=time;this.events.preview?.(p.scene,p.hints,p.errors);}
   if(!this.firstFrame){this.firstFrame=true;this.events.ready?.();}
  }catch(error){this.renderer.setAnimationLoop(null);this.events.fatal?.(error.message);}
 }
 setQuality(value){if(!['fast','high'].includes(value)||value===this.quality)return;this.quality=value;this.needsRender=true;if(value==='fast')clearModelCache();this.rebuild?.();}
 toScreen(point){const p=point.clone().project(this.camera);return {x:(p.x+1)/2*this.element.clientWidth,y:(1-p.y)/2*this.element.clientHeight,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1};}
 updateLabels(){
  const room=this.store.scene.room,labels=[];
  if(this.mode!=='human'){labels.push({point:new THREE.Vector3((room.origin?.[0]||0)+room.length/2,(room.origin?.[1]||0)-.16,0),text:room.length.toFixed(2)+' m',type:'room'},{point:new THREE.Vector3((room.origin?.[0]||0)-.16,(room.origin?.[1]||0)+room.width/2,0),text:room.width.toFixed(2)+' m',type:'room'});}
  const preview=this.transaction?.last||this.drag?.candidate||this.store.scene,f=preview.furniture.find(f=>f.id===this.store.selected);if(f&&this.mode!=='human'){const p=F.pose(preview,f),group=this.graph.furniture.get(f.id);if(group){const point=new THREE.Vector3(...p.position);point.z+=f.dimensions[2]+.15;labels.push({point,text:f.dimensions.map(v=>Math.round(v*100)).join(' × ')+' cm',type:'selected'});this.events.context?.(this.toScreen(point));}}
  if(this.showNames&&this.mode==='2d')for(const f of preview.furniture){if(f.mount==='ceiling')continue;const p=F.pose(preview,f);labels.push({point:new THREE.Vector3(p.position[0],p.position[1],.05),text:f.label.replace(/^IKEA /,''),type:'name'});}
  if(this.lastMeasurement)labels.push({...this.lastMeasurement,type:'measurement'});this.events.labels?.(labels.map(label=>({...this.toScreen(label.point),text:label.text,type:label.type})));
 }
 renderFrame(){if(this.renderPreview&&this.quickRender)this.quickRender.render(this.camera);else this.renderer.render(this.world,this.camera);}
 setExposure(value){this.needsRender=true;const next=Number.isFinite(value)?Math.max(.1,Math.min(4,value)):this.renderer.toneMappingExposure;this.renderer.toneMappingExposure=next;return next;}
 setEyeHeight(value){this.needsRender=true;const height=eyeHeight(this.store.scene,value);if(this.mode==='human'){this.camera.position.z=height;this.updateLook();}this.events.eyeHeight?.(height);return height;}
 setFocalLength(value){const camera=this.cameras.perspective,focal=Number.isFinite(value)?Math.max(10,Math.min(200,value)):camera.getFocalLength();this.focalCamera=camera;this.focalValue=focal;camera.setFocalLength(focal);this.needsRender=true;this.events.focal?.(focal);return focal;}
 sunAngles(){return sunAngles(this.store.scene);}
 previewSun(angles){if(this.renderPreview){this.environment.setPreview(true,this.store.scene,angles);this.needsRender=true;}}
 setRenderPreview(enabled){
  if(this.renderPreview===enabled)return;this.renderPreview=enabled;this.needsRender=true;
  if(enabled){this.quickRender||=new QuickRender(this.renderer,this.world,this.camera);this.previewSettings={grid:this.grid.visible,zones:this.zones.visible,environmentGrid:this.environment.grid.visible,tool:this.tool};this.setTool('orbit');this.renderer.setPixelRatio(1);}
  else{this.quickRender?.dispose();this.quickRender=null;this.grid.visible=this.previewSettings?.grid||false;this.zones.visible=this.previewSettings?.zones||false;this.environment.grid.visible=this.previewSettings?.environmentGrid??true;this.gizmo.getHelper().visible=true;this.setTool(this.previewSettings?.tool||'select');this.updateSelection();this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));}
  this.environment.setPreview(enabled,this.store.scene);this.resize();this.events.renderMode?.(enabled);
 }
 captureView(){return {mode:this.mode,position:this.camera.position.toArray(),target:this.mode==='human'?this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3())).toArray():this.orbit.target.toArray(),focal:this.cameras.perspective.getFocalLength(),zoom:this.camera.zoom,yaw:this.lookYaw||0,pitch:this.lookPitch||0,cutaway:this.cutaway};}
 restoreView(view){this.setView(view.mode);this.camera.position.fromArray(view.position);this.orbit.target.fromArray(view.target);this.cameras.perspective.setFocalLength(view.focal);this.focalCamera=this.cameras.perspective;this.focalValue=view.focal;this.events.focal?.(view.focal);this.camera.zoom=view.zoom;this.camera.updateProjectionMatrix();this.cutaway=view.cutaway!==false;if(view.mode==='human'){this.lookYaw=view.yaw;this.lookPitch=view.pitch;this.updateLook();}else{this.orbit.enableDamping=false;this.orbit.update();this.orbit.enableDamping=true;}this.updateSelection();}
 cameraAngles(){const d=this.camera.position.clone().sub(this.orbit.target);return {focal:this.cameras.perspective.getFocalLength(),yaw:Math.atan2(d.y,d.x)*180/Math.PI,elevation:Math.atan2(d.z,Math.hypot(d.x,d.y))*180/Math.PI};}
 applyCameraAngles(focal,yaw,elevation){if(![focal,yaw,elevation].every(Number.isFinite)||focal<10||focal>200||Math.abs(yaw)>360||Math.abs(elevation)>85)throw new Error('焦距为 10–200mm，水平角为 ±360°，俯仰角为 ±85°');if(this.mode!=='3d')this.setView('3d');const distance=this.camera.position.distanceTo(this.orbit.target),a=yaw*Math.PI/180,e=elevation*Math.PI/180;this.camera.position.copy(this.orbit.target).add(new THREE.Vector3(Math.cos(a)*Math.cos(e),Math.sin(a)*Math.cos(e),Math.sin(e)).multiplyScalar(distance));this.setFocalLength(focal);this.orbit.maxPolarAngle=Math.PI-.025;this.orbit.enableDamping=false;this.orbit.update();this.orbit.enableDamping=true;}
 snapshot(){const restore=fullDetailScope(this.graph);try{setCutaway(this.graph,this.store.scene,this.camera.position,{enabled:this.cutaway,human:this.mode==='human',plan:this.mode==='2d'});this.renderFrame();return this.renderer.domElement.toDataURL('image/png');}finally{restore();this.needsRender=true;}}
 async fullModelScope(){const temporary=this.quality==='fast',restore=()=>{if(temporary){if(this.quality==='fast')clearModelCache();this.rebuild();}};if(temporary)this.rebuild(this.store.scene,{fullModels:true});try{if((await Promise.all(this.modelLoads)).some(ok=>!ok))throw new Error('有家具三维文件未成功载入，请先导出 JSON 保存后再检查模型');}catch(error){restore();throw error;}return restore;}
 async imageSnapshot(){const restore=await this.fullModelScope();try{return this.snapshot();}finally{restore();}}
 async referenceSnapshot(){const restore=await this.fullModelScope(),hidden=[this.gizmo.getHelper(),this.outline,this.zones,this.grid,this.measureLine,this.environment.grid].filter(Boolean),visibility=hidden.map(o=>o.visible);try{hidden.forEach(o=>o.visible=false);return this.snapshot();}finally{hidden.forEach((o,i)=>o.visible=visibility[i]);restore();}}
 async exportGLB(){const restore=await this.fullModelScope();try{return await exportGraph(this.graph);}finally{restore();}}
}
