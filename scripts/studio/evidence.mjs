import * as THREE from 'three';
import {disposeGraph} from './scene.mjs';
// Both samples and fitted contours are real scan outputs. The scan frame is Y-up.
export function evidenceGraph(data,segmented=true){
 const root=new THREE.Group();root.name='scan_evidence';
 const planes=data.planes||[],palette=['#222222','#555555','#888888','#bbbbbb','#eeeeee'];
 const groups=planes.map((p,i)=>({p,points:[],color:palette[i%palette.length]}));const unmatched=[];
 for(const p of data.points||[]){let nearest=-1,distance=.075;
  if(segmented)for(let i=0;i<planes.length;i++){const q=planes[i],d=Math.abs(q.normal.reduce((sum,v,k)=>sum+v*(p[k]-q.origin[k]),0));if(d<distance){distance=d;nearest=i;}}
  (nearest>=0?groups[nearest].points:unmatched).push(p);
 }
 const add=(points,color)=>{if(!points.length)return;const positions=[],colors=[];for(const p of points){positions.push(p[0],-p[2],p[1]);if(!segmented)colors.push(p[3]/255,p[4]/255,p[5]/255);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(!segmented)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const mesh=new THREE.Points(g,new THREE.PointsMaterial({color:segmented?color:'#ffffff',vertexColors:!segmented,size:.025,sizeAttenuation:true}));root.add(mesh);};
 add(unmatched,'#aaaaaa');for(const group of groups)add(group.points,group.color);
 if(segmented)for(const [i,p]of planes.entries())for(const contour of p.contours||[]){if(contour.kind==='unknown_gap')continue;const points=contour.uv.map(([u,v])=>{const q=p.origin.map((x,k)=>x+u*p.basis_uv[0][k]+v*p.basis_uv[1][k]);return new THREE.Vector3(q[0],-q[2],q[1]);});if(points.length){points.push(points[0]);root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:palette[i%5]})));}}
 root.userData.pointCount=(data.points||[]).length;return root;
}
export function clearEvidence(viewport){if(viewport.evidence){viewport.world.remove(viewport.evidence);disposeGraph(viewport.evidence);viewport.evidence=null;}}
