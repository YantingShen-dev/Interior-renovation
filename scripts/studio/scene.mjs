import {surfaceTexture} from './surface-texture.mjs';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import model from './state.cjs';
import plan from '../plan_geometry.js';
import materials from './materials.cjs';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const {G,F}=model;
THREE.Object3D.DEFAULT_UP.set(0,0,1);

export function buildRoomGraph(data){
 const root=new THREE.Group(),entities=new Map(),furniture=new Map(),textureLoads=[];root.name='editable_room';
 const source=new Map([...data.walls,...data.openings,...(data.furniture||[])].map(e=>[e.id,e]));
 for(const part of G.buildParts(data)){
  let group=entities.get(part.parent);const entity=source.get(part.parent);
  if(!group){group=new THREE.Group();group.name=part.parent;group.userData={id:part.parent,kind:entity?.kind||part.parent,wall_id:entity?.wall_id};root.add(group);entities.set(part.parent,group);
   if(entity?.kind==='furniture'){const pose=F.pose(data,entity);group.position.fromArray(pose.position);group.rotation.z=THREE.MathUtils.degToRad(pose.rotation_deg);furniture.set(entity.id,group);}
  }
  const finish=materials.forPart(data,part),color=finish?.color||entity?.material_override||part.color;
  const defaults=part.role==='glass'?materials.presets.glass:entity?.subtype==='elevator'&&part.role==='door'?materials.presets.metal:materials.presets.matte;
  const p={...defaults,...finish};
  const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color(...color.slice(0,3)),roughness:p.roughness,metalness:p.metalness,transparent:p.opacity<1,opacity:p.opacity,transmission:p.transmission||0,ior:p.ior||1.5,thickness:.02,depthWrite:p.opacity>=.5,side:THREE.DoubleSide});
  if(finish&&typeof document!=='undefined')textureLoads.push(surfaceTexture(material,finish));
  for(const box of part.boxes){
   const radius=part.role==='furniture'?Math.min(.004,...box.size.map(v=>v*.12)):0;
   const geometry=box.vertices?(()=>{const data=G.partTriangles({boxes:[box]}),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(data.positions.flatMap((v,i)=>i%3===2?[]:[v]),2));return g;})():radius?new RoundedBoxGeometry(...box.size,2,radius):new THREE.BoxGeometry(...box.size);
   if(finish&&['wall','floor'].includes(part.role)){const positions=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++){if(part.role==='floor')uv.setXY(i,positions.getX(i)+box.center[0],positions.getY(i)+box.center[1]);else{const wall=data.walls.find(w=>w.id===part.parent),u=(box.center[0]-wall.start[0])*Math.cos(box.yaw)+(box.center[1]-wall.start[1])*Math.sin(box.yaw);uv.setXY(i,positions.getX(i)+u,positions.getZ(i)+box.center[2]);}}uv.needsUpdate=true;}
   const mesh=new THREE.Mesh(geometry,material);mesh.name=part.id;mesh.userData={id:part.parent,role:part.role};
   if(entity?.kind==='furniture'){
    const pose=F.pose(data,entity),a=-THREE.MathUtils.degToRad(pose.rotation_deg),dx=box.center[0]-pose.position[0],dy=box.center[1]-pose.position[1];
    mesh.position.set(dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a),box.center[2]-pose.position[2]);mesh.rotation.z=box.yaw-THREE.MathUtils.degToRad(pose.rotation_deg);
   }else {mesh.position.fromArray(box.center);mesh.rotation.z=box.yaw;}
   mesh.castShadow=part.role!=='glass'&&part.role!=='floor';mesh.receiveShadow=true;group.add(mesh);
  }
 }
 root.updateMatrixWorld(true);return {root,entities,furniture,textureLoads};
}

export function disposeGraph(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{o.userData.disposed=true;if(o.geometry)geometries.add(o.geometry);for(const material of [o.material,o.planOriginalMaterial,o.planOverlayMaterial])if(material)for(const m of Array.isArray(material)?material:[material])materials.add(m);});for(const g of geometries)g.dispose();const textures=new Set();for(const m of materials){m.userData.disposed=true;for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}for(const texture of textures)texture.dispose();}

