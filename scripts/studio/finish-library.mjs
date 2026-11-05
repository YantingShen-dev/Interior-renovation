import materials from './materials.cjs';
export const finishPresets=[
 ['paint_white','纯白 · 哑光墙漆','matte','plain',[1,1,1,1]],
 ['ceramic','浅灰 · 瓷砖','paint','tile',[.72,.75,.77,1]],
 ['oak','浅橡木 · 木纹','matte','wood',[.72,.55,.35,1]],
 ['steel','拉丝 · 不锈钢','metal','plain',[.62,.66,.7,1]],
 ['glass','透明 · 玻璃','glass','plain',[.82,.93,.97,1]],
 ['mirror','反光 · 镜面','reflective','plain',[.9,.93,.96,1]]
].map(([id,label,material_type,pattern,color])=>({id:'material_'+id,label,material_type,pattern,color,texture_scale:1,asset_type:'finish',category:'hard',target:'walls',dimensions:[1,1,.03],mount:'wall',style:'box',brand:'基础硬装材质',price_unit:'m²'}));
export function finishMaterial(asset){return {...materials.presets[asset.material_type||'matte'],type:asset.material_type||'matte',asset_id:asset.id,color:asset.color,pattern:asset.pattern||'plain',texture:asset.reference_image||null,texture_scale:asset.texture_scale||1};}
export function materialBall(asset){
 const ball=document.createElement('span');ball.className='finish-swatch material-ball '+(asset.pattern||'plain');ball.dataset.material=asset.material_type||asset.type||'matte';
 ball.style.backgroundColor='rgb('+(asset.color||[1,1,1]).slice(0,3).map(v=>Math.round(v*255)).join(',')+')';
 if(asset.reference_image||asset.texture)ball.style.backgroundImage=`url("${(asset.reference_image||asset.texture).replaceAll('"','%22')}")`;
 return ball;
}
