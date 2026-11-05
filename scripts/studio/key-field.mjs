// Actual saved value lives in a password input; unchanged values are not re-submitted.
export function setupKeyField(input){
 const label=input.parentElement,wrap=document.createElement('span'),toggle=document.createElement('button'),status=document.createElement('span');
 wrap.className='api-key-field';label.insertBefore(wrap,input);wrap.append(input,toggle);label.append(status);
 toggle.type='button';toggle.className='api-key-eye';toggle.id=input.id+'-toggle';
 status.className='api-key-state';status.setAttribute('aria-live','polite');
 let saved=false,dirty=false,loading=false,error='',ticket=0;
 function mask(){input.type='password';toggle.setAttribute('aria-label','显示 API Key');toggle.setAttribute('aria-pressed','false');toggle.title='显示 API Key';toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';}
 function render(){status.textContent=loading?'正在读取…':error|| (dirty?(input.value?'已修改 · 保存后生效':'留空将保留已保存密钥'):saved?'已保存':'未填写');toggle.disabled=loading||!input.value;input.disabled=loading;input.placeholder='填写 API Key';}
 input.addEventListener('input',()=>{dirty=true;error='';render();});
 toggle.onclick=()=>{if(input.type==='password'){input.type='text';toggle.setAttribute('aria-label','隐藏 API Key');toggle.setAttribute('aria-pressed','true');toggle.title='隐藏 API Key';toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM3 3l18 18"/><circle cx="12" cy="12" r="3"/></svg>';}else mask();};
 mask();render();
 return {
  capture:()=>({value:input.value,dirty,saved}),
  value(){if(loading)throw Error('密钥正在读取，请稍候保存');if(error)throw Error(error);return dirty?input.value:'';},
  async load(descriptor,draft){
   const current=++ticket;mask();input.value='';dirty=false;saved=false;error='';loading=false;
   if(draft?.dirty){input.value=draft.value;dirty=true;saved=draft.saved;render();return;}
   if(!descriptor){render();return;}
   loading=true;render();
   try{const r=await fetch('/api/config/key',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Key-Access':'settings'},body:JSON.stringify(descriptor),cache:'no-store'});const data=await r.json();if(current!==ticket)return;if(!r.ok)throw Error(data.error||'已保存密钥读取失败，请重新打开设置');input.value=data.key||'';saved=!!input.value;}
   catch(e){if(current===ticket)error=e.message;}
   finally{if(current===ticket){loading=false;render();}}
  },
  clear(){ticket++;input.value='';dirty=false;saved=false;loading=false;error='';mask();render();}
 };
}
