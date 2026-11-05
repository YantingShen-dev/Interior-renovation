import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {wallProjection,projectPhoto,openingFromPhoto,rectangularDraft,attachVideoEvidence} from '../scripts/studio/video-room-geometry.mjs';
import {spaceTemplate,designFromSpace} from '../scripts/studio/projects.mjs';
import state from '../scripts/studio/state.cjs';
import api from '../scripts/studio/video-room-api.cjs';
const corners=[[.1,.9],[.9,.8],[.8,.1],[.2,.2]],h=wallProjection(corners,5,3);
for(const [i,expected]of [[0,[0,0]],[1,[5,0]],[2,[5,3]],[3,[0,3]]])projectPhoto(h,corners[i]).forEach((v,k)=>assert(Math.abs(v-expected[k])<1e-8));
assert.throws(()=>wallProjection([[0,0],[1,1],[1,0],[0,1]],5,3),/交叉/);
assert.throws(()=>wallProjection([[0,0],[.1,0],[.2,0],[.3,0]],5,3));
const scene=rectangularDraft(5,4,3),front=[[0,1],[1,1],[1,0],[0,0]],o=openingFromPhoto({corners:front,wall:scene.walls[0],points:[[.2,1],[.4,.3]],kind:'door',id:'door1'});
assert.deepEqual([o.u,o.width,o.bottom,o.height],[1,1,0,2.1]);scene.openings.push(o);
assert.throws(()=>openingFromPhoto({corners:front,wall:scene.walls[0],points:[[.2,1],[.4,.3]],kind:'door',id:'overlap',existing:scene.openings}),/重叠/);
assert.throws(()=>openingFromPhoto({corners:front,wall:scene.walls[0],points:[[-.1,.5],[.1,.3]],kind:'window',id:'outside'}),/墙面内/);
const win=openingFromPhoto({corners:front,wall:scene.walls[1],points:[[.2,.7],[.5,.2]],kind:'window',id:'window1'});assert.deepEqual([win.u,win.width,win.bottom,win.height],[.8,1.2,.9,1.5]);scene.openings.push(win);assert.deepEqual(state.G.validate(scene),[]);
const linked=attachVideoEvidence(scene,{sha256:'test-sha',job_id:'test-job'},[{wall_id:scene.walls[0].id,frame:{seconds:2,thumbnail:'data:image/jpeg;base64,test'},corners:front,openings:[{id:o.id,points:[[.2,1],[.4,.3]]}]}]);
const space=spaceTemplate(linked),design=designFromSpace({id:'test-space',name:'test',kind:'space',scene:space},[]);assert.deepEqual(design.openings,scene.openings);assert.deepEqual(design.video_assistance,linked.video_assistance);assert.equal(design.provenance.source_video_sha256,'test-sha');design.openings[0].width=.5;assert.equal(space.openings[0].width,1);assert.deepEqual(state.G.validate(design),[]);
console.log('PASS perspective calibration, photo-to-opening geometry, invalid annotations and linked room/design continuity');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'video-room-api-')),id='12345678-1234-1234-1234-123456789abc',prep=path.join(temp,id,'project/preparation');
try{fs.mkdirSync(path.join(prep,'frames'),{recursive:true});fs.writeFileSync(path.join(prep,'frames/000001.jpg'),'test-image');fs.writeFileSync(path.join(prep,'preparation.json'),JSON.stringify({status:'failed',video_sha256:'sha',duration_seconds:3,sampled_frames:[{image:'000001.jpg',seconds:1},{image:'../../secret',seconds:2},{image:'000002.jpg',seconds:2}]}));assert.equal(api.frameIndex(temp,id).frames.length,1);assert.equal(api.latestFrames(temp).id,id);assert.equal(api.frameFile(temp,id,'000001.jpg'),path.join(prep,'frames/000001.jpg'));assert.throws(()=>api.frameFile(temp,id,'../../secret'));assert.throws(()=>api.frameIndex(temp,'../'));console.log('PASS failed scans still provide known frames; frame traversal and missing images are rejected');}
finally{const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});}
