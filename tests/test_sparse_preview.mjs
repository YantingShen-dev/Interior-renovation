import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {evidenceGraph,evidenceBounds} from '../scripts/studio/evidence.mjs';
import server from '../scripts/studio/server.cjs';
const points=Array.from({length:100},(_,i)=>[i%10,Math.floor(i/10),i%3,100,120,140]);
points.push([1e7,1e7,1e7,200,200,200]);
const partial={kind:'sparse',partial:true,frame:'colmap',units:'arbitrary',points,planes:[],registered:false,selected_fragment:'0',fragments:[{id:'0',points},{id:'1',points:[[100,100,100,0,0,0]]}]};
const graph=evidenceGraph(partial,false),bounds=evidenceBounds(graph,true);
assert.equal(graph.userData.pointCount,101);
assert(bounds.max.x<100,'outliers must not collapse the camera framing');
assert.equal(graph.children[0].material.sizeAttenuation,false);
assert.equal(graph.children[0].geometry.attributes.position.getZ(10),-1,'COLMAP image-down Y maps to negative vertical');
console.log('PASS sparse framing keeps all points and focuses the main cloud with visible screen-sized markers');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-sparse-'));
try{
 fs.mkdirSync(path.join(dir,'preparation'));fs.writeFileSync(path.join(dir,'preparation/sparse-preview.json'),JSON.stringify(partial));
 const result=server.evidenceFor(dir);assert.deepEqual(result,partial);assert.equal(result.points.length,101);assert.equal(result.fragments[1].points.length,1);
 fs.mkdirSync(path.join(dir,'structure'));fs.writeFileSync(path.join(dir,'structure/web_sample.json'),JSON.stringify({points:[[1,2,3,4,5,6]]}));fs.writeFileSync(path.join(dir,'structure/observed_planes.json'),' {"planes":[]}');
 assert.equal(server.evidenceFor(dir).frame,'raw_scan','completed mesh must supersede sparse preview');
 console.log('PASS partial API evidence preserves distinct fragments; completed mesh takes precedence');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
