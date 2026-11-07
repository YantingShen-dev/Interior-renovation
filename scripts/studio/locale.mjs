import {english,translatePattern} from './locale-en.mjs';

const storageKey='polylab-ui-language';
let language='zh-CN';
try{if(globalThis.localStorage?.getItem(storageKey)==='en')language='en';}catch{}

export function t(text){
 if(language!=='en'||typeof text!=='string')return text;
 const key=text.trim();
 const translated=english.get(key)??translatePattern(key);
 return translated===undefined?text:text.replace(key,()=>translated);
}

export function setupLocale(){
 if(typeof MutationObserver==='undefined'||!document.documentElement)return;
 const attributes=['title','placeholder','aria-label','alt'];
 const textSources=new WeakMap(),attributeSources=new WeakMap();
 const excluded='[data-user-text],[data-language-toggle],script,style,pre,code';

 function updateText(node){
  const parent=node.parentElement;
  if(!parent||parent.closest(excluded)||parent.tagName==='TEXTAREA')return;
  const previous=textSources.get(node),current=node.nodeValue;
  const source=current===previous?.display?previous.source:current;
  const display=t(source);
  if(display!==source||previous)textSources.set(node,{source,display});
  if(display===current)return;
  // Keep the original select value when an option uses its label as its value.
  if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.value=parent.value;
  node.nodeValue=display;
 }

 function updateAttribute(element,name){
  if(element.closest(excluded))return;
  const current=element.getAttribute(name);
  if(current===null)return;
  let state=attributeSources.get(element);
  const previous=state?.get(name),source=current===previous?.display?previous.source:current;
  const display=t(source);
  if(display!==source||previous){
   if(!state){state=new Map();attributeSources.set(element,state);}
   state.set(name,{source,display});
  }
  if(display!==current)element.setAttribute(name,display);
 }

 function updateTree(root){
  if(root.nodeType===Node.TEXT_NODE){updateText(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE||root.closest(excluded))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  for(let node=walker.currentNode;node;node=walker.nextNode()){
   if(node.nodeType===Node.TEXT_NODE)updateText(node);
   else for(const name of attributes)if(node.hasAttribute(name))updateAttribute(node,name);
  }
 }

 const buttons=[...document.querySelectorAll('[data-language-toggle]')];
 const title=document.title;
 function updateLanguage(){
  document.documentElement.lang=language;
  document.title=t(title);
  for(const button of buttons){
   button.textContent=language==='en'?'中文':'English';
   button.setAttribute('aria-label',language==='en'?'切换为中文':'Switch to English');
  }
  updateTree(document.body);
 }
 for(const button of buttons)button.addEventListener('click',()=>{
  language=language==='en'?'zh-CN':'en';
  try{localStorage.setItem(storageKey,language);}catch{}
  updateLanguage();
 });
 updateLanguage();
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes')updateAttribute(record.target,record.attributeName);
   else if(record.type==='characterData')updateText(record.target);
   else for(const node of record.addedNodes)updateTree(node);
  }
 }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
}
