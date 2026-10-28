const assert=require('assert/strict'),{createServer}=require('../scripts/studio/server.cjs');
const nativeFetch=global.fetch,requests=[];let base,n=0;
for(const [k,v]of Object.entries({CHAT_API_BASE:'https://chat.example.test/v1',CHAT_MODEL:'test-chat',CHAT_API_KEY:'test-chat-secret',IMAGE_API_BASE:'https://image.example.test/v1',IMAGE_MODEL:'test-image',IMAGE_API_KEY:'test-image-secret',TRIPO_API_KEY:'tsk_test-not-a-real-key'}))process.env[k]=v;
const result=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
// All upstream calls are mocked. No paid jobs or real model calls are submitted.
global.fetch=async(url,options={})=>{if(String(url).startsWith(base))return nativeFetch(url,options);requests.push({url:String(url),...options});
 if(String(url).endsWith('/v3/files'))return result({code:0,data:{file_token:'file_mock'}});
 if(String(url).endsWith('/image-to-model'))return result({code:0,data:{task_id:'mock-task'}});
 if(String(url).endsWith('/v3/tasks/mock-task'))return result({code:0,data:{status:'running',progress:42}});
 if(String(url).endsWith('/chat/completions'))return result({choices:[{message:{content:'{"message":"保持布局","operations":[]}'}}]});
 if(String(url).endsWith('/images/edits'))return result({data:[{b64_json:'iVBORw0KGgo='}]});
 throw new Error('Unexpected outbound request: '+url);
};
const server=createServer();
async function test(name,fn){await fn();console.log('PASS '+name);n++;}
async function post(route,data,headers={}){return fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 await test('loopback service returns the updated workbench and health',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert((await r.text()).includes('AI 设计与渲染'));assert.equal((await (await fetch(base+'/api/health')).json()).app,'space-studio');});
 await test('public config exposes readiness and model IDs but never API secrets',async()=>{const config=await (await fetch(base+'/api/config')).json();assert(config.chat.configured);assert(config.tripo.configured);assert(!JSON.stringify(config).includes('secret'));assert(!JSON.stringify(config).includes('tsk_'));});
 await test('workspace files and environment cannot be downloaded',async()=>{for(const route of ['/.env.local','/scripts/studio/server.cjs','/../.env.local'])assert.equal((await fetch(base+route)).status,404);});
 await test('cross-origin requests cannot read config or submit jobs',async()=>{const response=await post('/api/design',{},{Origin:'https://other.example.test'});assert.equal(response.status,400);assert((await response.json()).error.includes('跨站'));});
 await test('Tripo upload and generation use current v3 routes and keep auth server-side',async()=>{const r=await post('/api/tripo',{image:'data:image/png;base64,iVBORw0KGgo='});assert.equal((await r.json()).id,'mock-task');const upload=requests.find(r=>r.url.endsWith('/v3/files')),generate=requests.find(r=>r.url.endsWith('/image-to-model'));assert(upload.body instanceof FormData);assert.equal(JSON.parse(generate.body).input,'file_mock');assert.equal((await (await fetch(base+'/api/tripo/mock-task')).json()).progress,42);});
 await test('design sends measured scene context and returns JSON operations',async()=>{const response=await post('/api/design',{prompt:'保留门前通道',context:{room:{length:4,width:1.8,height:3},furniture:[]}});assert.deepEqual(await response.json(),{message:'保持布局',operations:[]});const req=requests.find(r=>r.url.endsWith('/chat/completions'));assert(JSON.parse(req.body).messages.at(-1).content.includes('1.8'));});
 await test('render sends an actual reference image to edits rather than text-only generation',async()=>{const response=await post('/api/render',{prompt:'极简灰白',image:'data:image/png;base64,iVBORw0KGgo='});assert((await response.json()).image.startsWith('data:image/png;base64,'));const r=requests.find(r=>r.url.endsWith('/images/edits'));assert(r.body.get('image') instanceof Blob);assert.equal(r.body.get('model'),'test-image');});
 await test('invalid image and video inputs are rejected without provider calls',async()=>{const before=requests.length;assert.equal((await post('/api/tripo',{image:'file:///secret'})).status,400);const r=await fetch(base+'/api/reconstruction',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Video-Extension':'exe'},body:'not video'});assert.equal(r.status,400);assert.equal(requests.length,before);});
 console.log(n+' local API checks passed with all provider requests mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=nativeFetch;server.close();});
