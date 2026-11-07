import data from './data-copy.cjs';
export function mergeAssets(library,sceneAssets,removed=[]){
 const result=new Map(library.map(a=>[a.id,data.copy(a)]));
 for(const a of sceneAssets)if(!result.has(a.id)&&!removed.includes(a.id)&&!a.unavailable)result.set(a.id,data.copy(a));
 return [...result.values()];
}

// Build and validate the entire change before writing anything to IndexedDB.
export function updateItems(items,ids,action,patch={},asset=false,now=Date.now()){
 const selected=new Set(ids),targets=items.filter(a=>selected.has(a.id));
 if(!targets.length||targets.length!==selected.size)throw new Error('所选条目已变化，请重新选择');
 if(targets.some(a=>a.deleted_at))throw new Error('条目状态已变化，请重新选择');
 if(!['edit','delete'].includes(action))throw new Error('不支持的操作');
 if(action==='edit'){
  if(!['keep','single','prefix','numbered'].includes(patch.naming||'keep'))throw new Error('名称操作无效');
  if(patch.naming==='single'&&targets.length!==1)throw new Error('多个条目请使用前缀或编号命名');
  if(patch.naming&&patch.naming!=='keep'&&!String(patch.name||'').trim())throw new Error('请填写名称或前缀');
  if(asset){
   if(patch.source_url){let url;try{url=new URL(patch.source_url);}catch{throw new Error('家具详情链接请输入完整网址');}if(!['http:','https:'].includes(url.protocol))throw new Error('链接只支持 http:// 或 https://');}
   if(!['keep','soft','hard'].includes(patch.category||'keep'))throw new Error('分区无效');
   if(patch.category==='soft'&&targets.some(a=>a.asset_type==='finish'))throw new Error('墙地材料只能放在硬装分区');
   if(!['keep','set','percent','clear'].includes(patch.priceMode||'keep'))throw new Error('价格操作无效');
   if(['set','percent'].includes(patch.priceMode)&&(!Number.isFinite(patch.price)||patch.priceMode==='set'&&patch.price<0||patch.priceMode==='percent'&&patch.price< -100))throw new Error('请输入有效价格；价格不能为负，调价幅度不能低于 -100%');
   if(patch.priceMode==='set'&&new Set(targets.map(a=>a.asset_type==='finish'?'area':'piece')).size>1)throw new Error('按件与按平方米的资产请分开设置统一价格，也可使用百分比调价');
  }
 }
 if(action==='delete')return items.filter(a=>!selected.has(a.id));
 let index=0;
 return items.map(original=>{
  if(!selected.has(original.id))return original;
  const item=data.copy(original);index++;
  {
   const key=asset?'label':'name',text=String(patch.name||'').trim();
   if(patch.naming==='single')item[key]=text;
   if(patch.naming==='prefix')item[key]=text+item[key];
   if(patch.naming==='numbered')item[key]=text+' '+String(index).padStart(2,'0');
   if(item[key].length>120)throw new Error('名称不能超过 120 个字符');
   if(asset){
    if(patch.source_url!==undefined)item.source_url=patch.source_url.trim();
    if(patch.category&&patch.category!=='keep')item.category=patch.category;
    if(patch.priceMode==='clear')delete item.price_cny;
    if(patch.priceMode==='set')item.price_cny=patch.price;
    if(patch.priceMode==='percent'&&Number.isFinite(item.price_cny))item.price_cny=Math.round(item.price_cny*(1+patch.price/100)*100)/100;
    if(item.price_cny!==undefined&&(!Number.isFinite(item.price_cny)||item.price_cny<0))throw new Error('调价结果超出范围');
    if(patch.priceMode&&patch.priceMode!=='keep')item.price_kind='user_input';
   }
  }
  item.updated=now;return item;
 });
}

