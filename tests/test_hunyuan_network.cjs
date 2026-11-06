const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHunyuanTransport}=require('../scripts/studio/hunyuan-network.cjs');

const base='https://tokenhub.tencentmaas.com/api/3d/';
const proxyEnv={HTTPS_PROXY:'http://127.0.0.1:7890'};
const reset=()=>Object.assign(Error('reset'),{code:'ECONNRESET'});

test('a blocked direct probe switches the route before a single paid submission',async()=>{
 let direct;const calls=[];
 const transport=createHunyuanTransport({env:proxyEnv,send:async(url,options,agent)=>{
  direct??=agent;
  calls.push({method:options.method,route:agent===direct?'direct':'proxy',headers:options.headers});
  if(agent===direct)throw reset();
  return new Response(null,{status:options.method==='HEAD'?404:200});
 }});
 await transport.request(base+'submit',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{}'});
 assert.deepEqual(calls.map(c=>[c.method,c.route]),[['HEAD','direct'],['HEAD','proxy'],['POST','proxy']]);
 assert(calls.slice(0,2).every(c=>!c.headers?.Authorization));
});

test('an uncertain paid POST is never replayed and a status query may change routes',async()=>{
 let direct;const calls=[];
 const transport=createHunyuanTransport({env:proxyEnv,send:async(url,{method},agent)=>{
  direct??=agent;
  calls.push([method,url.pathname,agent===direct?'direct':'proxy']);
  if(method==='POST'&&agent===direct)throw reset();
  return new Response(null,{status:method==='HEAD'?404:200});
 }});
 await assert.rejects(transport.request(base+'submit',{method:'POST',body:'{}'}),{code:'ECONNRESET'});
 assert.equal(calls.filter(([method])=>method==='POST').length,1);
 assert.equal((await transport.request(base+'query',{method:'POST',body:'{}'})).status,200);
 assert.deepEqual(calls.slice(-2).map(call=>call[2]),['direct','proxy']);
});
