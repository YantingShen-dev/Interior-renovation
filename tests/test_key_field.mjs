import assert from 'node:assert/strict';
import {setupKeyField} from '../scripts/studio/key-field.mjs';
class El{
 constructor(){this.children=[];this.value='';this.attrs={};this.listeners={};this.id='test-key';}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}insertBefore(n){n.parentElement=this;this.children.push(n);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,fn){this.listeners[k]=fn;}
}
globalThis.document={createElement:()=>new El()};const input=new El(),label=new El();label.append(input);const field=setupKeyField(input),toggle=label.children.find(x=>x.className==='api-key-field').children[1];
let release;
globalThis.fetch=async(_,options)=>{const {provider}=JSON.parse(options.body);return {ok:true,json:async()=>({key:provider==='saved'?'sk-fake-test-credential':''})};};
await field.load({kind:'chat',provider:'saved',base:'https://saved.test'});assert.equal(input.value,'sk-fake-test-credential');assert.equal(input.type,'password');assert.equal(field.value(),'');
toggle.onclick();assert.equal(input.type,'text');assert.equal(toggle.attrs['aria-pressed'],'true');toggle.onclick();assert.equal(input.type,'password');
input.value='replacement-test-key';input.listeners.input();assert.equal(field.value(),'replacement-test-key');const draft=field.capture();
await field.load({kind:'chat',provider:'empty'});assert.equal(input.value,'');assert(toggle.disabled);await field.load({},draft);assert.equal(field.value(),'replacement-test-key');assert.equal(input.type,'password');
globalThis.fetch=()=>new Promise(r=>{release=r;});const pending=field.load({kind:'chat',provider:'slow'});assert.throws(()=>field.value(),/正在读取/);field.clear();release({ok:true,json:async()=>({key:'stale-secret'})});await pending;assert.equal(input.value,'');assert.equal(input.type,'password');
console.log('PASS saved-key value, reveal/hide, untouched-save, edited drafts, empty providers and stale-response cancellation');
