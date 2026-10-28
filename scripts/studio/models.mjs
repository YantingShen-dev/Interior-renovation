import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const cache=new Map();
function load(url){if(!cache.has(url))cache.set(url,new GLTFLoader().loadAsync(url));return cache.get(url);}
export async function attachAssetModel(group,asset,dimensions,override=null){
 if(!asset.model_glb)return;
 const gltf=await load(asset.model_glb);if(!group.parent)return;
 const wrapper=new THREE.Group(),object=gltf.scene.clone(true);wrapper.add(object);object.rotation.x=Math.PI/2;object.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(Math.min(size.x,size.y,size.z)<1e-6)throw new Error('家具 GLB 没有可用三维包围盒');
 object.position.set(-center.x,-center.y,-bounds.min.z);wrapper.scale.set(dimensions[0]/size.x,dimensions[1]/size.y,dimensions[2]/size.z);
 wrapper.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData={...o.userData,id:group.userData.id,role:'furniture'};if(override){const apply=m=>{const c=m.clone();if(c.color)c.color.setRGB(...override.slice(0,3));return c;};o.material=Array.isArray(o.material)?o.material.map(apply):apply(o.material);}}});
 for(const child of [...group.children])child.visible=false;group.add(wrapper);group.userData.modelLoaded=true;
}
export async function exportGraph(graph){const root=new THREE.Group(),copy=graph.root.clone(true);copy.traverse(o=>{if(o.userData.role!=='furniture'||!o.parent?.userData.modelLoaded)o.visible=true;});root.add(copy);root.rotation.x=-Math.PI/2;return new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});}
