import {setupKeyField} from './key-field.mjs';
import catalog from './provider-catalog.cjs';
export const {providers,matchProvider}=catalog;
const {defaults,getProvider,visionModelIssue,checkedAt}=catalog;
export function setupProviderPresets(){
 const $=id=>document.getElementById(id),controls={};
 for(const kind of ['chat','image','tripo']){
  const base=$('cfg-'+kind+'-base'),model=$('cfg-'+kind+'-model'),key=$('cfg-'+kind+'-key'),section=model.closest('section');
  const label=document.createElement('label');label.textContent='服务商';const select=document.createElement('select');select.id='cfg-'+kind+'-provider';label.append(select);section.insertBefore(label,(base||key).parentElement);
  const list=[{id:'custom',name:'自定义服务商 · 手动填写'},...providers[kind]];
  for(const p of list){const option=document.createElement('option');option.value=p.id;option.disabled=!!p.pending;option.textContent=p.name+(p.pending?' · 尚未接入':'');select.append(option);}
  const customButton=document.createElement('button');customButton.type='button';customButton.className='text-button provider-custom-button';customButton.textContent='＋ 自定义服务商';customButton.id='cfg-'+kind+'-custom';section.insertBefore(customButton,label.nextSibling);
  function field(suffix,title,placeholder){const l=document.createElement('label');l.textContent=title;const input=document.createElement('input');input.id='cfg-'+kind+'-'+suffix;input.placeholder=placeholder;l.append(input);section.insertBefore(l,(base||key).parentElement);return input;}
  const name=field('name','服务商名称','例如：我的模型服务'),keysURL=field('keys-url','获取 API 的网址（选填）','https://服务商官网/申请密钥');
  const ml=document.createElement('label');ml.textContent='选择模型';const models=document.createElement('select');models.id='cfg-'+kind+'-preset-model';ml.append(models);section.insertBefore(ml,key.parentElement);
  const note=document.createElement('div');note.className='provider-note';note.setAttribute('aria-live','polite');section.append(keysURL.parentElement);section.append(note);
  const keyLabel=key.parentElement,keyField=setupKeyField(key);
  const drafts=new Map();let previous='',profiles={};
  function capture(){return {base:base?.value||'',model:model.value,credential:keyField.capture(),name:name.value,keys_url:keysURL.value};}
  function sync(){
   const p=getProvider(kind,select.value),pending=!!p?.pending;name.parentElement.hidden=!!p;keysURL.parentElement.hidden=!!p;customButton.hidden=!p;
   if(base){base.parentElement.hidden=!!p;base.disabled=pending;}
   models.parentElement.hidden=!p;models.disabled=pending;models.replaceChildren();
   if(p){for(const value of [...p.models,...(pending?[]:['custom'])]){const o=document.createElement('option');o.value=value;o.textContent=value==='custom'?(kind==='chat'?'其他视觉模型 ID…':'其他模型 ID…'):value;models.append(o);}if(!p.models.length){const o=document.createElement('option');o.value='';o.textContent='以官方平台提供的模型为准';models.append(o);}if(model.value&&!p.models.includes(model.value)){const saved=document.createElement('option');saved.value=model.value;saved.textContent=model.value+' · 已保存 / 自定义';models.prepend(saved);}models.value=model.value||p.models[0]||'';}
   model.parentElement.hidden=pending||!!p&&models.value!=='custom';model.disabled=pending;
   keyLabel.hidden=pending;
   note.replaceChildren();
   if(p){const links=document.createElement('div');links.className='provider-links';for(const [text,url] of [['获取 '+p.name+' API ↗',p.keys],['接口文档 ↗',p.docs]]){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;links.append(a);}note.append(links);}
   const status=document.createElement('p');status.className='provider-status'+(pending?' pending':'');status.textContent=pending?'本平台尚未接入此服务，不能用于生成；请选其他已接入服务。以下链接仅供查看官方说明。':(kind==='tripo'?'已接入图片转 3D 提交、查询和 GLB 下载；账户权限与余额以实际调用为准。':kind==='chat'?'图片理解 + 对话 + 工具调用。自动建房与自由设计共用此配置。':'支持图像编辑 API 配置。');note.append(status);if(p?.models.length){const checked=document.createElement('p');checked.className='micro-note';checked.textContent='型号核对：'+checkedAt+' · 新预设优先；已保存型号不会自动替换。';note.append(checked);}
   if(p?.hint){const hint=document.createElement('p');hint.className='micro-note';hint.textContent=p.hint;note.append(hint);}
   if(!p){status.textContent=kind==='chat'?'模型须支持图片输入和工具调用；开始建房时会实际检查。支持 OpenAI Chat Completions 兼容服务；API 地址填写到 /v1 等版本路径，不含 /chat/completions。':kind==='image'?'支持 OpenAI Images Edits 兼容服务；API 地址填写到 /v1 等版本路径，不含 /images/edits。':'支持 Tripo v3 兼容服务；API 地址填写到 /v3，服务须支持文件上传、图片转模型与任务查询。';
    if(keysURL.value){try{const url=new URL(keysURL.value);if(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='获取 '+(name.value||'自定义服务商')+' API ↗';note.prepend(a);}}catch{}}
   }
  }
  function restore(id){const p=getProvider(kind,id),saved=drafts.get(id)||profiles[id]||{};if(base)base.value=saved.base??p?.base??'';model.value=saved.model??p?.models[0]??'';keyField.load(p?.pending?null:{kind,provider:id,base:base?.value||''},saved.credential);name.value=saved.name||'';keysURL.value=saved.keys_url||'';const issue=kind==='chat'?visionModelIssue(model.value):'';if(issue)model.value=p?.models[0]||'';previous=id;sync();if(issue){const warning=document.createElement('p');warning.className='micro-note';warning.textContent=issue+' 已为你选中视觉预设，保存后生效，原密钥保留。';note.append(warning);}}
  base?.addEventListener('change',()=>{keyField.load(getProvider(kind,select.value)?.pending?null:{kind,provider:select.value,base:base.value});});
  select.onchange=()=>{if(previous)drafts.set(previous,capture());restore(select.value);};customButton.onclick=()=>{select.value='custom';select.onchange();name.focus();};keysURL.onchange=sync;name.onchange=sync;
  models.onchange=()=>{model.parentElement.hidden=models.value!=='custom';if(models.value!=='custom')model.value=models.value;};
  controls[kind]={select,fields(){return {[kind+'_key']:keyField.value(),[kind+'_provider']:select.value,[kind+'_name']:name.value.trim(),[kind+'_keys_url']:keysURL.value.trim()};},load(config){drafts.clear();profiles=config?.profiles||{};const id=config?.provider||matchProvider(kind,base?.value)?.id||(base?.value?'custom':defaults[kind]);select.value=id;profiles={...profiles,[id]:{...profiles[id],base:config?.base||base?.value||undefined,model:config?.model||model.value||undefined,configured:config?.configured}};restore(id);},clear(){drafts.clear();keyField.clear();}};
 }
 return {load(config){for(const [kind,c]of Object.entries(controls))c.load(config?.[kind]);},fields(){return Object.assign({},...Object.values(controls).map(c=>c.fields()));},clear(){for(const c of Object.values(controls))c.clear();}};
}
