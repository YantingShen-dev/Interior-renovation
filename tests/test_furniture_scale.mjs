import assert from 'node:assert/strict';
import {initialDimensions,scaledDimensions} from '../scripts/studio/furniture-scale-math.mjs';
assert.deepEqual(initialDimensions([2,1,4],[null,null,null]),[.5,.25,1]);
assert.deepEqual(initialDimensions([2,1,4],[.8,null,null]),[.8,.4,1.6]);
assert.deepEqual(initialDimensions([2,1,4],[.8,.5,null]),[.8,.5,1.6]);
assert.deepEqual(scaledDimensions([1,2,3],[0],.5,1),[2,2,3]);
assert.deepEqual(scaledDimensions([1,2,3],[0,2],.5,1),[2,2,6]);
assert.deepEqual(scaledDimensions([1,2,3],[0,1,2],.5,1),[2,4,6]);
assert.throws(()=>scaledDimensions([1,2,3],[0],0,1));
assert.throws(()=>scaledDimensions([1,2,3],[0],1,Infinity));
assert.throws(()=>scaledDimensions([1,2,3],[0],1,101));
console.log('PASS optional dimensions preserve proportions; reference single/two/three-axis scaling and invalid lengths');

const {FurnitureScaleCommand}=await import('../scripts/studio/furniture-scale-command.mjs');
for(const axes of [[0],[0,1],[0,1,2]]){
 const c=new FurnitureScaleCommand();c.begin([2,4,6],[1,2,3],axes);c.setBase([-1,0,0]);c.setReference([1,0,0]);
 const a=c.previewLength(4);assert.deepEqual(a.dimensions,[4,axes.includes(1)?8:4,axes.includes(2)?12:6]);
 assert.deepEqual(a.origin,[3,axes.includes(1)?4:2,axes.includes(2)?6:3]);
 // The chosen base is invariant under the same transform as the model.
 const local=[-2,-2,-3];assert.deepEqual(a.origin.map((v,i)=>v+local[i]*(axes.includes(i)?2:1)),[-1,0,0]);
 const b=c.previewPoint([5,0,0]);assert.equal(b.ratio,3);assert.equal(b.dimensions[0],6);
 assert.deepEqual(c.cancel(),{dimensions:[2,4,6],origin:[1,2,3]});assert.equal(c.stage,'idle');
}
const c=new FurnitureScaleCommand();c.begin([1,1,1],[0,0,0],[2]);c.setBase([0,0,0]);assert.throws(()=>c.setReference([1,0,0]));c.setReference([0,0,1]);assert.throws(()=>c.previewPoint([0,0,-1]));c.previewLength(2);assert.equal(c.confirm().dimensions[2],2);assert.equal(c.stage,'idle');
const ratio=new FurnitureScaleCommand();ratio.begin([1,2,3],[0,0,0],[0,1,2]);ratio.setBase([0,0,0]);ratio.previewRatio(1.5);assert.deepEqual(ratio.confirm().dimensions,[1.5,3,4.5]);
console.log('PASS Rhino-style anchored reference preview, non-cumulative updates, axis constraints, numeric factor, confirm and cancel');

c.begin([1,1,1],[0,0,0],[0,1]);c.setBase([0,0,0]);assert.equal(c.previewRatio(2).length,null);
