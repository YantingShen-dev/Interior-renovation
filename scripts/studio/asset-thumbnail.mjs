import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Render the actual mesh once, then persist the small cover in the asset library.
export async function assetThumbnail(asset){
 let renderer,object;
 try{
  object=(await new GLTFLoader().loadAsync(asset.model_glb)).scene;
  object.rotation.x=Math.PI/2;object.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length())||Math.min(...size.toArray())<1e-6)throw Error('模型没有可用的三维尺寸');
  // Scale in world axes, consistent with the editor's Z-up wrapper.
  const root=new THREE.Group();root.add(object);
  if(asset.dimensions?.every(v=>Number.isFinite(v)&&v>0))root.scale.set(...asset.dimensions.map((v,i)=>v/size.toArray()[i]));
  root.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(root);size=box.getSize(new THREE.Vector3());
  root.position.sub(box.getCenter(new THREE.Vector3()));
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f1f5f9');scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8393a5,2.3));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,-4,6);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(4,2,3);scene.add(fill);
  const camera=new THREE.PerspectiveCamera(35,4/3,.001,1000);camera.up.set(0,0,1);
  const distance=size.length()/2/Math.sin(THREE.MathUtils.degToRad(35/2))*1.07;
  camera.position.copy(new THREE.Vector3(1,-2.4,.75).normalize().multiplyScalar(distance));camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(480,360);renderer.setPixelRatio(1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.render(scene,camera);return renderer.domElement.toDataURL('image/jpeg',.88);
 }finally{
  const textures=new Set();object?.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}});for(const t of textures)t.dispose();
  renderer?.dispose();renderer?.forceContextLoss();
 }
}
