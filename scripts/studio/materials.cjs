const presets={
 matte:{roughness:.85,metalness:0,opacity:1,transmission:0},
 paint:{roughness:.4,metalness:0,opacity:1,transmission:0},
 metal:{roughness:.25,metalness:.9,opacity:1,transmission:0},
 glass:{roughness:.08,metalness:0,opacity:.3,transmission:.65,ior:1.5},
 reflective:{roughness:.04,metalness:1,opacity:1,transmission:0}
};
function entity(scene,id){return [...scene.walls,...scene.openings,...(scene.furniture||[])].find(o=>o.id===id);}
function validate(material){
 if(!material||!presets[material.type])throw Error('请选择有效的材质类型');
 if(!Array.isArray(material.color)||material.color.length!==4||material.color.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('材质颜色无效');
 for(const key of ['roughness','metalness','opacity','transmission'])if(!Number.isFinite(material[key])||material[key]<0||material[key]>1)throw Error('材质参数须在 0–1 之间');
 if(material.texture_scale!==undefined&&(!Number.isFinite(material.texture_scale)||material.texture_scale<.05||material.texture_scale>20))throw Error('纹理大小须为 5–2000%');
 return material;
}
function apply(scene,id,material){
 const next=structuredClone(scene);if(material)validate(material);
 const item=entity(next,id);
 if(item){if(material)item.surface_material=structuredClone(material);else delete item.surface_material;}
 else if(['floor','ceiling'].includes(id)){next.finishes||={};if(material)next.finishes[id]=structuredClone(material);else delete next.finishes[id];}
 else throw Error('请先选中墙、地面、门窗或物件');
 return next;
}
function forPart(scene,part){if(part.role==='skirt')return null;const item=entity(scene,part.parent);return item?.surface_material||(['floor','ceiling'].includes(part.parent)?scene.finishes?.[part.parent]:part.role==='wall'?scene.finishes?.walls:null);}
module.exports={presets,entity,validate,apply,forPart};
