import * as THREE from 'three';
export function assetDimensions(scene,camera,host,dimensions){
 const [x,y,z]=dimensions,p=Math.max(...dimensions)*.12,origin=new THREE.Vector3(5,5,0);
 const edges=[[[-x/2,-y/2-p,0],[x/2,-y/2-p,0]],[[x/2+p,-y/2,0],[x/2+p,y/2,0]],[[-x/2-p,-y/2-p,0],[-x/2-p,-y/2-p,z]]],vertices=[];
 for(const [index,[a,b]]of edges.entries())for(const v of [a,b]){
  // Perpendicular end ticks, including a horizontal tick on the height ruler.
  const axis=index===2?0:2;
  const lo=[...v],hi=[...v];lo[axis]-=p*.13;hi[axis]+=p*.13;
  vertices.push(...new THREE.Vector3(...lo).add(origin).toArray(),...new THREE.Vector3(...hi).add(origin).toArray());
 }
 for(const [a,b]of edges)vertices.push(...new THREE.Vector3(...a).add(origin).toArray(),...new THREE.Vector3(...b).add(origin).toArray());
 const line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color:0x0058a3,depthTest:false}));line.renderOrder=20;scene.add(line);
 const overlay=document.createElement('div');overlay.className='asset-dimension-labels';host.append(overlay);
 const labels=edges.map(([a,b],i)=>{const node=document.createElement('span');node.textContent=['X 宽','Y 深','Z 高'][i]+' '+(dimensions[i]*100).toFixed(1)+' cm';overlay.append(node);return {node,point:new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5).add(origin)};});
 return {update(){positionDimensionLabels(labels,camera,host);},dispose(){scene.remove(line);line.geometry.dispose();line.material.dispose();overlay.remove();}};
}

export function positionDimensionLabels(labels,camera,host){
 const placed=[];
 for(const {node,point}of labels){
  const v=point.clone().project(camera);node.hidden=v.z>1||v.z< -1;if(node.hidden)continue;
  const w=node.offsetWidth,h=node.offsetHeight;
  const x=Math.max(w/2+4,Math.min(host.clientWidth-w/2-4,(v.x+1)*host.clientWidth/2));
  let y=Math.max(h/2+4,Math.min(host.clientHeight-h/2-4,(1-v.y)*host.clientHeight/2));
  for(let attempt=0;attempt<3;attempt++){
   const overlap=placed.find(r=>Math.abs(x-r.x)<(w+r.w)/2+5&&Math.abs(y-r.y)<(h+r.h)/2+5);
   if(!overlap)break;
   const below=overlap.y+(overlap.h+h)/2+6;
   y=below<host.clientHeight-h/2-4?below:overlap.y-(overlap.h+h)/2-6;
  }
  node.style.left=x+'px';node.style.top=y+'px';placed.push({x,y,w,h});
 }
}
