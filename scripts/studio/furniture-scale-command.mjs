import {scaledDimensions} from './furniture-scale-math.mjs';
// A command works on a snapshot, so preview is never multiplied cumulatively.
export class FurnitureScaleCommand {
 constructor(){this.stage='idle';}
 begin(dimensions,origin,axes){this.before={dimensions:[...dimensions],origin:[...origin]};this.axes=[...axes];this.stage='base';this.result=null;this.base=null;this.reference=null;this.direction=null;}
 setBase(point){this.base=[...point];this.stage='reference';}
 setReference(point){
  const vector=point.map((v,i)=>this.axes.includes(i)?v-this.base[i]:0),length=Math.hypot(...vector);
  if(length<.0001)throw Error('参照点距离过小，请沿所选轴或平面选择另一点');
  this.reference=length;this.direction=vector.map(v=>v/length);this.stage='target';
 }
 previewRatio(ratio){
  const dimensions=scaledDimensions(this.before.dimensions,this.axes,1,ratio);
  const origin=this.before.origin.map((v,i)=>this.base[i]+(v-this.base[i])*(this.axes.includes(i)?ratio:1));
  return this.result={dimensions,origin,ratio,length:this.reference?this.reference*ratio:null};
 }
 previewLength(length){return this.previewRatio(length/this.reference);}
 previewPoint(point){return this.previewLength(point.reduce((sum,v,i)=>sum+(v-this.base[i])*this.direction[i],0));}
 confirm(){if(!this.result)throw Error('请先指定有效的缩放倍率或第二参照点');const result=this.result;this.stage='idle';return result;}
 cancel(){const result=this.before;this.stage='idle';this.result=null;return result;}
}
