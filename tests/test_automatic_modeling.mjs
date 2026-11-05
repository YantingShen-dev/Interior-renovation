import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import tools from '../scripts/studio/modeling-tools.cjs';
import vision from '../scripts/studio/vision-modeling.cjs';
import model from '../scripts/studio/state.cjs';
import {spaceTemplate,designFromSpace} from '../scripts/studio/projects.mjs';
import {buildRoomGraph,disposeGraph} from '../scripts/studio/scene.mjs';
import {upgradeMeshes} from '../scripts/studio/mesh-upgrade.mjs';
const {ModelingSession,scaleScene}=tools;
const outline=[[0,0],[6,0],[6,2],[3,2],[2.4,4],[0,4]];
const asset={id:'ai_table',label:'视频桌子',dimensions:[1.2,.6,.75],color:[.5,.3,.2,1],parts:[{center:[0,0,.95],size:[1,1,.1],color:[.5,.3,.2,1]},...[-1,1].flatMap(x=>[-1,1].map(y=>({center:[x*.44,y*.4,.45],size:[.08,.08,.9],color:[.2,.2,.2,1]})))],source_frame:'frame0',bbox:[.2,.3,.6,.8],reason:'跨帧桌子'};
const operations=[['create_room',{outline,height:3,reason:'不规则房间，带斜边'}],['add_opening',{id:'door1',wall_id:'draw_wall_0',kind:'door',u:.2,width:.9,bottom:0,height:2.1,reason:'可见门'}],['add_opening',{id:'window1',wall_id:'draw_wall_5',kind:'window',u:.5,width:1.2,bottom:.9,height:1.2,reason:'可见窗'}],['register_furniture',asset],['place_furniture',{id:'table1',asset_id:'ai_table',position:[1.5,1,.0],rotation_deg:30,reason:'原位'}],['finish_model',{summary:'不规则房间与桌子，测试数据并非实测',uncertainties:['背后墙段遮挡，暂估','所有尺寸暂估']}]];
const session=new ModelingSession();for(const [name,args]of operations)session.call(name,args);
assert.equal(session.scene.room.outline.length,6);assert.equal(session.scene.furniture.length,1);assert.equal(model.F.buildParts(session.scene).flatMap(p=>p.boxes).length,5);
const graph=buildRoomGraph(session.scene);assert.equal(graph.furniture.size,1);disposeGraph(graph.root);
const saved=JSON.stringify(session.scene);assert.throws(()=>session.call('add_opening',{...operations[1][1],u:5.9}),/超出/);assert.equal(JSON.stringify(session.scene),saved,'invalid call is atomic');
assert.throws(()=>session.call('register_furniture',{...asset,parts:[{center:[2,0,0],size:[1,1,1],color:[0,0,0,1]}]}),/包围盒/);
const scaled=scaleScene(session.scene,'draw_wall_0',9);assert.equal(scaled.room.height,4.5);assert.equal(scaled.openings[0].width,1.35);assert.equal(scaled.openings[1].bottom,1.35);assert.deepEqual(scaled.furniture[0].position,[2.25,1.5,0]);assert.equal(scaled.furniture[0].rotation_deg,30);assert.equal(scaled.furniture[0].dimensions[2],1.125);assert.deepEqual(scaled.assets[0].dimensions,asset.dimensions);assert.equal(JSON.stringify(session.scene),saved);assert.deepEqual(model.G.validate(scaled),[]);
const space={id:'test-space',name:'自动建模测试',kind:'space',scene:spaceTemplate(scaled)};const design=designFromSpace(space,scaled.assets);assert.equal(design.furniture.length,1);assert.deepEqual(design.furniture[0].position,scaled.furniture[0].position);assert.deepEqual(model.G.validate(design),[]);
assert.equal(session.rpc({jsonrpc:'2.0',id:1,method:'tools/list'}).result.tools.length,10);assert.equal(session.rpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'evil',arguments:{}}}).result.isError,true);assert.equal(session.rpc({jsonrpc:'2.0',method:'notifications/initialized'}),null);
// This mock reads the generated PNG to verify that a real image is sent; no provider is contacted.
function decodeChallenge(url){const png=Buffer.from(url.split(',')[1],'base64');let offset=8,compressed=[];while(offset<png.length){const n=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')compressed.push(png.subarray(offset+8,offset+8+n));offset+=12+n;}const raw=zlib.inflateSync(Buffer.concat(compressed)),palette={'230,30,30':'red','0,170,40':'green','20,60,240':'blue','250,220,0':'yellow','160,20,210':'purple','255,120,0':'orange'};return Array.from({length:8},(_,i)=>palette[[...raw.subarray(40*(640*3+1)+1+(i*80+40)*3,40*(640*3+1)+1+(i*80+40)*3+3)].join(',')]);}
const frames=[0,1].map(i=>({image:'frame'+i,seconds:i,url:vision.challenge().image})),e={CHAT_API_BASE:'https://mock.invalid/v1',CHAT_API_KEY:'test',CHAT_MODEL:'test-vision'};let rounds=0,sawCorrection=false;
const plan={summary:'测试凹形房间，有一张桌子',observations:[{frame_id:'frame0',visible:'门与桌子'},{frame_id:'frame1',visible:'窗与转角'}],steps:operations.map(([tool])=>({tool,goal:tool})),uncertainties:['尺寸估计']};
const request=async(url,key,options)=>{const data=JSON.parse(options.body);rounds++;let calls;
 if(rounds===1){assert.equal(data.tools[0].function.name,'report_visual_check');calls=[['report_visual_check',{colors:decodeChallenge(data.messages[0].content[1].image_url.url)}]];}
 else if(rounds===2){assert.equal(data.tools[0].function.name,'report_scene_plan');assert(data.messages[0].content.includes('add_opening'));assert.equal(data.messages[1].content.filter(v=>v.type==='image_url').length,2);calls=[['report_scene_plan',plan]];}
 else if(rounds===3){assert.equal(data.messages[1].content.filter(v=>v.type==='image_url').length,2);calls=[operations[0],['add_opening',{...operations[1][1],u:100}]];}
 else {sawCorrection=data.messages.some(m=>m.role==='tool'&&JSON.parse(m.content).isError);calls=operations.slice(1);}
 return {choices:[{message:{role:'assistant',tool_calls:calls.map(([name,args],i)=>({id:'call_'+rounds+'_'+i,type:'function',function:{name,arguments:JSON.stringify(args)}}))}}]};};
const progress=[],diagnostics=[];const result=await vision.run({frames,source:{name:'fixture'},mode:'primitive'},e,request,m=>progress.push(m),undefined,event=>diagnostics.push(event));assert.equal(result.scene.ai_modeling.plan.summary,plan.summary);assert(diagnostics.some(d=>d.phase==='planning'&&d.ok));assert(diagnostics.some(d=>d.ok===false&&d.error.includes('超出')));assert(diagnostics.some(d=>d.checkpoint?.walls.length===6));assert(progress.some(s=>s.includes('失败：')));assert(sawCorrection);assert.equal(result.scene.furniture.length,1);assert(result.scene.assets[0].id.startsWith('ai_table_'));assert.equal(result.scene.furniture[0].asset_id,result.scene.assets[0].id);assert.equal(result.scene.ai_modeling.scale_status,'estimated');
await assert.rejects(()=>vision.run({frames},e,async()=>({choices:[{message:{tool_calls:[{function:{name:'report_visual_check',arguments:'{"colors":[]}'}}]}}]})),/视觉能力/);
await assert.rejects(()=>vision.run({frames},e,async()=>({choices:[{message:{content:'I cannot see'}}]})),/工具调用/);
let submissions=0,queries=0;const meshScene=structuredClone(result.scene);meshScene.assets[0].reference_image='data:image/png;base64,AA==';const meshAPI=async(url,data)=>{if(data){submissions++;return {id:'paid-task'};}queries++;return queries===1?{status:'failed'}:{status:'success',model_glb:'data:model/gltf-binary;base64,TEST'};};await upgradeMeshes(meshScene,{request:meshAPI});assert.equal(meshScene.assets[0].mesh_status,'incomplete');await upgradeMeshes(meshScene,{request:meshAPI});assert.equal(submissions,1,'retry must reuse paid task');assert.equal(meshScene.assets[0].mesh_status,'ready');assert.deepEqual(meshScene.furniture,result.scene.furniture,'mesh upgrade preserves position and size');
fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/automatic-modeling-fixture.json',JSON.stringify({...result.scene,ai_modeling:{...result.scene.ai_modeling,summary:'自动建模链路测试夹具（模拟模型响应，非真实视频识别）'}},null,2));
console.log('Automatic modeling: irregular room, atomic tool errors, compound furniture, scale, warehouse/design retention, MCP, vision rejection, correction loop and paid-task reuse passed (mocked providers).');

const reply=calls=>({choices:[{message:{role:'assistant',tool_calls:calls.map(([name,args],i)=>({id:'mock'+i,type:'function',function:{name,arguments:JSON.stringify(args)}}))}}]});
let stallCount=0,stallEvents=[];
await assert.rejects(()=>vision.run({frames},e,async(_,__,options)=>{const data=JSON.parse(options.body),tool=data.tools[0].function.name;if(tool==='report_visual_check')return reply([[tool,{colors:decodeChallenge(data.messages[0].content[1].image_url.url)}]]);if(tool==='report_scene_plan')return reply([[tool,plan]]);stallCount++;return reply([['add_opening',operations[1][1]]]);},()=>{},undefined,event=>stallEvents.push(event)),/连续未取得进展.*先调用/);
assert.equal(stallCount,4);assert.equal(stallEvents.filter(e=>e.ok===false).length,4);
let plans=0;
await vision.run({frames},e,async(_,__,options)=>{const data=JSON.parse(options.body),tool=data.tools[0].function.name;if(tool==='report_visual_check')return reply([[tool,{colors:decodeChallenge(data.messages[0].content[1].image_url.url)}]]);if(tool==='report_scene_plan'){plans++;return reply([[tool,plans===1?{...plan,observations:[{frame_id:'unknown',visible:'invented'}]}:plan]]);}return reply(operations);});assert.equal(plans,2);
let buildRounds=0;
await vision.run({frames},e,async(_,__,options)=>{const data=JSON.parse(options.body),tool=data.tools[0].function.name;if(tool==='report_visual_check')return reply([[tool,{colors:decodeChallenge(data.messages[0].content[1].image_url.url)}]]);if(tool==='report_scene_plan')return reply([[tool,plan]]);buildRounds++;if(data.tools.length===2){assert.deepEqual(data.tools.map(t=>t.function.name),['read_scene','finish_model']);return reply([['finish_model',{summary:'仅房间草稿，门窗家具尚未完成',uncertainties:['门窗与家具未完成']}]]);}return reply([['create_room',{outline:[[0,0],[4+buildRounds/10,0],[4+buildRounds/10,3],[0,3]],height:3,reason:'校正轮廓'}]]);});assert.equal(buildRounds,23);
console.log('PASS read-before-build plan, cited-frame validation and repair, detailed errors, stall cutoff, checkpoint capture and reserved finishing rounds');

const explanations=new ModelingSession();explanations.call('create_room',{...operations[0][1],reason:'坐标说明'.repeat(100)});explanations.call('finish_model',{summary:'识别总结'.repeat(100),uncertainties:['遮挡说明'.repeat(100)]});assert(explanations.finished);assert.throws(()=>explanations.call('add_opening',{...operations[1][1],id:'x'.repeat(161)}),/超过上限 160/);

// Regression: vertical-on-screen Y walls still have a horizontal along-wall length.
const corridor=new ModelingSession();
const walls=[{id:'left',start:[0,0],end:[0,4.5],thickness:.2},{id:'window_wall',start:[6,1.5],end:[6,3],thickness:.2},{id:'right_low',start:[6,0],end:[6,1.5],thickness:.2},{id:'right_high',start:[6,3],end:[6,4.5],thickness:.2},{id:'back',start:[0,4.5],end:[6,4.5],thickness:.2}];
const wallReport=corridor.call('set_walls',{walls,height:3,reason:'open corridor fixture'});
assert.equal(wallReport.enclosed,false);assert(wallReport.warnings.length);
assert.deepEqual(wallReport.unconnected_endpoints.map(e=>e.point),[[0,0],[6,0]]);
assert.equal(wallReport.walls.find(w=>w.id==='window_wall').length,1.5);
const badWindow={id:'win',wall_id:'window_wall',kind:'window',u:.2,width:1.5,bottom:.8,height:1.2,reason:'fixture'};
assert.throws(()=>corridor.call('add_opening',badWindow),/u \+ width = 0.2 \+ 1.5 = 1.7m/);
assert.equal(corridor.scene.openings.length,0);
corridor.call('add_opening',{...badWindow,width:1.2});
assert.throws(()=>corridor.call('add_opening',{...badWindow,id:'duplicate',width:1.2}),/与 win 重叠/);
assert.throws(()=>corridor.call('finish_model',{summary:'done',uncertainties:[]}),/闭合/);
assert.throws(()=>corridor.call('create_room',{outline:[[0,0],[0,4.5],[6,4.5],[6,0],[2,0],[2,1],[0,1]],height:3,reason:'overlapping return edge'}),/边 0 .* 与边/);
let repairs=0,buildCalls=0;
const repaired=await vision.run({frames},e,async(_,__,options)=>{
 const data=JSON.parse(options.body),tool=data.tools[0].function.name;
 if(tool==='report_visual_check')return reply([[tool,{colors:decodeChallenge(data.messages[0].content[1].image_url.url)}]]);
 if(tool==='report_scene_plan')return reply([[tool,plan]]);
 buildCalls++;
 if(buildCalls===1)return reply([['set_walls',{walls,height:3,reason:'fixture'}]]);
 if(buildCalls<=5)return reply([['add_opening',badWindow]]);
 repairs++;assert(data.messages.some(m=>typeof m.content==='string'&&m.content.includes('unconnected_endpoints')));
 return reply([['set_walls',{walls:[...walls,{id:'front',start:[0,0],end:[6,0],thickness:.2}],height:3,reason:'close missing boundary'}],['add_opening',{...badWindow,width:1.2}],['finish_model',{summary:'fixture repaired',uncertainties:['estimated']}]]);
});
assert.equal(repairs,1);assert.equal(repaired.scene.openings.length,1);assert.equal(repaired.scene.ai_modeling.completion,'finished');
console.log('PASS corridor wall-length diagnostics, overlap IDs, missing boundary feedback and targeted AI repair');

await assert.rejects(()=>vision.run({frames},{...e,CHAT_MODEL:'gpt-6.1-sol'},async(_,__,options)=>{const data=JSON.parse(options.body);assert.equal(data.max_completion_tokens,16384);assert(!('max_tokens' in data));throw Error('verified GPT completion budget');}),/verified GPT completion budget/);
console.log('PASS GPT 6 modeling uses supported completion budget parameter');
