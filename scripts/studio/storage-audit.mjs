// Inspect write counts/bytes using real local payloads and an in-memory IndexedDB.
// This does not access the user's browser database or submit provider requests.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {database,readRecord,writeRecords} from './library-store.mjs';
import {createAutosave} from './autosave.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),folder=path.join(root,'.cache/mesh-jobs'),assets=[];
for(const name of fs.existsSync(folder)?fs.readdirSync(folder):[]){if(!name.endsWith('.json'))continue;const job=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));if(job.complete?.model_glb)assets.push({id:'audit_'+assets.length,label:'Audit',model_glb:job.complete.model_glb,dimensions:[.7,.7,1],mount:'floor',style:'box',color:[.5,.5,.5,1]});}
if(!assets.length)throw Error('No completed local furniture models');
const db=await database(),transaction=db.transaction.bind(db);let transactions=0,puts=[];
db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite')transactions++;const objectStore=tx.objectStore.bind(tx);tx.objectStore=(...names)=>{const store=objectStore(...names),put=store.put.bind(store);store.put=(value,key)=>{puts.push({key,bytes:typeof value==='string'?value.length:JSON.stringify(value).length});return put(value,key);};return store;};return tx;};
const metrics=()=>({transactions,records:puts.length,mediaWrites:puts.filter(p=>p.key.startsWith('payload:')).length,bytes:puts.reduce((n,p)=>n+p.bytes,0)}),reset=()=>{transactions=0;puts=[];};
await writeRecords([['library',assets]]);const initialImport=metrics();reset();
assets[0]={...assets[0],label:'Edited',price_cny:199,dimensions:[.75,.7,1]};await writeRecords([['library',assets]]);const parameterEdit=metrics();reset();
for(let i=0;i<20;i++)await writeRecords([['library',assets]]);const unchanged20Saves=metrics();reset();
const queue=createAutosave(()=>writeRecords([['library',assets]]));for(let i=0;i<30;i++){assets[0]={...assets[0],price_cny:200+i};queue.schedule();}await queue.flush();const burst30Edits=metrics();
const restored=await readRecord('library');if(restored[0].price_cny!==229)throw Error('Latest edit was not saved');
console.log(JSON.stringify({scope:'Real payloads; in-memory IndexedDB write accounting, not browser latency',modelPayloadMiB:Math.round(assets.reduce((n,a)=>n+a.model_glb.length,0)/1048576*100)/100,initialImport,parameterEdit,unchanged20Saves,burst30Edits},null,2));
