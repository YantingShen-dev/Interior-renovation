const https=require('node:https');
const {Readable}=require('node:stream');

function sendHTTPS(url,{method='GET',headers={},body,signal}={},agent){
 return new Promise((resolve,reject)=>{
  const request=https.request(url,{agent,method,signal,headers:{
   'Accept-Encoding':'identity',...headers,...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)})
  }},incoming=>{
   try{
    const status=incoming.statusCode;
    const empty=method==='HEAD'||[204,205,304].includes(status);
    if(empty)incoming.resume();
    resolve(new Response(empty?null:Readable.toWeb(incoming),{status,headers:incoming.headers}));
   }catch(error){incoming.destroy();reject(error);}
  });
  request.on('error',reject);
  request.end(body);
 });
}

// A route can be changed before a paid POST or after a read-only request fails.
// Once a submission has been sent, its network result is returned as-is.
function createHunyuanTransport({env=process.env,send=sendHTTPS}={}){
 const proxy=env.https_proxy||env.HTTPS_PROXY||env.http_proxy||env.HTTP_PROXY;
 const agents={direct:new https.Agent({keepAlive:true})};
 if(proxy)agents.proxy=new https.Agent({keepAlive:true,proxyEnv:{HTTPS_PROXY:proxy}});
 const preference=env.STUDIO_HUNYUAN_ROUTE||'auto';
 if(!['auto','direct','proxy'].includes(preference))throw Error('STUDIO_HUNYUAN_ROUTE 须为 auto、direct 或 proxy');
 const routes=preference==='auto'?Object.keys(agents):[preference];
 const cached=new Map(),probes=new Map();

 async function probe(url,route){
  if(!agents[route])return {route,ok:false,error:'未配置代理'};
  try{
   const target=new URL(url);target.search='';target.hash='';
   const result=await send(target,{method:'HEAD',signal:AbortSignal.timeout(4000)},agents[route]);
   return {route,ok:result.status<500&&result.status!==407,http_status:result.status};
  }catch(error){return {route,ok:false,error:error.code||error.cause?.code||error.name};}
 }
 function remember(host,route){cached.set(host,{route,until:Date.now()+60_000});}
 async function select(url){
  const host=url.host,hit=cached.get(host);
  if(hit?.until>Date.now())return hit.route;
  if(probes.has(host))return probes.get(host);
  const pending=(async()=>{
   const failures=[];
   for(const route of routes){
    const result=await probe(url,route);
    if(result.ok){remember(host,route);return route;}
    failures.push(`${route} ${result.error||'HTTP '+result.http_status}`);
   }
   const error=Error('混元连接检查失败（'+failures.join('，')+'）。可在家具录入中检查连接。');
   error.code='HUNYUAN_ROUTE_UNAVAILABLE';throw error;
  })().finally(()=>probes.delete(host));
  probes.set(host,pending);
  return pending;
 }
 async function request(raw,options={}){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('混元地址必须使用 HTTPS');
  const route=await select(url);
  options.signal?.throwIfAborted();
  try{return await send(url,options,agents[route]);}
  catch(error){
   if(cached.get(url.host)?.route===route)cached.delete(url.host);
   const readOnly=options.method!=='POST'||url.pathname.endsWith('/api/3d/query');
   const other=routes.find(candidate=>candidate!==route);
   if(!readOnly||!other||options.signal?.aborted)throw error;
   const result=await send(url,options,agents[other]);
   remember(url.host,other);
   return result;
  }
 }
 async function download(url,options){
  for(let i=0;i<5;i++){
   const response=await request(url,options);
   const redirect=response.headers.get('location');
   if(![301,302,303,307,308].includes(response.status)||!redirect)return response;
   await response.body?.cancel();
   url=new URL(redirect,url).href;
  }
  throw Error('模型文件服务器重定向次数过多');
 }
 return {request,download,check:url=>Promise.all(Object.keys(agents).map(route=>probe(url,route)))};
}

module.exports={createHunyuanTransport};
