import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import model from './state.cjs';
const {G,F}=model;
THREE.Object3D.DEFAULT_UP.set(0,0,1);

export function buildRoomGraph(data){
 const root=new THREE.Group(),entities=new Map(),furniture=new Map();root.name='editable_room';
 const source=new Map([...data.walls,...data.openings,...(data.furniture||[])].map(e=>[e.id,e]));
 for(const part of G.buildParts(data)){
  let group=entities.get(part.parent);const entity=source.get(part.parent);
  if(!group){group=new THREE.Group();group.name=part.parent;group.userData={id:part.parent,kind:entity?.kind||part.parent,wall_id:entity?.wall_id};root.add(group);entities.set(part.parent,group);
   if(entity?.kind==='furniture'){const pose=F.pose(data,entity);group.position.fromArray(pose.position);group.rotation.z=THREE.MathUtils.degToRad(pose.rotation_deg);furniture.set(entity.id,group);}
  }
  const color=entity?.material_override||part.color;
  const material=part.role==='glass'?new THREE.MeshPhysicalMaterial({color:new THREE.Color(...color.slice(0,3)),roughness:.12,metalness:0,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({color:new THREE.Color(...color.slice(0,3)),roughness:part.role==='floor'?.86:part.role==='door'&&part.id.includes('lift')?.3:.61,metalness:part.role==='door'&&part.id.includes('lift')?.7:0});
  for(const box of part.boxes){
   const radius=part.role==='furniture'?Math.min(.004,...box.size.map(v=>v*.12)):0;
   const geometry=radius?new RoundedBoxGeometry(...box.size,2,radius):new THREE.BoxGeometry(...box.size);
   const mesh=new THREE.Mesh(geometry,material);mesh.name=part.id;mesh.userData={id:part.parent,role:part.role};
   if(entity?.kind==='furniture'){
    const pose=F.pose(data,entity),a=-THREE.MathUtils.degToRad(pose.rotation_deg),dx=box.center[0]-pose.position[0],dy=box.center[1]-pose.position[1];
    mesh.position.set(dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a),box.center[2]-pose.position[2]);mesh.rotation.z=box.yaw-THREE.MathUtils.degToRad(pose.rotation_deg);
   }else {mesh.position.fromArray(box.center);mesh.rotation.z=box.yaw;}
   mesh.castShadow=part.role!=='glass'&&part.role!=='floor';mesh.receiveShadow=true;group.add(mesh);
  }
 }
 root.updateMatrixWorld(true);return {root,entities,furniture};
}

export function disposeGraph(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}

export function setCutaway(graph,data,cameraPosition,{enabled=true,ceiling=false,human=false,plan=false}={}){
 const view=new THREE.Vector2(cameraPosition.x-data.room.length/2,cameraPosition.y-data.room.width/2);
 for(const [id,group]of graph.entities){
  const item=data.furniture?.find(f=>f.id===id);
  if(item){group.visible=!(plan&&item.mount==='ceiling');continue;}
  if(id==='ceiling'){group.visible=human||ceiling;continue;}
  const wall=data.walls.find(w=>w.id===id)||data.walls.find(w=>w.id===data.openings.find(o=>o.id===id)?.wall_id);
  group.visible=!wall||human||!enabled||wall.outward[0]*view.x+wall.outward[1]*view.y<=.01;
 }
}

export function selectionOutline(data,furniture,color='#222222'){
 const pose=F.pose(data,furniture),geometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(...furniture.dimensions)),outline=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}));
 const root=new THREE.Group();root.position.fromArray(pose.position);root.rotation.z=THREE.MathUtils.degToRad(pose.rotation_deg);outline.position.z=furniture.dimensions[2]/2;root.add(outline);root.renderOrder=100;outline.renderOrder=100;return root;
}

export function floorPick(raycaster){return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());}
export function visibleObject(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
export function furnitureFromRay(raycaster,graph){const hits=raycaster.intersectObject(graph.root,true).filter(hit=>visibleObject(hit.object)&&hit.object.userData.role!=='glass');const first=hits[0];return first&&graph.furniture.has(first.object.userData.id)?first.object.userData.id:null;}

export function addStudioLighting(world,renderer){
 world.background=new THREE.Color('#ededed');
 const sky=new THREE.HemisphereLight('#ffffff','#999999',2.5);sky.position.set(0,0,10);world.add(sky);
 const ambient=new THREE.AmbientLight('#ffffff',.3);world.add(ambient);
 const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(-3,-4,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;sun.shadow.camera.near=.2;sun.shadow.camera.far=24;sun.shadow.normalBias=.025;sun.shadow.bias=-.00008;sun.target.position.set(2,.9,.7);world.add(sun,sun.target);
 const fill=new THREE.DirectionalLight('#eeeeee',.9);fill.position.set(5,5,5);world.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#e9e9e9',roughness:1}));ground.position.z=-.065;ground.receiveShadow=true;ground.userData.environment=true;world.add(ground);
 const grid=new THREE.GridHelper(20,40,'#bcbcbc','#d0d0d0');grid.rotation.x=Math.PI/2;grid.position.z=-.062;grid.material.transparent=true;grid.material.opacity=.22;world.add(grid);
 if(renderer){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;}
 return {sun,ground,grid};
}

export function makeCameras(room,aspect){
 const center=new THREE.Vector3(room.length/2,room.width/2,room.height*.36),d=Math.max(room.length,room.width,room.height);
 const perspective=new THREE.PerspectiveCamera(42,aspect,.025,100);perspective.up.set(0,0,1);perspective.position.copy(center).add(new THREE.Vector3(d*.95,-d*1.25,d*.95));perspective.lookAt(center);
 const span=Math.max(room.width+1,(room.length+1)/aspect),top=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.025,100);top.up.set(0,1,0);top.position.set(room.length/2,room.width/2,15);top.lookAt(room.length/2,room.width/2,0);
 return {perspective,top,center};
}

export function insideWalkable(data,point,radius=.16){
 if(point.x<radius||point.y<radius||point.x>data.room.length-radius||point.y>data.room.width-radius)return false;
 return !data.furniture.some(f=>{const pose=F.pose(data,f);return pose.position[2]<1.8&&pose.position[2]+f.dimensions[2]>.1&&F.pointDistance([point.x,point.y],F.footprint(data,f))<radius;});
}
