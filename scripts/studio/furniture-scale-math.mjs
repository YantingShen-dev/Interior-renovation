export function scaledDimensions(dimensions,axes,reference,target){
 if(!Array.isArray(axes)||!axes.length||axes.some(i=>![0,1,2].includes(i)))throw Error('请选择缩放轴');
 if(!Number.isFinite(reference)||reference<=0||!Number.isFinite(target)||target<=0)throw Error('参照长度必须大于零');
 const ratio=target/reference,next=dimensions.map((v,i)=>v*(axes.includes(i)?ratio:1));
 if(next.some(v=>!Number.isFinite(v)||v<.001||v>100))throw Error('缩放后各边须在 0.1cm–100m 之间');
 return next;
}
export function initialDimensions(native,hints){
 if(native.some(v=>!Number.isFinite(v)||v<=0))throw Error('模型没有有效的三维尺寸');
 // Unknown scale: normalize the longest edge to one metre, preserving proportions.
 const first=hints.findIndex(v=>Number.isFinite(v)&&v>0),factor=first<0?1/Math.max(...native):hints[first]/native[first];
 return native.map((v,i)=>hints[i]??v*factor);
}
