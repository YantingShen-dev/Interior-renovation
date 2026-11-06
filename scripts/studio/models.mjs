import {surfaceTexture} from './surface-texture.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {fullDetailScope} from './display-quality.mjs';
import dataCopy from './data-copy.cjs';
const cache=new Map();
export function clearModelCache(){cache.clear();}
function releaseMaterial(material){for(const m of Array.isArray(material)?material:[material]){m.userData.disposed=true;for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}}
function updateAssetMaterial(mesh,override,surface,pending,release=true){
 const source=mesh.assetMaterialSource||mesh.material;mesh.assetMaterialSource=source;
 const apply=m=>{
  if(surface){const physical=new THREE.MeshPhysicalMaterial({color:new THREE.Color(...surface.color.slice(0,3)),roughness:surface.roughness,metalness:surface.metalness,opacity:surface.opacity,transparent:surface.opacity<1,transmission:surface.transmission||0,side:THREE.DoubleSide});pending.push(surfaceTexture(physical,surface));return physical;}
  const c=m.clone();for(const key of Object.keys(c))if(c[key]?.isTexture)c[key]=c[key].clone();if(override&&c.color)c.color.setRGB(...override.slice(0,3));return c;
 };
 const next=Array.isArray(source)?source.map(apply):apply(source);if(release)releaseMaterial(mesh.material);mesh.material=next;
}
function load(url){
 if(cache.has(url)){const item=cache.get(url);cache.delete(url);cache.set(url,item);return item;}
 const item=new GLTFLoader().loadAsync(url).catch(error=>{if(cache.get(url)===item)cache.delete(url);throw error;});cache.set(url,item);
 // Parsed prototypes contain vertex arrays and decoded images. Do not retain an
 // unbounded second copy of every model ever opened in the warehouse.
 while(cache.size>2)cache.delete(cache.keys().next().value);return item;
}
export async function attachAssetModel(group,asset,dimensions,override=null,surface=null){
 if(!asset.model_glb)return;
 const gltf=await load(asset.model_glb);if(!group.parent||group.userData.disposed)return;
 const textures=[];const wrapper=new THREE.Group(),object=gltf.scene.clone(true);wrapper.add(object);object.rotation.x=Math.PI/2;object.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(Math.min(size.x,size.y,size.z)<1e-6)throw new Error('家具 GLB 没有可用三维包围盒');
 object.position.set(-center.x,-center.y,-bounds.min.z);wrapper.scale.set(dimensions[0]/size.x,dimensions[1]/size.y,dimensions[2]/size.z);
 wrapper.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData={...o.userData,id:group.userData.id,role:'furniture'};o.geometry=o.geometry.clone();updateAssetMaterial(o,override,surface,textures,false);}});
 await Promise.all(textures);if(!group.parent||group.userData.disposed){object.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});return;}
 for(const child of [...group.children]){child.userData.modelProxy=true;child.visible=!!group.userData.lowDetail;}wrapper.userData.assetModel=true;wrapper.visible=!group.userData.lowDetail;group.add(wrapper);group.userData.modelLoaded=true;
 group.modelInfo={source:asset.model_glb,dimensions:[...dimensions],material:dataCopy.copy([override??null,surface??null])};
}
export function reuseAssetModels(previous,next,data){
 const reused=new Set();if(!previous)return reused;
 for(const f of data.furniture){
  const old=previous.furniture.get(f.id),group=next.furniture.get(f.id),asset=data.assets.find(a=>a.id===f.asset_id),info=old?.modelInfo,wrapper=old?.children.find(c=>c.userData.assetModel);
  if(!group||!wrapper||!info||info.source!==asset?.model_glb)continue;
  const material=[f.material_override??null,f.surface_material??null];
  if(!dataCopy.equal(info.material,material)){next.textureLoads||=[];wrapper.traverse(o=>{if(o.isMesh)updateAssetMaterial(o,...material,next.textureLoads);});}
  // A dimension edit changes the instance transform, never the vertex buffers.
  wrapper.scale.set(...f.dimensions.map((v,i)=>wrapper.scale.getComponent(i)*v/info.dimensions[i]));
  old.remove(wrapper);for(const child of group.children){child.userData.modelProxy=true;child.visible=false;}group.add(wrapper);group.modelInfo={...info,dimensions:[...f.dimensions],material:dataCopy.copy(material)};group.userData.modelLoaded=true;reused.add(f.id);
 }return reused;
}
export async function exportGraph(graph){const root=new THREE.Group(),restore=fullDetailScope(graph);let copy;try{copy=graph.root.clone(true);}finally{restore();}copy.traverse(o=>{if(o.userData.modelProxy)o.visible=false;else if(o.userData.role!=='furniture'||!o.parent?.userData.modelLoaded)o.visible=true;});root.add(copy);root.rotation.x=-Math.PI/2;return new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});}
