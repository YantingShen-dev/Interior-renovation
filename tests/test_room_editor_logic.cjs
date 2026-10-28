/* Offline user-flow checks. This is a DOM/canvas mock, not browser interaction QA. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const customEditor=process.argv[2];const html=fs.readFileSync(customEditor||path.join(__dirname,'../重建小样/room_editable_v1/房间编辑器.html'),'utf8');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);let drawCalls=0,lastBlob;
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.value='';this.checked=false;this.hidden=false;}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
 querySelectorAll(tag){return this.children.flatMap(e=>[...(e.tag===tag?[e]:[]),...e.querySelectorAll(tag)]);}
 getBoundingClientRect(){return {width:1000,height:700,left:0,top:0};}click(){}setPointerCapture(){}
 getContext(){return ctx;}
}
const ctx=new Proxy({}, {get(t,key){if(key in t)return t[key];return (...args)=>{if(['fillRect','setTransform'].includes(key))assert(args.every(Number.isFinite));drawCalls++;};}});
class TestPath{moveTo(...a){assert(a.every(Number.isFinite));}lineTo(...a){assert(a.every(Number.isFinite));}closePath(){}}
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id==='view'?'canvas':'div')]));elements.cutaway.checked=true;
const context={document:{getElementById:id=>{assert(elements[id],`missing ${id}`);return elements[id];},createElement:tag=>new Element(tag)},window:{},devicePixelRatio:1,structuredClone,TextEncoder,Blob,console,Path2D:TestPath,setTimeout:fn=>{fn();return 0;},URL:{createObjectURL:b=>{lastBlob=b;return 'blob:offline-test';},revokeObjectURL:()=>{}}};
vm.createContext(context);for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
const scene=()=>JSON.parse(vm.runInContext('JSON.stringify(scene)',context));
const originalScene=scene(),originalStairU=originalScene.openings.find(o=>o.id==='door_stair').u;
function select(id){elements.entitySelect.value=id;elements.entitySelect.onchange();}
function edit(key,value){const input=elements.entityFields.querySelectorAll('input').find(e=>e.dataset.key===key);assert(input);input.value=String(value);}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
await test('generated structure editor has resolved data and the public entry is the Three.js workspace',()=>{const root=path.join(__dirname,'..');assert(!/__(GEOMETRY|SCENE|SCAN|PHOTOS)__/.test(html));if(customEditor){const entry=fs.readFileSync(path.join(root,'打开矢量房间.html'),'utf8');assert(entry.includes('id="viewport"'));assert(entry.includes('Three.js'));}else assert(fs.readFileSync(path.join(root,'打开房间编辑器.html'),'utf8')===html);const landing=fs.readFileSync(path.join(root,'scripts/room_editor_template.html'),'utf8');assert(!/<script\b/i.test(landing));assert(landing.includes('../重建小样/room_editable_v1/房间编辑器.html'));});
await test('initial rendering, reference images and scan projection are finite',()=>{assert(drawCalls>0);assert.equal(elements.evidenceImages.children.length,originalScene.openings.find(o=>o.id==='window_end').evidence_images.length);elements.showScan.checked=true;elements.showScan.onchange();});
await test('edit, undo and redo update actual scene parameters',()=>{select('door_stair');edit('u',1.3);elements.applyEntity.onclick();assert.equal(scene().openings.find(o=>o.id==='door_stair').u,1.3);elements.undo.onclick();assert.equal(scene().openings.find(o=>o.id==='door_stair').u,originalStairU);elements.redo.onclick();assert.equal(scene().openings.find(o=>o.id==='door_stair').u,1.3);});
await test('invalid room resize is rejected without changing the scene',()=>{elements.roomWidth.value='1';elements.applyRoom.onclick();assert.equal(scene().room.width,1.8);assert(elements.status.className.includes('error'));});
await test('JSON import and GLB download retain editable candidates',async()=>{const original=JSON.parse(vm.runInContext('JSON.stringify(initialScene)',context));elements.fileInput.files=[{text:async()=>JSON.stringify(original)}];await elements.fileInput.onchange();assert.equal(scene().openings.find(o=>o.id==='door_stair').u,originalStairU);elements.saveGLB.onclick();assert(lastBlob);const bytes=new Uint8Array(await lastBlob.arrayBuffer()),dv=new DataView(bytes.buffer);assert.equal(dv.getUint32(0,true),0x46546c67);const gltf=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+dv.getUint32(12,true))).trim());assert.equal(gltf.nodes.find(n=>n.name==='window_end').extras.dimensions_verified,false);});
await test('valid room resize updates all wall endpoints and preserves measured reference',()=>{elements.roomLength.value='4.2';elements.applyRoom.onclick();assert.equal(scene().room.length,4.2);assert.equal(scene().walls.find(w=>w.id==='wall_door_end').start[0],4.2);assert.deepEqual(scene().provenance.initial_user_confirmed_interior_dimensions_m,[4,1.8,3]);assert.equal(scene().room.dimension_source,'editor_user_input');elements.undo.onclick();assert.equal(scene().room.length,4);});
console.log(`${count} offline editor user-flow checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
