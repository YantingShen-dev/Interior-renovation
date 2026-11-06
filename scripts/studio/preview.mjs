import {assetDimensions} from './asset-dimensions.mjs';
import {captureAssetCover,restoreCoverView} from './asset-cover.mjs';
import {setModelDetail,paintQualityButton} from './display-quality.mjs';
import {calibrateFurniture} from './furniture-calibration.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildRoomGraph,disposeGraph,setCutaway,addStudioLighting} from './scene.mjs';
import {attachAssetModel,exportGraph} from './models.mjs';
import plan from '../plan_geometry.js';
export class Preview {
 constructor(element){this.element=element;this.needsRender=true;this.quality='high';this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));element.append(this.renderer.domElement);this.world=new THREE.Scene();this.environment=addStudioLighting(this.world,this.renderer);this.camera=new THREE.PerspectiveCamera(42,1,.01,200);this.camera.up.set(0,0,1);this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.orbit.enableDamping=true;this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(element);this.renderer.setAnimationLoop(time=>{if(!element.getClientRects().length||document.hidden)return;const moving=this.orbit.update();if(moving)this.needsRender=true;const low=this.quality==='fast';if(this.graph&&this.graph.lowDetail!==low)this.needsRender=true;if(!this.editing&&!this.needsRender||Number.isFinite(this.lastRender)&&time-this.lastRender<1000/40)return;const ratio=Math.min(devicePixelRatio,low?1:1.5);if(this.renderer.getPixelRatio()!==ratio){this.renderer.setPixelRatio(ratio);this.resize();}this.renderer.shadowMap.enabled=false;setModelDetail(this.graph,low);if(this.graph&&!this.asset&&!this.editing&&!this.disableCutaway)setCutaway(this.graph,this.data,this.camera.position,{enabled:true});this.renderer.render(this.world,this.camera);this.measurement?.update();this.needsRender=false;this.lastRender=time;});}
 resize(){this.needsRender=true;const w=this.element.clientWidth,h=this.element.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 clear(){this.needsRender=true;if(this.graph){this.world.remove(this.graph.root);disposeGraph(this.graph.root);this.graph=null;}this.data=null;this.camera.position.set(5,-6,5);this.orbit.target.set(0,0,0);this.orbit.update();}
 setScene(data,{asset=false,fit=false}={}){if(this.graph){this.world.remove(this.graph.root);disposeGraph(this.graph.root);}this.data=data;this.asset=asset;this.graph=buildRoomGraph(data);if(asset){for(const [id,group]of this.graph.entities)if(id!=='preview_item'){this.graph.root.remove(group);disposeGraph(group);}}
 this.world.add(this.graph.root);if(fit){const bounds=new THREE.Box3().setFromObject(this.graph.root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),d=Math.max(size.x,size.y,size.z,.3)*Math.max(1,1/this.camera.aspect);this.camera.position.copy(center).add(new THREE.Vector3(d,-d*1.4,d));this.orbit.target.copy(center);this.orbit.update();}this.resize();}
 dispose(){this.measurement?.dispose();this.renderer.setAnimationLoop(null);this.observer.disconnect();this.orbit.dispose();if(this.graph)disposeGraph(this.graph.root);disposeGraph(this.world);this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
export function setupAssetPreview({onResize,onCover,createPreview=element=>new Preview(element)}={}){
 let preview=null,generation=0,current=null,showDimensions=false,savingCover=false,previewQuality='high';
 const $=id=>document.getElementById(id),dialog=$('asset-preview-dialog'),measure=$('asset-preview-measure'),scale=$('asset-preview-scale'),cover=$('asset-preview-cover'),quality=$('asset-preview-quality');
 function rulers(){preview?.measurement?.dispose();if(preview){preview.measurement=showDimensions?assetDimensions(preview.world,preview.camera,$('asset-preview-canvas'),current.dimensions):null;preview.needsRender=true;}measure.textContent=showDimensions?'隐藏尺寸':'显示尺寸';measure.setAttribute('aria-pressed',String(showDimensions));}
 dialog.addEventListener('close',()=>{generation++;preview?.dispose();preview=null;});
 quality.onclick=()=>{if(!preview||quality.disabled||savingCover)return;previewQuality=previewQuality==='fast'?'high':'fast';preview.quality=previewQuality;preview.needsRender=true;paintQualityButton(quality,previewQuality);};
 measure.onclick=()=>{showDimensions=!showDimensions;rulers();};
 cover.onclick=async()=>{
  if(!current||!preview||!onCover||savingCover||cover.disabled)return;
  const asset=current,ticket=generation;savingCover=true;cover.disabled=true;scale.disabled=true;cover.textContent='保存中…';
  try{const saved=await onCover(asset,captureAssetCover(preview,asset.dimensions));if(ticket===generation){current=saved;$('asset-preview-status').textContent='封面已保存，仓库将使用当前三维视角。';}}
  catch(e){if(ticket===generation)$('asset-preview-status').textContent='封面保存失败：'+e.message;}
  finally{savingCover=false;if(ticket===generation){cover.disabled=!onCover;scale.disabled=!onResize;cover.textContent='设为封面';}}
 };
 scale.onclick=async()=>{
  if(!current||!preview||!onResize)return;const asset=current;scale.disabled=true;let temporary;
  try{
   const source=asset.model_glb||(temporary=URL.createObjectURL(new Blob([await exportGraph(preview.graph)],{type:'model/gltf-binary'})));
   dialog.close();
   await calibrateFurniture(source,asset.dimensions,async(dimensions,confirmed)=>{current=await onResize(asset,dimensions,confirmed);},{editing:true,confirmed:asset.dimension_source==='user_reference_scaled',onClose:()=>{if(temporary)URL.revokeObjectURL(temporary);open(current||asset);}});
  }catch(e){if(temporary)URL.revokeObjectURL(temporary);$('asset-preview-status').textContent='无法打开缩放：'+e.message;scale.disabled=false;}
 };
 async function open(asset){
  current=asset;const ticket=++generation;scale.disabled=true;cover.disabled=true;quality.disabled=true;paintQualityButton(quality,previewQuality);cover.textContent='设为封面';
  $('asset-preview-title').textContent=asset.label;$('asset-preview-dimensions').textContent=asset.dimensions.map((v,i)=>['宽 ','深 ','高 '][i]+(v*100).toFixed(1)+' cm').join('　×　');
  $('asset-preview-status').textContent=asset.model_glb?'正在载入三维模型…':'尺寸简模 · 外观仅供摆放参考';dialog.showModal();
  try{
   preview=createPreview($('asset-preview-canvas'));preview.quality=previewQuality;const data=plan.createScene([[0,0],[10,0],[10,10],[0,10]],4);data.assets=[asset];data.furniture=[{id:'preview_item',kind:'furniture',asset_id:asset.id,dimensions:asset.dimensions,mount:'floor',position:[5,5,0],rotation_deg:0}];preview.setScene(data,{asset:true,fit:true});rulers();
   if(asset.model_glb){await attachAssetModel(preview.graph.furniture.get('preview_item'),asset,asset.dimensions);if(ticket===generation){preview.needsRender=true;$('asset-preview-status').textContent=asset.dimension_source==='estimated_pending_review'?'三维模型 · 尺寸暂估，待实测校准':'三维模型 · 按录入尺寸显示';}}
   if(ticket===generation){restoreCoverView(preview,asset);scale.disabled=!onResize;cover.disabled=!onCover;quality.disabled=false;}
  }catch(e){if(ticket===generation)$('asset-preview-status').textContent='模型预览未能载入：'+e.message;}
 }
 return open;
}
