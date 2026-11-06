import data from './data-copy.cjs';
import {projectSceneSnapshot} from './project-snapshot.mjs';
// Preserve the v1 database. Large immutable media is stored once; lightweight
// records contain references, transparently hydrated at this boundary.
const marker='__space_studio_payload_v1__',collection='__space_studio_collection_v2__',prefix='payload:',byValue=new Map(),byId=new Map(),lastWritten=new Map();
let connection,writing=Promise.resolve();
export async function database(){
 if(!connection)connection=new Promise((resolve,reject)=>{const request=indexedDB.open('space-studio-library-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};request.onerror=()=>{connection=null;reject(request.error);};request.onblocked=()=>{connection=null;reject(new Error('请关闭其他旧版工作台标签，再重新打开'));};});
 return connection;
}
function hasInlineMedia(value){if(media(value))return true;if(!value||typeof value!=='object')return false;return Object.values(value).some(hasInlineMedia);}
async function rawRead(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(key);request.onsuccess=()=>{const value=request.result;if(value!==undefined&&!hasInlineMedia(value))lastWritten.set(key,data.copy(value));resolve(value);};request.onerror=()=>reject(request.error);});}
const media=value=>typeof value==='string'&&value.length>=65536&&value.startsWith('data:');
function intern(value,id=null){let item=byValue.get(value);if(!item){item={id:id||prefix+crypto.randomUUID(),value,committed:!!id};byValue.set(value,item);}return item;}
async function hydrate(value){
 if(media(value))return intern(value).value;
 if(!value||typeof value!=='object')return value;
 if(Object.keys(value).length===1&&typeof value[marker]==='string'){
  const id=value[marker];if(!byId.has(id))byId.set(id,rawRead(id).then(raw=>{if(typeof raw!=='string')throw new Error('本地模型或图片数据缺失，请保留备份并重新导入');return intern(raw,id).value;}).catch(error=>{byId.delete(id);throw error;}));
  return byId.get(id);
 }
 if(Array.isArray(value))return Promise.all(value.map(hydrate));
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
 const result={};await Promise.all(Object.entries(value).map(async([key,item])=>{result[key]=await hydrate(item);}));return result;
}
function pack(value,pending){
 if(media(value)){const item=intern(value);if(!item.committed)pending.set(item.id,item);return {[marker]:item.id};}
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(item=>pack(item,pending));
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,pack(item,pending)]));
}
const assetKey=id=>'asset:'+encodeURIComponent(id);
export async function readRecord(key){
 const value=await rawRead(key);
 if(key==='library'&&value?.[collection]){
  const result=[];for(const id of value[collection]){const asset=await readRecord(assetKey(id));if(!asset)throw new Error('本地仓库条目缺失，请保留备份并重新导入');result.push(asset);}return result;
 }
 return hydrate(value);
}
function projectSnapshot(value){
 if(!value?.scene?.assets)return value;
 return {...value,scene:projectSceneSnapshot(value.scene)};
}
export function writeRecords(entries,deletes=[]){
 // Capture metadata now; later edits must not change this queued save.
 const snapshot=data.copy(entries),removed=[...deletes];
 const result=writing.catch(()=>{}).then(async()=>{
  const expanded=[],deletions=new Set(removed);
  for(const [key,value]of snapshot){
   if(key==='library'&&Array.isArray(value)){
    const ids=value.map(a=>a.id);if(ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('仓库资产 ID 缺失或重复');
    const previous=lastWritten.get('library')?.[collection]||[];
    for(const id of previous)if(!ids.includes(id))deletions.add(assetKey(id));
    for(const asset of value)expanded.push([assetKey(asset.id),asset]);expanded.push([key,{[collection]:ids}]);
   }else expanded.push([key,key.startsWith('project:')?projectSnapshot(value):value]);
  }
  const pending=new Map(),packed=expanded.map(([key,value])=>[key,pack(value,pending)]).filter(([key,value])=>!lastWritten.has(key)||!data.equal(lastWritten.get(key),value));
  if(!packed.length&&!deletions.size)return;const db=await database();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('本地存储写入失败'));tx.onabort=()=>reject(tx.error||new Error('本地存储写入被中断'));
   try{for(const item of pending.values())store.put(item.value,item.id);for(const key of deletions)store.delete(key);for(const [key,value]of packed)store.put(value,key);}catch(error){try{tx.abort();}catch{}reject(error);}
  });
  for(const item of pending.values()){item.committed=true;byId.set(item.id,Promise.resolve(item.value));}
  for(const key of deletions)lastWritten.delete(key);for(const [key,value]of packed)lastWritten.set(key,value);
 });
 writing=result;return result;
}
export async function readProjects(){
 const db=await database(),range=IDBKeyRange.bound('project:','project:\uffff');
 const keys=await new Promise((resolve,reject)=>{const request=db.transaction('records','readonly').objectStore('records').getAllKeys(range);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 // Avoid deserializing every legacy project's embedded models at once.
 const items=[];for(const key of keys)items.push(await readRecord(key));return items;
}
