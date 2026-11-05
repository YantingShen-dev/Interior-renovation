// Isolate mocked API tests from the user's saved provider profiles and credentials.
process.env.STUDIO_ENV_FILE=require('path').join(require('os').tmpdir(),'studio-test-env-'+require('crypto').randomUUID());
const assert=require('assert/strict'),{createServer}=require('../scripts/studio/server.cjs');
const nativeFetch=global.fetch,requests=[];let base,n=0;
for(const [k,v]of Object.entries({CHAT_API_BASE:'https://chat.example.test/v1',CHAT_MODEL:'test-chat',CHAT_API_KEY:'test-chat-secret',IMAGE_API_BASE:'https://image.example.test/v1',IMAGE_MODEL:'test-image',IMAGE_API_KEY:'test-image-secret',TRIPO_API_KEY:'tsk_test-not-a-real-key'}))process.env[k]=v;
const result=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
// All upstream calls are mocked. No paid jobs or real model calls are submitted.
global.fetch=async(url,options={})=>{if(String(url).startsWith(base))return nativeFetch(url,options);requests.push({url:String(url),...options});
 if(String(url).endsWith('/api/3d/submit'))return result({status:'failed',error:{code:'TestBusinessFailure',message:'simulated upstream rejection'},request_id:'mock-trace'});
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
 await test('Tripo upload and generation use current v3 routes and keep auth server-side',async()=>{const r=await post('/api/tripo',{image:'data:image/png;base64,iVBORw0KGgo='});const task=await r.json();assert.match(task.id,/^[a-f0-9-]{36}$/);const upload=requests.find(r=>r.url.endsWith('/v3/files')),generate=requests.find(r=>r.url.endsWith('/image-to-model'));assert(upload.body instanceof FormData);assert.equal(JSON.parse(generate.body).input,'file_mock');assert.equal((await (await fetch(base+'/api/tripo/'+task.id)).json()).progress,42);});
 await test('custom 3D provider uses its configured host, model and isolated key for upload and polling',async()=>{
  const values={TRIPO_PROVIDER:'custom',STUDIO_TRIPO_CUSTOM_BASE:'https://custom-3d.example.test/v3',STUDIO_TRIPO_CUSTOM_MODEL:'my-model',STUDIO_TRIPO_CUSTOM_KEY:'custom-3d-test-key'},before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]])),start=requests.length;
  Object.assign(process.env,values);
  try{const response=await post('/api/tripo',{image:'data:image/png;base64,iVBORw0KGgo='});assert.equal(response.status,200);const task=await response.json();assert.match(task.id,/^[a-f0-9-]{36}$/);await fetch(base+'/api/tripo/'+task.id);const sent=requests.slice(start);assert.equal(sent.length,3);for(const r of sent){assert(r.url.startsWith('https://custom-3d.example.test/v3/'));assert.equal(r.headers.Authorization,'Bearer custom-3d-test-key');}assert.equal(JSON.parse(sent[1].body).model,'my-model');}finally{for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 });
 await test('Hunyuan HTTP 200 failure retains upstream error and request id without retry',async()=>{
  const before=process.env.TRIPO_PROVIDER;process.env.TRIPO_PROVIDER='hunyuan';process.env.STUDIO_TRIPO_HUNYUAN_KEY='fake-test-key';const count=requests.length;
  try{const response=await post('/api/tripo',{image:'data:image/png;base64,iVBORw0KGgo='});assert.equal(response.status,400);const payload=await response.json();assert.match(payload.error,/TestBusinessFailure.*simulated upstream rejection.*mock-trace/);assert.equal(requests.length-count,1);assert(!payload.error.includes('fake-test-key'));}
  finally{if(before===undefined)delete process.env.TRIPO_PROVIDER;else process.env.TRIPO_PROVIDER=before;delete process.env.STUDIO_TRIPO_HUNYUAN_KEY;}
 });
 await test('design sends measured scene context and returns JSON operations',async()=>{const response=await post('/api/design',{prompt:'保留门前通道',context:{room:{length:4,width:1.8,height:3},furniture:[]}});assert.deepEqual(await response.json(),{message:'保持布局',operations:[]});const req=requests.find(r=>r.url.endsWith('/chat/completions'));assert(JSON.parse(req.body).messages.at(-1).content.includes('1.8'));});
 await test('render sends an actual reference image to edits rather than text-only generation',async()=>{const response=await post('/api/render',{prompt:'极简灰白',image:'data:image/png;base64,iVBORw0KGgo='});assert((await response.json()).image.startsWith('data:image/png;base64,'));const r=requests.find(r=>r.url.endsWith('/images/edits'));assert(r.body.get('image') instanceof Blob);assert.equal(r.body.get('model'),'test-image');});
 await test('optional style reference sends two images in the right order',async()=>{const start=requests.length;const r=await post('/api/render',{prompt:'暖色木材',image:'data:image/png;base64,iVBORw0KGgo=',style_image:'data:image/jpeg;base64,/9j/'});assert.equal(r.status,200);const req=requests.slice(start).find(r=>r.url.endsWith('/images/edits')),images=req.body.getAll('image[]');assert.equal(images.length,2);assert.equal(images[0].name,'room.png');assert.equal(images[1].name,'style.jpeg');assert(req.body.get('prompt').includes('不复制其户型'));const count=requests.length;assert.equal((await post('/api/render',{prompt:'test',image:'data:image/png;base64,iVBORw0KGgo=',style_image:'file:///private'})).status,400);assert.equal(requests.length,count);});
 await test('invalid image and video inputs are rejected without provider calls',async()=>{const before=requests.length;assert.equal((await post('/api/tripo',{image:'file:///secret'})).status,400);const r=await fetch(base+'/api/reconstruction',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Video-Extension':'exe'},body:'not video'});assert.equal(r.status,400);assert.equal(requests.length,before);});
 await test('video frame decoding validates input before any model call',async()=>{const before=requests.length;for(const [type,ext]of [['application/json','mp4'],['application/octet-stream','exe']]){const r=await fetch(base+'/api/video/frames',{method:'POST',headers:{'Content-Type':type,'X-Video-Extension':ext},body:'invalid'});assert.equal(r.status,400);}assert.equal(requests.length,before);});
 await test('key field can load its saved value only through the explicit settings route',async()=>{
  const payload={kind:'chat',provider:'custom',base:'https://chat.example.test/v1'};
  assert.equal((await post('/api/config/key',payload)).status,400);
  assert.equal((await post('/api/config/key',payload,{'X-Studio-Key-Access':'settings',Origin:'https://other.example.test'})).status,400);
  const response=await post('/api/config/key',payload,{'X-Studio-Key-Access':'settings'});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).key,'test-chat-secret');
  assert.equal((await fetch(base+'/api/config/key')).status,404);
 });
 await test('composer reference images and table text reach the image edit request',async()=>{
  const response=await post('/api/render',{image:'data:image/png;base64,iVBORw0KGgo=',prompt:'按参考清单布置',attachments:[{name:'参考.png',image:'data:image/png;base64,iVBORw0KGgo='},{name:'材料.csv',text:'部位,材料\n墙面,蓝色墙漆'}]});
  assert.equal(response.status,200);const sent=requests.at(-1).body;assert.equal(sent.getAll('image[]').length,2);assert.equal(sent.getAll('image[]')[0].name,'room.png');assert(sent.get('prompt').includes('蓝色墙漆'));
  const count=requests.length;
  for(const attachments of [[{name:'bad',image:'file:///private'}],Array(7).fill({name:'x',text:'x'}),[{name:'huge.txt',text:'x'.repeat(16001)}]])assert.equal((await post('/api/render',{image:'data:image/png;base64,iVBORw0KGgo=',prompt:'x',attachments})).status,400);
  assert.equal(requests.length,count);
 });
 console.log(n+' local API checks passed with all provider requests mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=nativeFetch;server.close();});