export function setCutaway(graph,data,cameraPosition,{enabled=true,ceiling=false,human=false,plan=false}={}){
 const view=new THREE.Vector2(cameraPosition.x-(data.room.origin?.[0]||0)-data.room.length/2,cameraPosition.y-(data.room.origin?.[1]||0)-data.room.width/2);
 for(const [id,group]of graph.entities){
  const item=data.furniture?.find(f=>f.id===id);
  if(item){group.visible=!(plan&&item.mount==='ceiling');continue;}
  if(id==='ceiling'){group.visible=human||ceiling;continue;}
  const wall=data.walls.find(w=>w.id===id)||data.walls.find(w=>w.id===data.openings.find(o=>o.id===id)?.wall_id);
  group.visible=plan||!wall||wall.interior||human||!enabled||wall.outward[0]*view.x+wall.outward[1]*view.y<=.01;
 }
}

export function selectionOutline(data,furniture,color='#222222'){
 const pose=F.pose(data,furniture),geometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(...furniture.dimensions)),outline=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}));
 const root=new THREE.Group();root.position.fromArray(pose.position);root.rotation.z=THREE.MathUtils.degToRad(pose.rotation_deg);outline.position.z=furniture.dimensions[2]/2;root.add(outline);root.renderOrder=100;outline.renderOrder=100;return root;
}

export function floorPick(raycaster){return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());}
export function visibleObject(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
function visibleHits(raycaster,graph){const meshes=[];graph.root.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});return raycaster.intersectObjects(meshes,false);}
export function entityFromRay(raycaster,graph){return visibleHits(raycaster,graph)[0]?.object.userData.id||null;}
export function furnitureFromRay(raycaster,graph){const first=visibleHits(raycaster,graph).find(hit=>hit.object.userData.role!=='glass');return first&&graph.furniture.has(first.object.userData.id)?first.object.userData.id:null;}

export function sunAngles(data){
 const saved=data.render_settings?.sun;
 if(saved&&Number.isFinite(saved.azimuth)&&Number.isFinite(saved.elevation))return {azimuth:Math.max(0,Math.min(360,saved.azimuth)),elevation:Math.max(5,Math.min(85,saved.elevation))};
 const room=data.room,cx=(room.origin?.[0]||0)+room.length/2,cy=(room.origin?.[1]||0)+room.width/2,direction=new THREE.Vector3(-.5,-.7,0);
 const window=data.openings.filter(o=>o.kind==='window').sort((a,b)=>b.width*b.height-a.width*a.height)[0],wall=window&&data.walls.find(w=>w.id===window.wall_id);
 if(wall){const dx=wall.end[0]-wall.start[0],dy=wall.end[1]-wall.start[1],length=Math.hypot(dx,dy);if(length>0){const px=wall.start[0]+dx/length*(window.u+window.width/2),py=wall.start[1]+dy/length*(window.u+window.width/2);direction.set(-dy/length,dx/length,0);if(direction.x*(px-cx)+direction.y*(py-cy)<0)direction.negate();}}
 return {azimuth:Math.round((THREE.MathUtils.radToDeg(Math.atan2(direction.y,direction.x))+360)%360),elevation:49};
}
export function addStudioLighting(world,renderer){
 world.background=new THREE.Color('#ffffff');
 const sky=new THREE.HemisphereLight('#ffffff','#999999',2.5);sky.position.set(0,0,10);world.add(sky);
 const ambient=new THREE.AmbientLight('#ffffff',.3);world.add(ambient);
 const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(-3,-4,8);sun.castShadow=false;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;sun.shadow.camera.near=.2;sun.shadow.camera.far=24;sun.shadow.normalBias=.025;sun.shadow.bias=-.00008;sun.target.position.set(2,.9,.7);world.add(sun,sun.target);
 const fill=new THREE.DirectionalLight('#eeeeee',.9);fill.position.set(5,5,5);world.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#efede8',roughness:1}));ground.position.z=-.065;ground.receiveShadow=true;ground.userData.environment=true;world.add(ground);
 const grid=new THREE.GridHelper(20,40,'#bcbcbc','#d0d0d0');grid.rotation.x=Math.PI/2;grid.position.z=-.062;grid.material.transparent=true;grid.material.opacity=.22;world.add(grid);
 if(renderer){renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;}
 let reflection=null;
 const original={position:sun.position.clone(),target:sun.target.position.clone(),environment:world.environment,environmentIntensity:world.environmentIntensity};
 function setPreview(enabled,data,angles=sunAngles(data)){
  if(enabled&&renderer&&!reflection){const pmrem=new THREE.PMREMGenerator(renderer),studio=new RoomEnvironment();try{reflection=pmrem.fromScene(studio,.04);}finally{studio.dispose();pmrem.dispose();}}
  world.environment=enabled&&reflection?reflection.texture:original.environment;sun.castShadow=enabled;if(renderer)renderer.shadowMap.enabled=enabled;
  if(!enabled&&sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
  sky.intensity=enabled?1.2:2.5;ambient.intensity=enabled?.18:.3;fill.intensity=enabled?.45:.9;sun.intensity=enabled?3.4:3;sun.shadow.radius=enabled?3:1;sun.shadow.normalBias=enabled?.012:.025;world.environmentIntensity=enabled?.75:original.environmentIntensity;
  ground.material.color.set(enabled?'#f3f5f7':'#efede8');
  if(enabled){const room=data.room,cx=(room.origin?.[0]||0)+room.length/2,cy=(room.origin?.[1]||0)+room.width/2,span=Math.max(3,Math.hypot(room.length,room.width,room.height)*.65);
   const az=THREE.MathUtils.degToRad(angles.azimuth),el=THREE.MathUtils.degToRad(angles.elevation),direction=new THREE.Vector3(Math.cos(az)*Math.cos(el),Math.sin(az)*Math.cos(el),Math.sin(el));
   sun.target.position.set(cx,cy,room.height*.3);sun.position.copy(sun.target.position).addScaledVector(direction,span*2);
   Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.1,far:span*5});
  }else{sun.position.copy(original.position);sun.target.position.copy(original.target);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.2,far:24});}
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.needsUpdate=true;
 }
 return {sun,ground,grid,setPreview};
}

