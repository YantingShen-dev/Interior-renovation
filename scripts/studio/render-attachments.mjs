// Local reference preparation; the image service receives images and extracted text.
export function setupRenderAttachments({api,readData,toast}){
 const input=document.getElementById('render-attachments-input'),list=document.getElementById('render-attachments');
 let attachments=[],epoch=0,loading=false;
 function paint(){list.replaceChildren();for(const item of attachments){const chip=document.createElement('div');chip.className='render-attachment';
  if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';chip.append(img);}
  const name=document.createElement('span');name.textContent=item.name;name.title=item.name;chip.append(name);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','移除 '+item.name);remove.onclick=()=>{attachments=attachments.filter(a=>a!==item);paint();};chip.append(remove);list.append(chip);
 }list.hidden=!attachments.length;}
 document.getElementById('render-attach').onclick=()=>input.click();
 input.onchange=async()=>{const token=epoch,files=Array.from(input.files);input.value='';loading=true;document.getElementById('render-attach').disabled=true;
  try{for(const file of files){if(token!==epoch)break;if(attachments.length>=6)throw Error('最多添加 6 个参考附件');if(file.size>8*1024*1024)throw Error(file.name+' 超过 8MB');
   let item={name:file.name};if(['image/jpeg','image/png','image/webp'].includes(file.type)){if(attachments.filter(a=>a.image).length>=4)throw Error('最多添加 4 张参考图片');item.image=await readData(file);}
   else if(/\.xlsx$/i.test(file.name)){const parsed=await api('/api/render/attachment',{name:file.name,data:await readData(file)});item.text=parsed.text;}
   else if(/\.(csv|tsv|txt|md)$/i.test(file.name)){item.text=(await file.text()).replace(/^\uFEFF/,'');if(item.text.includes('\u0000'))throw Error('请将文本保存为 UTF-8 后上传');}
   else throw Error('支持 JPG、PNG、WebP、XLSX、CSV、TSV、TXT 和 MD');
   if(token!==epoch)break;if(item.text!==undefined){if(!item.text.trim())throw Error(file.name+' 没有可读取的内容');if(item.text.length+attachments.reduce((n,a)=>n+(a.text?.length||0),0)>16000)throw Error('文字与表格内容合计最多 16000 字，请精简参考文件');}
   attachments.push(item);paint();}
  }catch(e){if(token===epoch)toast(e.message,true);}finally{loading=false;document.getElementById('render-attach').disabled=false;}
 };
 return {get(){if(loading)throw Error('参考附件仍在读取，请稍候');return attachments.map(a=>({...a}));},clear(){epoch++;attachments=[];paint();}};
}
