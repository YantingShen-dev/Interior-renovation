import assert from 'node:assert/strict';
import {updateItems,mergeAssets} from '../scripts/studio/management.mjs';
import {designFromSpace,assetSnapshot,designAlbums,migrateOrigins,enableFreePlacement,cascadeProjectIds} from '../scripts/studio/projects.mjs';
import design from '../scripts/studio/design.cjs';
import state from '../scripts/studio/state.cjs';
import plan from '../scripts/plan_geometry.js';
const asset={id:'custom_desk',label:'书桌',dimensions:[1,.5,.7],mount:'floor',style:'desk',color:[.5,.5,.5,1],price_cny:100,category:'soft'};
const assets=[asset,{...structuredClone(asset),id:'chair',label:'椅子',price_cny:50}];
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('batch edits validate first, preserve IDs and dimensions, and leave source records untouched',()=>{
 const result=updateItems(assets,['custom_desk','chair'],'edit',{naming:'numbered',name:'接待区',category:'hard',priceMode:'percent',price:-10},true);
 assert.deepEqual(result.map(a=>a.label),['接待区 01','接待区 02']);assert.deepEqual(result.map(a=>a.price_cny),[90,45]);assert(result.every(a=>a.category==='hard'));assert.equal(assets[0].label,'书桌');assert.deepEqual(result[0].dimensions,asset.dimensions);assert.equal(result[0].id,asset.id);
 assert.throws(()=>updateItems(assets,assets.map(a=>a.id),'edit',{priceMode:'set',price:-1},true),/有效价格/);assert.equal(assets[1].price_cny,50);
});
test('percentage edits keep missing prices; zero and clearing a price are distinct',()=>{
 const item={...asset};delete item.price_cny;
 assert.equal(updateItems([item],[item.id],'edit',{priceMode:'percent',price:20},true)[0].price_cny,undefined);
 assert.equal(updateItems([asset],[asset.id],'edit',{priceMode:'set',price:0},true)[0].price_cny,0);
 assert.equal(updateItems([asset],[asset.id],'edit',{priceMode:'clear'},true)[0].price_cny,undefined);
 assert.throws(()=>updateItems([asset],[asset.id],'edit',{priceMode:'percent',price:-101},true));
});
test('mixed price units and invalid finish categories are rejected atomically',()=>{
 const mixed=[asset,{...asset,id:'finish',asset_type:'finish',category:'hard'}];
 assert.throws(()=>updateItems(mixed,mixed.map(a=>a.id),'edit',{priceMode:'set',price:20},true),/分开/);
 assert.throws(()=>updateItems(mixed,mixed.map(a=>a.id),'edit',{category:'soft'},true),/只能/);
 assert.equal(mixed[0].price_cny,100);
});
test('permanent deletion removes library records and old snapshots cannot resurrect them',()=>{
 const next=updateItems(assets,[asset.id],'delete');assert(!next.some(a=>a.id===asset.id));assert(!mergeAssets(next,assets,[asset.id]).some(a=>a.id===asset.id));assert.equal(assets.length,2);
});
test('asset metadata changes are not overwritten by a stale project snapshot',()=>{
 const changed=updateItems(assets,[asset.id],'edit',{naming:'single',name:'更新书桌',priceMode:'set',price:200},true);
 const merged=mergeAssets(changed,assets);assert.equal(merged[0].label,'更新书桌');assert.equal(merged[0].price_cny,200);
 const extra={...asset,id:'new'};assert.equal(mergeAssets(changed,[...assets,extra]).length,3);
});
test('deleting a root space cascades to its children only',()=>{
 const scene=plan.createScene([[0,0],[5,0],[5,4],[0,4]],2.8),space={id:'space',kind:'space',name:'空间',scene},copy=designFromSpace(space,assets),designItem={id:'design',kind:'design',name:'方案',scene:copy};
 const unrelated={...designItem,id:'other',scene:{...copy,source_space:{id:'other-space'}}},items=[space,designItem,unrelated];const next=updateItems(items,cascadeProjectIds(items,['space']),'delete');assert.deepEqual(next.map(p=>p.id),['other']);assert.equal(items.length,3);assert.deepEqual(cascadeProjectIds(items,['design']),['design']);
});
test('stale selections and restore requests are rejected without editing records',()=>{assert.throws(()=>updateItems(assets,['missing'],'delete'));assert.throws(()=>updateItems(assets,[asset.id],'restore'));});
test('used deleted assets remain renderable snapshots, unavailable to new additions',()=>{
 const scene=plan.createScene([[0,0],[5,0],[5,4],[0,4]],2.8);scene.assets=[structuredClone(asset)];const store=new state.StudioState(scene);store.add(asset.id);const proposed=design.proposal(store.scene,{message:'增加桌子',operations:[{type:'add',asset_id:asset.id}]});
 store.scene.assets=assetSnapshot(store.scene,[],[asset.id]);assert.equal(store.scene.assets[0].unavailable,true);assert.equal(state.G.validate(store.scene).length,0);assert(!design.context(store.scene).assets.some(a=>a.id===asset.id));assert.throws(()=>store.add(asset.id));assert.throws(()=>design.applyProposal(store,proposed));
});
test('album grouping supports two spaces with independent designs and conservative legacy migration',()=>{
 const scene=plan.createScene([[0,0],[5,0],[5,4],[0,4]],2.8),A={id:'a',kind:'space',name:'A',scene},B={...A,id:'b',name:'B'},items=[A,B];for(const [space,n]of [[A,2],[B,4]])for(let i=0;i<n;i++)items.push({id:space.id+i,kind:'design',name:'方案'+i,scene:designFromSpace(space,[])});assert.deepEqual(designAlbums(items).map(a=>a.designs.length),[2,4]);const legacy={id:'old',name:'A · 设计',kind:'design',scene};assert.equal(migrateOrigins([...items,legacy]).at(-1).scene.source_space.id,'a');assert.equal(legacy.scene.source_space,undefined);
});
test('free placement migration preserves wall and ceiling world poses',()=>{
 const store=new state.StudioState(plan.createScene([[0,0],[5,0],[5,4],[0,4]],3));store.add('shelf');store.add('light');const poses=store.scene.furniture.map(f=>state.F.pose(store.scene,f));enableFreePlacement(store.scene);assert.deepEqual(store.scene.furniture.map(f=>state.F.pose(store.scene,f)),poses);for(const f of store.scene.furniture){const p=[...f.position];p[2]=1;store.update(f.id,{position:p});assert.equal(state.F.pose(store.scene,store.scene.furniture.find(a=>a.id===f.id)).position[2],1);}assert.throws(()=>store.update(store.selected,{position:[2,2,3]}),/边界/);
});
console.log(`${count} management and album checks passed.`);
