const assert=require('node:assert/strict');
const {providers,getProvider}=require('../scripts/studio/provider-catalog.cjs');
const {configuration,resolveEnv,updateConfig,requireProvider}=require('../scripts/studio/provider-config.cjs');
const parse=text=>Object.fromEntries(text.trim().split('\n').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
let text='CHAT_API_BASE=https://api.deepseek.com\nCHAT_MODEL=deepseek-flash\nCHAT_API_KEY=old-private-key\nTRIPO_API_KEY=tripo-private-key\n';
const save=data=>{text=updateConfig(text,parse(text),data);return resolveEnv(parse(text));};
assert.equal(configuration(parse(text)).chat.provider,'deepseek');
assert.equal(configuration(parse(text)).tripo.provider,'tripo');
assert(!JSON.stringify(configuration(parse(text))).includes('private-key'));
console.log('PASS legacy settings migrate without exposing keys');
let e=save({chat_provider:'kimi',chat_model:'kimi-k3.1-pro',chat_key:''});
assert.equal(e.CHAT_API_KEY,'');assert(!configuration(parse(text)).chat.configured);
e=save({chat_provider:'kimi',chat_model:'kimi-k3.1-pro',chat_key:'kimi-private-key'});
assert.equal(e.CHAT_API_KEY,'kimi-private-key');assert.equal(e.CHAT_API_BASE,'https://api.moonshot.cn/v1');
e=save({chat_provider:'deepseek',chat_key:''});assert.equal(e.CHAT_API_KEY,'old-private-key');
e=save({chat_provider:'kimi',chat_key:''});assert.equal(e.CHAT_API_KEY,'kimi-private-key');
assert(!JSON.stringify(configuration(parse(text))).includes('private-key'));
console.log('PASS switching providers isolates credentials and restores each provider');
e=save({chat_provider:'custom',chat_base:'https://one.example.test/v1',chat_model:'a',chat_key:'custom-private-key'});
e=save({chat_provider:'custom',chat_base:'https://two.example.test/v1',chat_model:'a',chat_key:''});assert.equal(e.CHAT_API_KEY,'');
assert.throws(()=>save({chat_provider:'unknown'}),/未知/);
assert.throws(()=>save({chat_provider:'custom',chat_base:'https://user:secret@example.test/v1'}),/API 地址/);
assert.throws(()=>save({chat_key:'key\nINJECTED=true'}),/配置格式/);
console.log('PASS a changed custom host cannot inherit a key and invalid settings are rejected');
for(const p of providers.image){
 e=save({image_provider:p.id,image_model:p.models[0],image_key:'fake-image-'+p.id,...(p.auth==='pair'?{image_access_id:'fake-access-'+p.id}:{})});
 assert(!requireProvider('image',e)?.pending);assert(configuration(parse(text)).image.configured);assert.equal(e.IMAGE_API_BASE,p.base);
 assert(!JSON.stringify(configuration(parse(text))).includes('fake-image-'));assert(!JSON.stringify(configuration(parse(text))).includes('fake-access-'));
}
e=save({tripo_provider:'rodin'});assert.throws(()=>requireProvider('tripo',e),/尚未接入/);assert.equal(e.TRIPO_API_KEY,'');
e=save({tripo_provider:'tripo'});assert.equal(e.TRIPO_API_KEY,'tripo-private-key');
console.log('PASS all image providers are configurable while directory-only 3D integrations stay guarded');
for(const [kind,list]of Object.entries(providers))for(const p of list){assert.equal(new URL(p.keys).protocol,'https:');assert.equal(new URL(p.docs).protocol,'https:');if(!p.pending){assert(p.base);assert(p.models.length);}assert.equal(getProvider(kind,p.id),p);}
assert.deepEqual(providers.image.map(p=>p.id),['openai','gemini','qwen','hunyuan','jimeng','kling']);
assert.deepEqual(providers.tripo.map(p=>p.id),['hunyuan','tripo','rodin','meshy']);
for(const id of ['deepseek','kimi','qwen-cn','glm','minimax','openai','claude','gemini','grok'])assert(getProvider('chat',id));
console.log('PASS every requested provider has its own official API and documentation links');
for(const kind of ['chat','image','tripo']){
 const custom={provider:'custom',name:'My '+kind+' provider',keys_url:'https://keys.example.test/apply',base:'https://'+kind+'.example.test/'+(kind==='tripo'?'v3':'v1'),model:'user-model-id',key:kind+'-private-key'};
 e=save(Object.fromEntries(Object.entries(custom).map(([k,v])=>[kind+'_'+k,v])));
 const c=configuration(parse(text))[kind];
 assert.equal(c.provider,'custom');assert.equal(c.name,custom.name);assert.equal(c.keys_url,custom.keys_url);assert.equal(c.base,custom.base);assert.equal(c.model,custom.model);assert(c.configured);
 assert.equal(e[kind.toUpperCase()+'_API_BASE'],custom.base);
 const known=kind==='tripo'?'tripo':kind==='chat'?'deepseek':'openai';
 save({[kind+'_provider']:known});save({[kind+'_provider']:'custom',[kind+'_key']:''});
 assert.equal(configuration(parse(text))[kind].name,custom.name);
 assert.equal(resolveEnv(parse(text))[kind.toUpperCase()+'_API_KEY'],custom.key);
}
assert.throws(()=>save({tripo_provider:'custom',tripo_keys_url:'javascript:alert(1)'}),/HTTPS/);
e=save({tripo_provider:'custom',tripo_base:'https://changed.example.test/v3',tripo_key:''});assert.equal(e.TRIPO_API_KEY,'');
console.log('PASS all three categories round-trip custom names, models, addresses and API links without leaking keys');
const vision=require('../scripts/studio/vision-modeling.cjs');
const {visionModelIssue}=require('../scripts/studio/provider-catalog.cjs');
const shared=resolveEnv({CHAT_API_BASE:'https://api.deepseek.com',CHAT_MODEL:'deepseek-flash',CHAT_API_KEY:'shared-test-key',VISION_API_BASE:'https://stale.example/v1',VISION_MODEL:'stale-model',VISION_API_KEY:'stale-key'});
assert.deepEqual(vision.config(shared),{base:'https://api.deepseek.com',model:'deepseek-flash',key:'shared-test-key'});
assert.equal(vision.config({VISION_API_KEY:'stale-key'}).key,undefined);
assert.throws(()=>updateConfig('',{}, {vision_model:'obsolete'}),/合并/);
for(const p of providers.chat)for(const model of p.models)assert.equal(visionModelIssue(model),'');
for(const model of ['qwen-plus','deepseek-reasoner','glm-5.3']){
 assert(visionModelIssue(model));
 assert.throws(()=>updateConfig('',{}, {chat_provider:'custom',chat_model:model}),/视觉/);
 const old={CHAT_API_BASE:'https://api.deepseek.com',CHAT_MODEL:model,CHAT_API_KEY:'retained-key'};
 assert(!configuration(old).chat.configured);
 assert(configuration(old).chat.issue);
 assert.equal(resolveEnv(old).CHAT_API_KEY,'retained-key');
}
console.log('PASS unified vision configuration ignores stale overrides, preserves credentials and rejects removed presets');

const {savedKey}=require('../scripts/studio/provider-config.cjs');
const credentials={CHAT_API_BASE:'https://api.deepseek.com',CHAT_MODEL:'deepseek-flash',CHAT_API_KEY:'fake-reveal-key'};
assert.equal(savedKey(credentials,{kind:'chat',provider:'deepseek',base:'https://api.deepseek.com'}).key,'fake-reveal-key');
assert.equal(savedKey(credentials,{kind:'chat',provider:'kimi',base:'https://api.moonshot.cn/v1'}).key,'');
assert.equal(savedKey(credentials,{kind:'chat',provider:'deepseek',base:'https://changed.test'}).key,'');
assert.throws(()=>savedKey(credentials,{kind:'bad'}));
assert(!JSON.stringify(configuration(credentials)).includes('fake-reveal-key'));assert(configuration(credentials).chat.has_key);
console.log('PASS explicit saved-key access is isolated by provider and base; public config stays secret-free');

assert.equal(getProvider('chat','openai').models[0],'gpt-6.1-sol');
assert.equal(getProvider('chat','qwen-cn').models[0],'qwen3.8-max');
assert.equal(visionModelIssue('glm-5.3-flash'),'');
const retained=resolveEnv({CHAT_PROVIDER:'openai',STUDIO_CHAT_OPENAI_MODEL:'gpt-4.1-mini',STUDIO_CHAT_OPENAI_KEY:'test-retain'});
assert.equal(retained.CHAT_MODEL,'gpt-4.1-mini');assert.equal(retained.CHAT_API_KEY,'test-retain');
console.log('PASS refreshed presets preserve explicitly saved models and GLM visual models are allowed');

let pairText=updateConfig('',{},{image_provider:'hunyuan',image_key:'fake-hy-secret'});
assert(!configuration(parse(pairText)).image.configured);
pairText=updateConfig(pairText,parse(pairText),{image_provider:'hunyuan',image_access_id:'fake-hy-access'});
assert(configuration(parse(pairText)).image.configured);
assert.equal(savedKey(parse(pairText),{kind:'image',provider:'hunyuan',base:'https://hunyuan.tencentcloudapi.com',field:'access_id'}).key,'fake-hy-access');
assert.equal(savedKey(parse(pairText),{kind:'image',provider:'kling',base:'https://api-singapore.klingai.com/v1',field:'access_id'}).key,'');
pairText=updateConfig(pairText,parse(pairText),{image_provider:'kling',image_key:'fake-current-key',image_auth_mode:'key'});
assert(configuration(parse(pairText)).image.configured);
assert.throws(()=>updateConfig(pairText,parse(pairText),{image_provider:'kling',image_auth_mode:'pair',image_access_id:'fake-legacy-id'}),/重新填写/);
pairText=updateConfig(pairText,parse(pairText),{image_provider:'kling',image_auth_mode:'pair',image_access_id:'fake-legacy-id',image_key:'fake-legacy-secret'});
assert(configuration(parse(pairText)).image.configured);assert.equal(resolveEnv(parse(pairText)).IMAGE_AUTH_MODE,'pair');
assert(!JSON.stringify(configuration(parse(pairText))).includes('fake-legacy-'));
pairText=updateConfig(pairText,parse(pairText),{image_provider:'qwen',image_base:'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',image_key:'fake-workspace-key'});
assert.equal(resolveEnv(parse(pairText)).IMAGE_API_BASE,'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1');
pairText=updateConfig(pairText,parse(pairText),{image_provider:'qwen',image_base:'https://another.ap-southeast-1.maas.aliyuncs.com/api/v1'});
assert.equal(resolveEnv(parse(pairText)).IMAGE_API_KEY,'');
console.log('PASS pair credentials, modern Kling keys, explicit auth-mode changes and workspace hosts stay isolated');
