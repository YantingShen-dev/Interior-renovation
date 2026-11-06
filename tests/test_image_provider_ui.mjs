import assert from 'node:assert/strict';
import {setupProviderPresets} from '../scripts/studio/provider-presets.mjs';
import config from '../scripts/studio/provider-config.cjs';
const ids={};
class El{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.nodeType=1;this.value='';this.listeners={};this.attrs={};this.hidden=false;this.disabled=false;}
 set id(v){this._id=v;ids[v]=this;}get id(){return this._id;}
 set textContent(v){this._text=v;this.children=[{nodeType:3,textContent:v,parentElement:this}];}get textContent(){return this._text;}
 get firstChild(){return this.children[0];}get nextSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1];}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(x=>x!==n);n.parentElement=this;this.children.push(n);}}prepend(...nodes){for(const n of nodes.reverse()){n.parentElement=this;this.children.unshift(n);}}
 insertBefore(n,before){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(x=>x!==n);const index=this.children.indexOf(before);n.parentElement=this;index<0?this.children.push(n):this.children.splice(index,0,n);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.listeners[k]=f;}focus(){}closest(tag){for(let p=this;p;p=p.parentElement)if(p.tagName===tag)return p;return null;}
}
globalThis.document={getElementById:id=>ids[id],createElement:tag=>new El(tag)};
for(const kind of ['chat','image','tripo']){const section=new El('section');for(const field of ['base','model','key']){const label=new El('label');label.textContent=field;const input=new El('input');input.id='cfg-'+kind+'-'+field;label.append(input);section.append(label);}}
globalThis.fetch=async()=>({ok:true,json:async()=>({key:''})});
const ui=setupProviderPresets();ui.load(config.configuration({}));await new Promise(r=>setImmediate(r));
const select=ids['cfg-image-provider'];assert.equal(select.children.filter(o=>o.nodeType===1).length,7);assert(select.children.filter(o=>o.nodeType===1).every(o=>!o.disabled));
for(const id of ['openai','gemini','qwen','hunyuan','jimeng','kling']){select.value=id;select.onchange();await new Promise(r=>setImmediate(r));assert(!ids['cfg-image-key'].parentElement.parentElement.hidden);assert(!ids['cfg-image-preset-model'].disabled);assert(ids['cfg-image-model'].value);assert.equal(ui.fields().image_provider,id);}
select.value='hunyuan';select.onchange();await new Promise(r=>setImmediate(r));assert.equal(ids['cfg-image-access-id'].parentElement.parentElement.hidden,false);
select.value='kling';select.onchange();await new Promise(r=>setImmediate(r));assert.equal(ids['cfg-image-auth-mode'].parentElement.hidden,false);assert.equal(ids['cfg-image-access-id'].parentElement.parentElement.hidden,true);ids['cfg-image-auth-mode'].value='pair';ids['cfg-image-auth-mode'].onchange();await new Promise(r=>setImmediate(r));assert.equal(ids['cfg-image-access-id'].parentElement.parentElement.hidden,false);assert.equal(ui.fields().image_auth_mode,'pair');
select.value='qwen';select.onchange();await new Promise(r=>setImmediate(r));assert.equal(ids['cfg-image-base'].parentElement.hidden,false);ui.clear();assert.equal(ids['cfg-image-access-id'].value,'');
console.log('PASS all six image providers are enabled with appropriate single/pair credential controls, model lists and region address');
