import {fullDetailScope} from './display-quality.mjs';
export const coverImage=asset=>asset.cover_image||asset.reference_image;
export function withAssetCover(asset,{image,view},now=new Date().toISOString()){
 if(!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>2*1024*1024)throw Error('封面图片无效或超过 2MB');
 return {...asset,cover_image:image,cover_source:'user_view',cover_view:structuredClone(view),cover_updated_at:now};
}
export function captureAssetCover(preview,dimensions){
 if(!preview?.graph||!preview.renderer.domElement.width||!preview.renderer.domElement.height)throw Error('请等待三维模型载入后再设置封面');
 const {renderer,camera,orbit,world,environment,measurement}=preview,grid=environment?.grid,gridVisible=grid?.visible;
 if(renderer.getContext?.()?.isContextLost())throw Error('三维画布已断开，请重新打开模型后再试');
 const restore=preview.graph?.furniture?fullDetailScope(preview.graph):()=>{};
 try{
  if(grid)grid.visible=false;measurement?.setVisible(false);
  camera.updateMatrixWorld();renderer.render(world,camera);
  const source=renderer.domElement,canvas=document.createElement('canvas');canvas.width=Math.min(640,source.width);canvas.height=Math.max(1,Math.round(canvas.width*source.height/source.width));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  return {image:canvas.toDataURL('image/jpeg',.9),view:{position:camera.position.toArray(),target:orbit.target.toArray(),up:camera.up.toArray(),fov:camera.fov,zoom:camera.zoom,dimensions:[...dimensions]}};
 }finally{restore();if(grid)grid.visible=gridVisible;measurement?.setVisible(true);renderer.render(world,camera);preview.needsRender=true;}
}
export function restoreCoverView(preview,asset){
 const v=asset.cover_view,vector=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
 if(!v||!['position','target','up','dimensions'].every(k=>vector(v[k]))||!Number.isFinite(v.fov)||v.fov<5||v.fov>140||!Number.isFinite(v.zoom)||v.zoom<=0||v.zoom>100||!asset.dimensions.every((n,i)=>n===v.dimensions[i]))return false;
 preview.camera.position.fromArray(v.position);preview.camera.up.fromArray(v.up);preview.camera.fov=v.fov;preview.camera.zoom=v.zoom;preview.orbit.target.fromArray(v.target);preview.camera.updateProjectionMatrix();preview.orbit.update();return true;
}
