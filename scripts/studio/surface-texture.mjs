import * as THREE from 'three';
// Shared by procedural rooms and imported meshes; scaling never changes geometry.
export function surfaceTexture(material,finish){
 const configure=texture=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.setScalar(1/(finish.texture_scale||1));texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true;};
 if(finish.texture)return new Promise(resolve=>new THREE.TextureLoader().load(finish.texture,t=>{configure(t);resolve(true);},undefined,()=>resolve(false)));
 if(!finish.pattern||finish.pattern==='plain')return Promise.resolve(true);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,256,256);c.strokeStyle='#b9b3a7';c.lineWidth=finish.pattern==='stripes'?8:2;
 if(finish.pattern==='stripes'){for(let x=0;x<256;x+=32){c.beginPath();c.moveTo(x,0);c.lineTo(x,256);c.stroke();}}
 else if(finish.pattern==='wood'){for(let y=0;y<=256;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(256,y);c.stroke();}c.beginPath();c.moveTo(90,0);c.lineTo(90,64);c.moveTo(190,64);c.lineTo(190,128);c.moveTo(35,128);c.lineTo(35,192);c.moveTo(140,192);c.lineTo(140,256);c.stroke();}
 else c.strokeRect(0,0,256,256);
 configure(new THREE.CanvasTexture(canvas));return Promise.resolve(true);
}
