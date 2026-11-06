const {providers,defaults,matchProvider,getProvider,visionModelIssue}=require('./provider-catalog.cjs');
const kinds=['chat','image','tripo'];
const prefix=(kind,id)=>'STUDIO_'+kind.toUpperCase()+'_'+id.toUpperCase().replace(/-/g,'_')+'_';
const legacyId=(kind,e)=>kind==='tripo'?'tripo':matchProvider(kind,e[kind.toUpperCase()+'_API_BASE'])?.id||(e[kind.toUpperCase()+'_API_BASE']?'custom':defaults[kind]);
function selected(kind,e){const id=e[kind.toUpperCase()+'_PROVIDER']||legacyId(kind,e);if(!getProvider(kind,id)&&!(id==='custom'))throw new Error('未知服务商：'+kind);return id;}
function profile(kind,id,e){
 const p=getProvider(kind,id),pre=prefix(kind,id),old=legacyId(kind,e)===id,upper=kind.toUpperCase();
 const accessId=e[pre+'ACCESS_ID']??(old?e[upper+'_ACCESS_ID']:undefined)??'';
 return {name:e[pre+'NAME']||'',keys_url:e[pre+'KEYS_URL']||'',base:(e[pre+'BASE']??(old?e[upper+'_API_BASE']:undefined))||p?.base||'',model:e[pre+'MODEL']??(old?e[upper+'_MODEL']:undefined)??p?.models[0]??'',key:e[pre+'KEY']??(old?e[upper+'_API_KEY']:undefined)??'',access_id:accessId,auth_mode:p?.auth==='pair'?'pair':e[pre+'AUTH_MODE']||(accessId?'pair':'key')};
}
function resolveEnv(e){const out={...e};for(const kind of kinds){const id=selected(kind,e),p=profile(kind,id,e),upper=kind.toUpperCase();out[upper+'_PROVIDER']=id;out[upper+'_API_BASE']=p.base;out[upper+'_MODEL']=p.model;out[upper+'_API_KEY']=p.key;out[upper+'_ACCESS_ID']=p.access_id;out[upper+'_AUTH_MODE']=p.auth_mode;}return out;}
function publicProfile(kind,id,e){const p=profile(kind,id,e),preset=getProvider(kind,id),pending=!!preset?.pending,issue=kind==='chat'?visionModelIssue(p.model):'',pair=preset?.auth==='pair'||preset?.auth==='key-or-pair'&&p.auth_mode==='pair';return {has_key:!pending&&!!p.key,has_access_id:!pending&&!!p.access_id,auth:preset?.auth||'key',auth_mode:p.auth_mode,max_images:preset?.maxImages||5,issue,name:p.name,keys_url:p.keys_url,base:p.base,model:p.model,pending,configured:!pending&&!issue&&!!(p.key&&p.model&&p.base&&(!pair||p.access_id))};}
function configuration(e){const out={};for(const kind of kinds){const id=selected(kind,e),ids=providers[kind].map(p=>p.id);ids.push('custom');out[kind]={...publicProfile(kind,id,e),provider:id,profiles:Object.fromEntries(ids.map(id=>[id,publicProfile(kind,id,e)]))};}return out;}
function validValue(value){value=String(value);if(/[\r\n\0]/.test(value)||value.length>3000)throw new Error('配置格式无效');return value;}
function validateBase(value){if(!value)return;const url=new URL(value);if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含密钥、查询参数或片段');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('远端 API 地址须使用 HTTPS');}
function updateConfig(text,e,data){
 const updates={};
 for(const kind of kinds){
  if(!Object.keys(data).some(k=>k.startsWith(kind+'_')))continue;
  const id=validValue(data[kind+'_provider']??selected(kind,e)),p=getProvider(kind,id);
  if(!p&&!(id==='custom'))throw new Error('未知服务商：'+kind);
  const pre=prefix(kind,id),existing=profile(kind,id,e),base=validValue(p?.allowCustomBase?(data[kind+'_base']||existing.base||p.base):p?.base??data[kind+'_base']??existing.base),model=validValue(data[kind+'_model']??existing.model);
  validateBase(base);if(kind==='chat'&&visionModelIssue(model))throw new Error(visionModelIssue(model));updates[kind.toUpperCase()+'_PROVIDER']=id;
  // Retain every provider's key independently; never move a key to another host.
  updates[pre+'BASE']=base;updates[pre+'MODEL']=model;
  if(p?.auth==='key-or-pair'){const mode=validValue(data[kind+'_auth_mode']||existing.auth_mode);if(!['key','pair'].includes(mode))throw Error('请选择 API Key 或 AK/SK 鉴权方式');if(mode!==existing.auth_mode&&existing.key&&!data[kind+'_key'])throw Error('切换鉴权方式后请重新填写对应的 API Key 或 Secret Key');updates[pre+'AUTH_MODE']=mode;}
  if(id==='custom'){
   const name=validValue(data[kind+'_name']??existing.name),keysURL=validValue(data[kind+'_keys_url']??existing.keys_url);
   if(keysURL){const url=new URL(keysURL);if(url.username||url.password||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('获取 API 的网址须使用 HTTPS');}
   updates[pre+'NAME']=name;updates[pre+'KEYS_URL']=keysURL;
  }
  if(!p?.pending){
   const key=validValue(data[kind+'_key']||'');
   updates[pre+'KEY']=key||(base===existing.base?existing.key:'');
   if(['pair','key-or-pair'].includes(p?.auth)){const accessId=validValue(data[kind+'_access_id']||'');updates[pre+'ACCESS_ID']=accessId||(base===existing.base?existing.access_id:'');}
  }
 }
 if(Object.keys(data).some(k=>k.startsWith('vision_')))throw new Error('视觉配置已合并到首页「配置服务」，请刷新页面后使用统一设置。');
 for(const [name,value]of Object.entries(updates)){const line=name+'='+value,re=new RegExp('^'+name+'=.*$','m');text=re.test(text)?text.replace(re,()=>line):text.trimEnd()+'\n'+line+'\n';}
 return text;
}
function requireProvider(kind,e){const p=getProvider(kind,e[kind.toUpperCase()+'_PROVIDER']);if(p?.pending)throw new Error(p.name+' 的 API 入口已收录，平台内调用尚未接入。请在设置中选择已接入的服务。');return p;}
function savedKey(e,{kind,provider,base,field='key'}){
 if(!kinds.includes(kind))throw Error('未知密钥类型');
 const id=provider||selected(kind,e),p=getProvider(kind,id);
 if(!p&&id!=='custom')throw Error('未知服务商');
 if(p?.pending)return {key:''};
 const stored=profile(kind,id,e);
 if(!['key','access_id'].includes(field))throw Error('未知凭据字段');
 return {key:base===stored.base?(field==='access_id'&&!['pair','key-or-pair'].includes(p?.auth)?'':stored[field]):''};
}
module.exports={configuration,resolveEnv,updateConfig,requireProvider,savedKey};
