import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {database,readRecord,writeRecords,readProjects} from '../scripts/studio/library-store.mjs';
import state from '../scripts/studio/state.cjs';
import plan from '../scripts/plan_geometry.js';
const payload='data:model/gltf-binary;base64,'+'a'.repeat(200000),photo='data:image/png;base64,'+'b'.repeat(90000);
const asset={id:'test_custom_chair',label:'Chair',dimensions:[.7,.7,1],mount:'floor',style:'box',color:[.5,.5,.5,1],model_glb:payload,reference_image:photo};
const scene=plan.createScene([[0,0],[4,0],[4,8],[0,8]],3,[],[asset]);scene.furniture=[{id:'item',kind:'furniture',asset_id:asset.id,label:'Chair',position:[2,2,0],dimensions:[.7,.7,1],rotation_deg:0,mount:'floor'}];
const store=new state.StudioState(scene),originalClone=globalThis.structuredClone;
// A history edit must never hand a scene/asset to structuredClone again.
globalThis.structuredClone=()=>assert.fail('Model payload copied during edit/history');
try{
 for(let i=1;i<=60;i++)store.update('item',{position:[2+i*.001,2,0]});
 assert.equal(store.history.length,60);for(let i=0;i<60;i++)assert(store.undo());assert.deepEqual(store.scene.furniture[0].position,[2,2,0]);for(let i=0;i<60;i++)assert(store.redo());assert.equal(store.scene.furniture[0].position[0],2.06);
 const before=state.copy(store.scene);assert.equal(store.commit(before),false);store.scene.assets[0].dimensions[0]=.9;assert.equal(before.assets[0].dimensions[0],.7);assert.equal(store.history.at(-1).assets[0].dimensions[0],.7);
}finally{globalThis.structuredClone=originalClone;}
const db=await database(),transaction=db.transaction.bind(db);let puts=[];
db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=(...names)=>{const s=objectStore(...names),put=s.put.bind(s);s.put=(value,key)=>{puts.push({key,bytes:JSON.stringify(value).length});return put(value,key);};return s;};return tx;};
const raw=key=>new Promise((resolve,reject)=>{const r=transaction('records','readonly').objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
await writeRecords([['library',[asset]],['project:test',{id:'test',scene}],['active-project','test']]);
assert.equal(puts.filter(p=>p.key.startsWith('payload:')).length,2,'model/photo each stored once across project/library');
assert(JSON.stringify(await raw('project:test')).length<3000);
assert.deepEqual(await readRecord('library'),[asset]);assert.deepEqual((await readProjects())[0].scene,scene);
puts=[];await writeRecords([['library',[asset]],['project:test',{id:'test',scene}]]);assert.equal(puts.length,0,'unchanged navigation must not write');
for(let i=1;i<=5;i++){const next=state.copy(scene);next.furniture[0].position[0]=2+i*.01;await writeRecords([['project:test',{id:'test',scene:next}],['library',[asset]]]);}
assert(puts.every(p=>p.key==='project:test'&&p.bytes<3000),'moving saves metadata only');
// A fresh module instance (page reload) must hydrate stored references.
const fresh=await import('../scripts/studio/library-store.mjs?fresh');assert.equal((await fresh.readRecord('library'))[0].model_glb,payload);
// Legacy embedded records remain readable without any destructive migration.
await new Promise((resolve,reject)=>{const tx=transaction('records','readwrite');tx.objectStore('records').put({id:'legacy',scene},'project:legacy');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
assert.equal((await readProjects()).length,2);
// Atomic abort must preserve the old project and not mark a new payload committed.
let fail=true;db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'&&fail){fail=false;queueMicrotask(()=>tx.abort());}return tx;};
const changed={...asset,model_glb:payload+'new'};await assert.rejects(writeRecords([['library',[changed]],['project:failed',{id:'failed',scene}]]));assert.equal(await raw('project:failed'),undefined);assert.equal((await readRecord('library'))[0].model_glb,payload);
await writeRecords([['library',[changed]],['project:failed',{id:'failed',scene}]]);assert.equal((await fresh.readRecord('library'))[0].model_glb,changed.model_glb);
// Queued writes capture metadata at call time and recover after the aborted write.
const pending={label:'before',model_glb:payload};const saving=writeRecords([['pending',pending]]);pending.label='after';await saving;assert.equal((await readRecord('pending')).label,'before');
await writeRecords([],['project:failed']);assert.equal(await readRecord('project:failed'),undefined);
assert.equal((await readRecord('library'))[0].model_glb,changed.model_glb);
// Multi-asset updates must touch a single small row, not the whole warehouse.
const second={...asset,id:'second',label:'Second',model_glb:payload+'second'};
await writeRecords([['library',[changed,second]],['project:references',{id:'references',scene:{...scene,assets:[changed,second]}}]]);
assert.equal((await raw('project:references')).scene.assets.length,1,'unused warehouse assets are excluded from the project');
puts=[];db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=(...names)=>{const s=objectStore(...names),put=s.put.bind(s);s.put=(value,key)=>{puts.push({key,bytes:JSON.stringify(value).length});return put(value,key);};return s;};return tx;};
await writeRecords([['library',[{...changed,price_cny:199,label:'Updated',dimensions:[.75,.7,1]},second]]]);
assert.deepEqual(puts.map(p=>p.key),['asset:'+changed.id]);assert(puts[0].bytes<1500,'an asset parameter update writes only lightweight metadata');
const normalized=await readRecord('library');assert.equal(normalized.length,2);assert.equal(normalized[0].price_cny,199);assert.equal(normalized[1].model_glb,second.model_glb);
// A new page seeds the committed metadata cache from reads. Unchanged save is 0 writes.
const reloaded=await import('../scripts/studio/library-store.mjs?reload-cache'),reloadDb=await reloaded.database(),reloadTx=reloadDb.transaction.bind(reloadDb);let writesAfterReload=0;
reloadDb.transaction=(...args)=>{const tx=reloadTx(...args);if(args[1]==='readwrite')writesAfterReload++;return tx;};
const restored=await reloaded.readRecord('library');await reloaded.writeRecords([['library',restored]]);assert.equal(writesAfterReload,0);
puts=[];await writeRecords([['library',[second]]]);assert.equal(await raw('asset:'+changed.id),undefined);assert.equal((await readRecord('project:references')).scene.assets[0].model_glb,changed.model_glb,'used snapshots survive warehouse deletion');
assert.deepEqual(puts.map(p=>p.key),['library']);
console.log('PASS scene history isolation, payload deduplication, lightweight/no-op saves, reload cache, per-asset parameter updates, project reference snapshots, legacy records, atomic abort/retry, queued snapshots and deletion');