export function setupManagement({apply,render,toast,deleteDetails=()=>[]}){
 const states=new Map(),views=new Map();let editing=null,deleting=null,busy=false;
 const $=id=>document.getElementById(id),dialog=$('batch-edit-dialog'),confirm=$('delete-confirm-dialog'),single=$('item-edit-dialog');
 const state=scope=>{if(!states.has(scope))states.set(scope,{selected:new Set(),managing:false});return states.get(scope);};
 const attempt=fn=>async()=>{if(busy)return;try{await fn();}catch(e){toast(e.message,true);}};
 function button(label,fn,disabled=false){const b=document.createElement('button');b.type='button';b.className='quiet-button';b.textContent=label;b.disabled=disabled;b.onclick=attempt(fn);return b;}
 function controls(scope){const s=state(scope);for(const [id,view]of views){if(view.scope!==scope)continue;const bar=$(id);bar.replaceChildren();if(!s.managing){bar.append(button('批量管理',()=>{s.managing=true;render();},!view.items.length));continue;}const count=document.createElement('span');count.className='selection-count';count.textContent='已选 '+s.selected.size+' / '+view.items.length;bar.append(count,button(s.selected.size===view.items.length&&view.items.length?'取消全选':'全选',()=>{s.selected=s.selected.size===view.items.length?new Set():new Set(view.items.map(a=>a.id));render();},!view.items.length),button('批量编辑',()=>edit(scope,view.items.filter(a=>s.selected.has(a.id))),!s.selected.size),button('删除所选',()=>askDelete(scope,view.items.filter(a=>s.selected.has(a.id))),!s.selected.size),button('完成',()=>{s.managing=false;s.selected.clear();render();}));}}
 async function execute(scope,action,ids,patch){if(!ids.length)return;busy=true;document.body.dataset.managing='true';$('delete-confirm-apply').disabled=true;try{await apply(scope,action,ids,patch);state(scope).selected.clear();dialog.close();single.close();confirm.close();render();toast(action==='delete'?'已彻底删除 '+ids.length+' 项':'已更新 '+ids.length+' 项');}finally{busy=false;delete document.body.dataset.managing;$('delete-confirm-apply').disabled=false;}}
 function askDelete(scope,items){if(!items.length)return;deleting={scope,ids:items.map(a=>a.id)};$('delete-confirm-title').textContent=items.length===1?'删除此条目？':'删除所选 '+items.length+' 项？';$('delete-confirm-list').replaceChildren();for(const item of items){const li=document.createElement('li');li.textContent=item.label||item.name;$('delete-confirm-list').append(li);}$('delete-confirm-note').textContent='删除后无法恢复。'+(scope==='assets'?'已有设计中的已用物件会保留快照。':scope==='space'?'删除根空间会同时删除其下的全部子设计（共 '+deleteDetails(scope,deleting.ids).length+' 个）。确定继续删除吗？':'请确认这些内容不再需要。');confirm.showModal();}
 function begin(barId,scope,items){const s=state(scope),visible=items.filter(a=>!a.deleted_at);s.selected=new Set([...s.selected].filter(id=>visible.some(a=>a.id===id)));views.set(barId,{scope,items:visible});controls(scope);return visible;}
 function decorate(card,item,scope){const s=state(scope);card.classList.toggle('is-selected',s.managing&&s.selected.has(item.id));if(s.managing){const label=document.createElement('label'),check=document.createElement('input');label.className='item-select';check.type='checkbox';check.checked=s.selected.has(item.id);check.setAttribute('aria-label','选择 '+(item.label||item.name));label.append(check);label.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)s.selected.add(item.id);else s.selected.delete(item.id);card.classList.toggle('is-selected',check.checked);controls(scope);};card.prepend(label);}const actions=document.createElement('div');actions.className='item-actions';actions.onclick=e=>e.stopPropagation();actions.append(button('编辑',()=>edit(scope,[item])),button('删除',()=>askDelete(scope,[item])));card.append(actions);}
 function edit(scope,items){if(!items.length)return;editing={scope,items:data.copy(items)};const asset=scope==='assets';if(items.length===1){const a=items[0];$('item-edit-name').value=a.label||a.name;$('item-edit-url-label').hidden=!asset;$('item-edit-url').value=a.source_url||'';$('item-edit-assets').hidden=!asset;$('item-edit-category').value=a.asset_type==='finish'?'hard':a.category||'soft';$('item-edit-category').disabled=a.asset_type==='finish';$('item-edit-price').value=a.price_cny??'';$('item-edit-price-label').textContent=a.asset_type==='finish'?'价格 / 元每㎡':'价格 / 元';single.showModal();return;}
 $('batch-edit-title').textContent='批量编辑 '+items.length+' 项';$('batch-asset-fields').hidden=!asset;$('batch-naming').value='keep';$('batch-naming').querySelector('[value=single]').disabled=true;$('batch-name').value='';$('batch-category').value='keep';$('batch-price-mode').value='keep';$('batch-price').value='';$('batch-note').textContent=asset?'只修改选定字段，保存前可查看结果。':'批量修改画册或方案名称。';preview();dialog.showModal();}
 function patch(){return {naming:$('batch-naming').value,name:$('batch-name').value,category:$('batch-category').value,priceMode:$('batch-price-mode').value,price:$('batch-price').value.trim()===''?NaN:Number($('batch-price').value)};}
 function preview(){if(!editing)return;const p=patch();$('batch-name').parentElement.hidden=p.naming==='keep';$('batch-price').parentElement.hidden=!['set','percent'].includes(p.priceMode);$('batch-price-label').textContent=p.priceMode==='percent'?'调整幅度 / %':'统一价格 / 元';const box=$('batch-preview');box.replaceChildren();try{const next=updateItems(editing.items,editing.items.map(a=>a.id),'edit',p,editing.scope==='assets');for(const a of next){const row=document.createElement('li');row.textContent=(a.label||a.name)+(editing.scope==='assets'?' · '+(a.category==='hard'||a.asset_type==='finish'?'硬装':'软装')+' · '+(Number.isFinite(a.price_cny)?'¥ '+a.price_cny+(a.asset_type==='finish'?'/㎡':''):'未填价格'):'');box.append(row);}$('batch-error').textContent='';$('batch-apply').disabled=false;}catch(e){$('batch-error').textContent=e.message;$('batch-apply').disabled=true;}}
 for(const id of ['batch-naming','batch-name','batch-category','batch-price-mode','batch-price']){$(id).oninput=preview;$(id).onchange=preview;}
 $('batch-apply').onclick=attempt(()=>execute(editing.scope,'edit',editing.items.map(a=>a.id),patch()));$('batch-cancel').onclick=()=>dialog.close();$('batch-close').onclick=()=>dialog.close();
 $('item-edit-save').onclick=attempt(()=>execute(editing.scope,'edit',editing.items.map(a=>a.id),{source_url:editing.scope==='assets'?$('item-edit-url').value.trim():undefined,naming:'single',name:$('item-edit-name').value,category:$('item-edit-category').value,priceMode:$('item-edit-price').value.trim()===''?'clear':'set',price:Number($('item-edit-price').value)}));
 $('item-edit-cancel').onclick=()=>single.close();$('item-edit-close').onclick=()=>single.close();$('delete-confirm-cancel').onclick=()=>confirm.close();$('delete-confirm-apply').onclick=attempt(()=>execute(deleting.scope,'delete',deleting.ids));
 return {begin,decorate};
}