export function makeCameras(room,aspect){
 const center=new THREE.Vector3((room.origin?.[0]||0)+room.length/2,(room.origin?.[1]||0)+room.width/2,room.height*.36),d=Math.max(room.length,room.width,room.height);
 const perspective=new THREE.PerspectiveCamera(42,aspect,.025,100);perspective.up.set(0,0,1);perspective.position.copy(center).add(new THREE.Vector3(d*.95,-d*1.25,d*.95));perspective.lookAt(center);
 const span=Math.max(room.width+1,(room.length+1)/aspect),top=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.025,100);top.up.set(0,1,0);top.position.set(center.x,center.y,15);top.lookAt(center.x,center.y,0);
 return {perspective,top,center};
}

export function insideWalkable(data,point,radius=.16){
 const regions=data.room.regions?.length?data.room.regions:data.room.outline?[data.room.outline]:null;
 if(regions&&!regions.some(poly=>plan.contains([point.x,point.y],poly)))return false;
 const [ox,oy]=data.room.origin||[0,0];
 if(point.x<ox+radius||point.y<oy+radius||point.x>ox+data.room.length-radius||point.y>oy+data.room.width-radius)return false;
 for(const wall of data.walls){const dx=wall.end[0]-wall.start[0],dy=wall.end[1]-wall.start[1],length=Math.hypot(dx,dy);if(!length)continue;const u=((point.x-wall.start[0])*dx+(point.y-wall.start[1])*dy)/length,t=Math.max(0,Math.min(length,u)),distance=Math.hypot(point.x-wall.start[0]-dx/length*t,point.y-wall.start[1]-dy/length*t);
  if(distance<radius+(wall.thickness||.16)/2&&!data.openings.some(o=>o.kind==='door'&&o.wall_id===wall.id&&u>o.u+radius&&u<o.u+o.width-radius&&o.height>point.z+.1))return false;
 }
 return !data.furniture.some(f=>{const pose=F.pose(data,f);return pose.position[2]<1.8&&pose.position[2]+f.dimensions[2]>.1&&F.pointDistance([point.x,point.y],F.footprint(data,f))<radius;});
}
export function eyeHeight(data,value=1.6){return Math.max(.3,Math.min(Number.isFinite(value)?value:1.6,Math.max(.3,data.room.height-.15)));}
export function walkStart(data,height){
 const room=data.room,[ox,oy]=room.origin||[0,0],point=new THREE.Vector3(ox+Math.max(.3,room.length-.6),oy+room.width/2,height);
 if(insideWalkable(data,point))return point;
 for(let y=1;y<20;y++)for(let x=1;x<20;x++){point.set(ox+room.length*x/20,oy+room.width*y/20,height);if(insideWalkable(data,point))return point;}
 return null;
}
