export function readAssetFields(prefix, defaultName='') {
 const field=name=>document.getElementById(`${prefix}-${name}`);
 const label=field('name').value.trim()||defaultName;
 const price=field('price').value.trim();
 const source=field('url').value.trim();
 if(!label)throw Error('资产名称不能为空');
 const price_cny=price===''?undefined:Number(price);
 if(price_cny!==undefined&&(!Number.isFinite(price_cny)||price_cny<0))throw Error('请输入非负价格');
 if(source){
  let url;
  try{url=new URL(source);}catch{throw Error('请输入完整的 HTTPS 商品链接');}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('请输入完整的 HTTPS 商品链接');
 }
 return {label,price_cny,source_url:source||undefined};
}
