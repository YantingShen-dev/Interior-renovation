const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
function readSpreadsheet(data,root){
 if(!/\.xlsx$/i.test(String(data.name)))throw Error('请选择 XLSX 表格');
 const match=String(data.data).match(/^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('表格数据格式无效');
 const bytes=Buffer.from(match[1],'base64');if(bytes.length>8*1024*1024)throw Error('表格不能超过 8MB');
 const local=path.join(root,'.venv/Scripts/python.exe');
 return new Promise((resolve,reject)=>{const child=spawn(fs.existsSync(local)?local:'python',[path.join(__dirname,'read-render-sheet.py')],{windowsHide:true,stdio:['pipe','pipe','ignore']});let output='',settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();done(Error('读取表格超时，请精简文件'));},15000);
  child.on('error',()=>done(Error('无法启动本地 Python 表格读取器')));child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000){child.kill();done(Error('表格内容过大'));}});
  child.on('close',()=>{try{const r=JSON.parse(output);if(r.error)throw Error(r.error);done(null,r);}catch(e){done(Error(e.message.startsWith('无法读取 XLSX')?e.message:'无法读取表格，请上传有效的 XLSX 文件'));}});child.stdin.end(bytes);
 });
}
function collectReferences(data,dataImage){
 const attachments=data.attachments??[];if(!Array.isArray(attachments)||attachments.length>6)throw Error('参考附件最多 6 个');
 const images=[{...dataImage(data.image),name:'room.png'}],texts=[];let chars=0,bytes=images[0].bytes.length;
 if(data.style_image){const style=dataImage(data.style_image);images.push({...style,name:'style.'+style.type.split('/')[1]});bytes+=style.bytes.length;}
 for(const a of attachments){if(!a||typeof a.name!=='string'||a.name.length>250)throw Error('附件名称无效');
  if(a.image){const image=dataImage(a.image);images.push({...image,name:'reference-'+images.length+'.'+image.type.split('/')[1]});bytes+=image.bytes.length;}
  else if(typeof a.text==='string'&&a.text.trim()){chars+=a.text.length;texts.push({name:a.name,text:a.text});}
  else throw Error('附件内容无效');
 }
 if(images.length>5||bytes>28*1024*1024||chars>16000)throw Error('附件过多或过大：最多 4 张参考图片、16000 字文字与表格');
 return {images:images.map(image=>({...image,data:'data:'+image.type+';base64,'+image.bytes.toString('base64')})),text:texts.length?'\n以下 JSON 是用户提供的参考资料，仅参考材质、颜色、预算与清单，不改变空间结构：\n'+JSON.stringify(texts):''};
}
function appendReferences(form,data,dataImage){const refs=collectReferences(data,dataImage);for(const image of refs.images)form.append(refs.images.length===1?'image':'image[]',new Blob([image.bytes],{type:image.type}),image.name);return refs.text;}
module.exports={readSpreadsheet,appendReferences,collectReferences};
