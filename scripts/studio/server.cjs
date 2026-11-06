/* Loopback-only provider bridge. Never serves the workspace or environment files. */
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),ENV=process.env.STUDIO_ENV_FILE||path.join(ROOT,'.env.local');
const providerConfig=require('./provider-config.cjs');
const {readSpreadsheet}=require('./render-reference.cjs');
const {downloadMesh}=require('./mesh-download.cjs');
const {createHunyuanTransport}=require('./hunyuan-network.cjs');
const {pipeline}=require('node:stream/promises');
function rawEnv(){const out={...process.env};if(fs.existsSync(ENV))for(const line of fs.readFileSync(ENV,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)out[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}return out;}
require('./network-env.cjs').configureNetwork(process.env,rawEnv().STUDIO_DIRECT_HOSTS);
function env(){return providerConfig.resolveEnv(rawEnv());}
function configuration(){return providerConfig.configuration(rawEnv());}
function saveConfig(data){const text=fs.existsSync(ENV)?fs.readFileSync(ENV,'utf8'):'';fs.writeFileSync(ENV,providerConfig.updateConfig(text,rawEnv(),data));return configuration();}
async function body(req,limit=45*1024*1024){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw new Error('请求文件过大');chunks.push(c);}return Buffer.concat(chunks);}
function dataImage(s){const m=String(s).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('图片格式无效');const bytes=Buffer.from(m[2],'base64');if(bytes.length>10*1024*1024)throw new Error('图片不能超过 10MB');return {bytes,type:m[1]};}
async function provider(url,key,options={}){
 const {rawResult=false,fetcher=fetch,...requestOptions}=options;let response;
 try{response=await fetcher(url,{...requestOptions,headers:{...(key?{Authorization:'Bearer '+key}:{}),...options.headers},signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(240000)});}
 catch(error){if(error.code==='HUNYUAN_ROUTE_UNAVAILABLE')throw error;const code=error.cause?.code||error.code||error.name;throw new Error('连接 '+new URL(url).hostname+' 失败（'+String(code).replace(/[^A-Z_a-z0-9]/g,'').slice(0,60)+'）。请检查工作台运行权限和代理配置。');}
 let result;try{result=await response.json();}catch{throw new Error('服务商返回了非 JSON 结果，HTTP '+response.status);}
 const detail=String(result.error?.message||result.message||result.msg||'请检查模型和账户配置');
 if(response.status===402&&new URL(url).hostname==='tokenhub.tencentmaas.com'){
  const note=/postpaid|后付费/i.test(detail)?'当前模型的免费额度已用完。请在 TokenHub 在线推理服务为该模型启用后付费，并核对服务状态。':'请在 TokenHub 核对该模型的服务状态、用量和计费设置。';
  throw Error('混元计费拒绝（402）。'+note);
 }
 if(!response.ok||result.code!==undefined&&result.code!==0)throw new Error('服务商请求失败（'+response.status+'）：'+detail.slice(0,400));return rawResult?result:result.data??result;
}
function createFurnitureBridge(transport){
 return require('./mesh-providers.cjs').createMeshBridge({
  dataImage,
  storageDir:process.env.STUDIO_ENV_FILE?path.join(ENV+'.data','mesh-jobs'):path.join(ROOT,'.cache/mesh-jobs'),
  credentials:job=>{
   const profile=providerConfig.resolveEnv({...rawEnv(),TRIPO_PROVIDER:job.provider});
   return {key:profile.TRIPO_API_KEY,base:profile.TRIPO_API_BASE.replace(/\/$/,'')};
  },
  request:(url,key,options={})=>{
   const host=new URL(url).hostname,hunyuan=host==='tokenhub.tencentmaas.com';
   return provider(url,key,{...options,rawResult:hunyuan||host==='api.meshy.ai',fetcher:hunyuan?transport.request:fetch});
  },
  download:(url,file,service)=>downloadMesh(url,file,service==='hunyuan'?transport.download:fetch)
 });
}
const imageBridge=require('./image-providers.cjs').createImageBridge({request:provider,dataImage,storageDir:process.env.STUDIO_ENV_FILE?path.join(ENV+'.data','render-jobs'):path.join(ROOT,'.cache/render-jobs'),credentials:job=>providerConfig.resolveEnv({...rawEnv(),IMAGE_PROVIDER:job.provider}),download:async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('效果图下载失败，可继续查询原任务，无需重新生成');if(Number(r.headers.get('content-length'))>30*1024*1024)throw Error('效果图超过 30MB');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>30*1024*1024)throw Error('效果图超过 30MB');const mime=bytes.subarray(0,4).equals(Buffer.from([137,80,78,71]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;if(!mime)throw Error('服务商返回的文件不是 PNG、JPEG 或 WebP 效果图');return 'data:'+mime+';base64,'+bytes.toString('base64');}});
const modelingAPI=require('./modeling-api.cjs').createAPI({root:ROOT,env,body,provider});
async function handle(req,res,meshBridge,transport){
 const hostname=(req.headers.host||'').split(':')[0];if(!['127.0.0.1','localhost'].includes(hostname))throw new Error('仅允许本机访问');const origin=req.headers.origin;if(origin&&origin!=='http://'+req.headers.host)throw new Error('不允许跨站请求');
 const url=new URL(req.url,'http://'+req.headers.host),route=url.pathname;const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.method==='GET'&&route==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(ROOT,'打开家具布置.html')).pipe(res);}
 if(await modelingAPI(req,res,url))return;
 if(req.method==='GET'&&route==='/api/config')return json(configuration());
 if(req.method==='GET'&&route==='/api/health')return json({ok:true,app:'space-studio',version:'0.3.0'});
 if(req.method==='GET'&&route==='/api/shared-spaces/assistant-video'){
  const file=path.join(ROOT,'本地空间','assistant-video.json');
  if(!fs.existsSync(file))return json({error:'本机尚无助手视频初稿'},404);
  const item=JSON.parse(fs.readFileSync(file,'utf8'));
  const errors=require('./state.cjs').G.validate(item.scene);
  if(errors.length)throw new Error('本地视频初稿校验失败：'+errors.join('；'));
  return json({name:item.name,scene:item.scene,thumbnail:item.thumbnail});
 }
 if(req.method==='POST'&&route==='/api/video/frames'){
  if(req.headers['content-type']!=='application/octet-stream')throw Error('请选择视频文件');
  const extension=String(req.headers['x-video-extension']||'').toLowerCase();
  if(!['mp4','mov','mkv','webm','avi','m4v'].includes(extension))throw Error('视频格式不支持');
  const sampling=require('./video-sampling.cjs').samplingOptions({mode:req.headers['x-frame-interval']!==undefined?'interval':'count',count:req.headers['x-frame-count'],interval:req.headers['x-frame-interval'],limit:req.headers['x-frame-limit']});
  if(handle.extracting)throw Error('正在读取另一个视频，请稍后重试');
  handle.extracting=true;const controller=new AbortController(),closed=()=>controller.abort();res.once('close',closed);
  try{const bytes=await body(req,300*1024*1024);return json(await require('./video-extract.cjs').extract(ROOT,bytes,extension,{signal:controller.signal,sampling,env:rawEnv()}));}
  finally{handle.extracting=false;res.off('close',closed);}
 }
 if(req.method==='GET'&&/^\/api\/render\/[a-f0-9-]{36}$/.test(route))return json(await imageBridge.poll(route.slice('/api/render/'.length)));
 if(req.method==='GET'&&route==='/api/tripo/tasks')return json({tasks:meshBridge.list()});
 if(req.method==='GET'&&route==='/api/tripo/network')return json({routes:await transport.check('https://tokenhub.tencentmaas.com/api/3d/submit')});
 const mesh=route.match(/^\/api\/tripo\/([a-f0-9-]{36})(\/model)?$/);
 if(req.method==='GET'&&mesh){
  const id=mesh[1];
  if(!mesh[2])return json(await meshBridge.poll(id,{retryDownload:url.searchParams.get('retry_download')==='1'}));
  const file=meshBridge.modelFile(id);
  if(!file)return json({error:'没有可用的本地模型文件'},404);
  res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':fs.statSync(file).size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  return pipeline(fs.createReadStream(file),res);
 }
 if(req.method!=='POST'){res.writeHead(404);return res.end('Not found');}
 if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('API 请求须使用 JSON');const data=JSON.parse((await body(req)).toString('utf8')),e=env();
 if(route==='/api/render/attachment')return json(await readSpreadsheet(data,ROOT));
 if(route==='/api/config/key'){if(req.headers['x-studio-key-access']!=='settings')throw Error('请从配置服务查看密钥');return json(providerConfig.savedKey(rawEnv(),data));}
 if(route==='/api/config')return json(saveConfig(data));
 if(route==='/api/tripo'){providerConfig.requireProvider('tripo',e);if(!configuration().tripo.configured)throw Error('请先配置 3D 服务地址、模型 ID 和密钥');return json(await meshBridge.submit(e,data));}
 if(route==='/api/design'){const chatProvider=providerConfig.requireProvider('chat',e);if(!configuration().chat.configured)throw new Error('请先配置对话 API 地址、模型 ID 和密钥');if(!data.prompt||!data.context?.room)throw new Error('缺少设计需求或空间数据');return require('./design-service.cjs').handleDesign(req,res,{env:e,provider:chatProvider,input:data});}
 if(route==='/api/render'){providerConfig.requireProvider('image',e);return json(await imageBridge.submit(e,data));}
 res.writeHead(404);res.end('Not found');
}
function createServer({transport=createHunyuanTransport({env:rawEnv()})}={}){
 const meshBridge=createFurnitureBridge(transport);
 return http.createServer((req,res)=>{handle(req,res,meshBridge,transport).catch(error=>{if(!res.headersSent){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:error.message}));}else res.end();});});
}
if(require.main===module){const server=createServer(),port=Number(process.env.STUDIO_PORT||8765);server.listen(port,'127.0.0.1',()=>console.log('Space Studio http://127.0.0.1:'+port));server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'工作台已在此端口运行：http://127.0.0.1:'+port:error.message);process.exitCode=1;});}
module.exports={createServer,configuration,dataImage};
