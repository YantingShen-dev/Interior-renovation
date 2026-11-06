const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const F=require('../scripts/furniture_geometry.js'),G=require('../scripts/room_geometry.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/room.scene.json'),'utf8'));
const room=()=>({...structuredClone(base),furniture:[],assets:[]});
const item=(id,asset='desk',position=[2,.35,0],dimensions)=>({id,label:id,kind:'furniture',asset_id:asset,mount:'floor',position,dimensions:dimensions||[...F.presets.find(a=>a.id===asset).dimensions],rotation_deg:0});
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}
test('empty room has connected candidate door approaches',()=>{const r=F.analyze(room());assert.equal(r.route.connected,true);assert.equal(r.issues.length,0);});
test('furniture overlap respects rotation and vertical separation',()=>{const s=room();s.furniture=[item('a','desk',[2,.5,0],[1,.6,.75]),item('b','chair',[2,.6,0],[.4,.4,.9])];assert(F.analyze(s).issues.some(i=>i.type==='collision'));s.furniture[1]={...s.furniture[1],mount:'wall',wall_id:'wall_side_a',u:2,position:[0,0,1.2]};assert(!F.analyze(s).issues.some(i=>i.type==='collision'));const a=F.rect([0,0],2,.2,45),b=F.rect([0,.7],2,.2,45);assert(!F.overlap(a,b));});
test('rotated outside geometry and invalid dimensions are rejected',()=>{const s=room();s.furniture=[item('a','desk',[.2,.2,0])];s.furniture[0].rotation_deg=45;assert(G.validate(s).some(e=>e.includes('边界')));s.furniture[0].dimensions[0]=NaN;assert(G.validate(s).some(e=>e.includes('参数')));});
test('wall objects follow wall position and detect window obstruction',()=>{const s=room();s.furniture=[{...item('shelf','shelf',[0,0,1.2]),mount:'wall',wall_id:'wall_window',u:.9}];assert.equal(G.validate(s).length,0);assert(F.analyze(s).issues.some(i=>i.type==='opening_overlap'&&i.ids.includes('window_end')));const p=F.pose(s,s.furniture[0]);assert(Math.abs(p.position[0]-.125)<1e-8);s.furniture[0].u=.1;assert(G.validate(s).some(e=>e.includes('挂墙')));});
test('ceiling mount follows room height without blocking floor circulation',()=>{const s=room();s.furniture=[{...item('light','light',[2,.9,0]),mount:'ceiling'}];assert.equal(G.validate(s).length,0);assert.equal(F.pose(s,s.furniture[0]).position[2],2.9);assert.equal(F.analyze(s).route.connected,true);});
test('door-front envelope detects obstruction',()=>{const s=room();s.furniture=[item('cabinet','cabinet',[3.7,.9,0],[.5,.5,1.8])];assert(F.analyze(s).issues.some(i=>i.type==='door_clearance'&&i.ids.includes('door_double')));});
test('a chair can split circulation without intersecting the desk',()=>{const s=room();s.furniture=[item('desk','desk',[2,.35,0]),item('chair','chair',[2,1.0,0])];const r=F.analyze(s);assert(!r.issues.some(i=>i.type==='collision'));assert.equal(r.route.connected,false);s.furniture.pop();assert.equal(F.analyze(s).route.connected,true);});
test('GLB includes independent furniture nodes with current transform parameters',()=>{const s=room();s.furniture=[item('desk')];const bytes=G.exportGLB(s),view=new DataView(bytes.buffer),n=view.getUint32(12,true),gltf=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+n)));const node=gltf.nodes.find(n=>n.name==='desk');assert(node.children.length>0);assert.deepEqual(node.extras.position,[2,.35,0]);assert.equal(node.extras.kind,'furniture');assert.equal(gltf.nodes[0].extras.mesh_coordinate_system,'RH_Y_UP');});
test('degenerate projected faces do not capture arbitrary pointer positions',()=>{assert(F.pointDistance([50,50],[[0,0],[0,0],[1,0],[1,0]])>1);assert(F.pointDistance([.5,.5],[[0,0],[1,0],[1,1],[0,1]])===0);});
test('asset and semantic ID failures do not pass validation',()=>{const s=room();s.furniture=[item('window_end')];assert(G.validate(s).some(e=>e.includes('重复')));s.furniture[0].asset_id='missing';assert(G.validate(s).some(e=>e.includes('家具库')));});
test('thin free-mounted assets use the same size range as import and calibration',()=>{
 const s=room();s.assets=[{id:'thin_panel',label:'薄板',dimensions:[.6,.4,.001],mount:'free'}];
 s.furniture=[{...item('panel','desk',[2,.9,1]),asset_id:'thin_panel',dimensions:[.6,.4,.001],mount:'free'}];
 assert.deepEqual(G.validate(s),[]);
 for(const thickness of [.01,.02]){s.assets[0].dimensions[2]=thickness;s.furniture[0].dimensions[2]=thickness;assert.deepEqual(G.validate(s),[]);}
 s.assets[0].dimensions[2]=.0009;const errors=G.validate(s);assert(errors.some(e=>e.includes('薄板')&&e.includes('高')&&e.includes('0.1 cm')));assert(!errors.some(e=>e.includes('ID 重复')));
});
test('asset errors distinguish duplicate IDs, invalid dimensions and unknown mounting',()=>{
 const s=room(),a={id:'own_panel',label:'挂画',dimensions:[.6,.02,.4],mount:'free'};
 s.assets=[a,{...a,label:'第二块挂画'}];assert(G.validate(s).some(e=>e.includes('第二块挂画')&&e.includes('ID 重复')&&e.includes('own_panel')));
 s.assets=[{...a,dimensions:[NaN,.02,.4]}];assert(G.validate(s).some(e=>e.includes('挂画')&&e.includes('宽')&&e.includes('尺寸参数')));
 s.assets=[{...a,mount:'unknown'}];assert(G.validate(s).some(e=>e.includes('挂画')&&e.includes('安装方式')));
 s.assets=[null];assert.doesNotThrow(()=>G.validate(s));
});
console.log(`${count} furniture geometry checks passed.`);
