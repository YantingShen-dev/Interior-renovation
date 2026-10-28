/* Offline DOM/canvas flow checks; no browser rendering claims. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'扫描重建与证据.html'),'utf8');
assert(!html.includes('__RESULT_DATA__'));
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(withPlane=false){
 let calls=0,blob;
 const ctx=new Proxy({}, {get(t,k){if(k in t)return t[k];return (...args)=>{if(['fillRect','moveTo','lineTo'].includes(k))assert(args.every(Number.isFinite));calls++;}}});
 class Element{constructor(){this.children=[];this.value='';this.checked=false;this.hidden=false;this.textContent='';}append(e){this.children.push(e)}getContext(){return ctx}getBoundingClientRect(){return {width:1100,height:600}}setPointerCapture(){}click(){}set innerHTML(v){this.children=[];this._html=v}get innerHTML(){return this._html}}
 const els=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));els.points.checked=els.patches.checked=els.error.hidden=true;
 const context={document:{getElementById:id=>{assert(els[id],id);return els[id]},createElement:()=>new Element()},window:{},devicePixelRatio:1,Blob,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},setTimeout:fn=>fn()};
 vm.createContext(context);
 let script=code;
 if(withPlane)script=script.replace('try {',`result.structure={metric_scale_applied:false,planes:[{id:'fixture',sample_support:100,origin:[0,0,0],normal:[0,0,1],basis_uv:[[1,0,0],[0,1,0]],semantic_type:'unclassified',contours:[{kind:'outer',uv:[[0,0],[1,0],[1,1],[0,1]]},{kind:'unknown_gap',uv:[[.2,.2],[.4,.2],[.4,.4],[.2,.4]]}]}]};try {`);
 vm.runInContext(script,context);assert.equal(els.error.hidden,true,els.error.textContent);
 return {els,context,calls:()=>calls,blob:()=>blob};
}
(async()=>{
const empty=boot();assert(empty.calls()>0);assert(empty.els.gallery.innerHTML.includes('f0012'));console.log('PASS generated data initializes and video references render');
const fixture=boot(true);assert.equal(fixture.els['plane-list'].children.length,1);fixture.els.name.value='测试墙';fixture.els.type.value='wall';fixture.els.offset.value='0.25';fixture.els.visible.checked=false;fixture.els.apply.onclick();fixture.els.export.onclick();const model=JSON.parse(await fixture.blob().text());assert.equal(model.planes[0].edit_offset,.25);assert.equal(model.planes[0].edit_name,'测试墙');assert.equal(model.planes[0].edit_visible,false);assert.equal(model.planes[0].contours[1].kind,'unknown_gap');assert.equal(model.metric_scale_applied,false);console.log('PASS independent plane edits and unknown gaps persist in exported JSON');
fixture.els.xy.onclick();fixture.els.xz.onclick();fixture.els.yz.onclick();assert(fixture.calls()>10);console.log('PASS projection changes keep finite canvas coordinates');
const links=vm.runInContext('[...result.links.map(l=>l.url),...result.references.map(f=>f.url),...Object.values(result.plane_previews||{}),result.video_url]',empty.context);
for(const link of links)assert(fs.existsSync(path.resolve(root,link)),link);console.log('PASS static file references resolve');
})().catch(e=>{console.error(e);process.exitCode=1});
