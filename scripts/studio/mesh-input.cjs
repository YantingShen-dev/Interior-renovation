const views=['front','left','back','right','top','bottom','left_front','right_front'];
function normalizeMeshInput(input,dataImage){
 const refs=typeof input==='string'?[{image:input,view:'front'}]:input?.references||input?.images?.map((image,i)=>({image,view:views[i]}))||(input?.image?[{image:input.image,view:'front'}]:null);
 if(!Array.isArray(refs)||!refs.length||refs.length>8)throw Error('同一物品请选择 1–8 张参考图');
 const seen=new Set();let bytes=0;const result=refs.map((r,i)=>{if(!r||typeof r.image!=='string')throw Error('参考图数据无效');const view=r.view||views[i];if(!views.includes(view)||seen.has(view))throw Error('每个视角只能使用一张图片，请调整视角或移除重复图片');seen.add(view);const image=dataImage(r.image);bytes+=image.bytes.length;return {...image,image:r.image,view};});
 if(!seen.has('front'))throw Error('请将其中一张图片标记为正面 / 主视图');if(bytes>28*1024*1024)throw Error('参考图合计不能超过 28MB，请压缩后重试');
 return result.sort((a,b)=>views.indexOf(a.view)-views.indexOf(b.view));
}
module.exports={views,normalizeMeshInput};
