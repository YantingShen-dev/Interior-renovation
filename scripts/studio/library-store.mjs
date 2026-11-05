/* IndexedDB keeps large GLB/image assets out of localStorage's small quota. */
let connection;
export async function database(){
 if(!connection)connection=new Promise((resolve,reject)=>{const request=indexedDB.open('space-studio-library-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭其他旧版工作台标签，再重新打开'));});
 return connection;
}
export async function readRecord(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function writeRecords(entries,deletes=[]){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');for(const key of deletes)tx.objectStore('records').delete(key);for(const [key,value]of entries)tx.objectStore('records').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('本地存储写入被中断'));});}
export async function readProjects(){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').openCursor(),items=[];request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(items);return;}if(String(cursor.key).startsWith('project:'))items.push(cursor.value);cursor.continue();};request.onerror=()=>reject(request.error);});}
