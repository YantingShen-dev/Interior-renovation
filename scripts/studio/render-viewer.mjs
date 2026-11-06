// Inspect the existing generated image without another render request.
export function setupRenderViewer(){
 const $=id=>document.getElementById(id),source=$('render-output'),dialog=$('render-viewer'),image=$('render-viewer-image'),area=$('render-viewer-area');
 let scale=1,x=0,y=0,drag=null;
 function paint(){image.style.transform=`translate(${x}px, ${y}px) scale(${scale})`;$('render-viewer-zoom').textContent=Math.round(scale*100)+'%';$('render-viewer-minus').disabled=scale<=1;$('render-viewer-plus').disabled=scale>=6;area.style.cursor=scale>1?'grab':'default';}
 function fit(){scale=1;x=y=0;drag=null;paint();}
 function zoom(value,atX=0,atY=0){const next=Math.max(1,Math.min(6,value)),ratio=next/scale;x=atX+(x-atX)*ratio;y=atY+(y-atY)*ratio;scale=next;if(scale===1)x=y=0;paint();}
 function open(){if(source.hidden||!source.src)return;image.src=source.currentSrc||source.src;$('render-viewer-download').href=image.src;fit();dialog.showModal();}
 source.onclick=open;
 source.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
 $('render-viewer-close').onclick=()=>dialog.close();
 $('render-viewer-fit').onclick=fit;
 $('render-viewer-plus').onclick=()=>zoom(scale*1.25);
 $('render-viewer-minus').onclick=()=>zoom(scale/1.25);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{image.src='';drag=null;source.focus();});
 area.addEventListener('wheel',e=>{e.preventDefault();const rect=area.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.002),e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2);},{passive:false});
 area.addEventListener('pointerdown',e=>{if(scale<=1||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:x,top:y};area.setPointerCapture(e.pointerId);area.style.cursor='grabbing';e.preventDefault();});
 area.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;x=drag.left+e.clientX-drag.x;y=drag.top+e.clientY-drag.y;paint();area.style.cursor='grabbing';});
 const stop=()=>{drag=null;paint();};area.addEventListener('pointerup',stop);area.addEventListener('pointercancel',stop);area.addEventListener('lostpointercapture',stop);
 image.ondragstart=e=>e.preventDefault();
}
