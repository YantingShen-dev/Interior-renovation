// Local CPU/heap replay; never submits API jobs or prints media/credentials.
// Run: node --expose-gc scripts/studio/performance-audit.cjs
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const plan=require('../plan_geometry.js'),state=require('./state.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.cache/mesh-jobs'),assets=[];
for(const name of fs.existsSync(folder)?fs.readdirSync(folder):[]){if(!name.endsWith('.json'))continue;const job=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));if(job.complete?.model_glb)assets.push({id:'audit_'+assets.length,label:'audit',model_glb:job.complete.model_glb,dimensions:[.7,.7,1],mount:'floor',style:'box',color:[.5,.5,.5,1]});}
if(!assets.length){console.error('No completed local models; run after importing furniture.');process.exitCode=1;return;}
const scene=plan.createScene([[0,0],[4,0],[4,8],[0,8]],3,[],assets);scene.furniture=[{id:'audit-item',kind:'furniture',asset_id:assets[0].id,label:'audit',position:[2,2,0],dimensions:[.7,.7,1],rotation_deg:0,mount:'floor'}];
const result={scope:'Node CPU/heap replay, not browser FPS',modelPayloadMiB:Math.round(assets.reduce((n,a)=>n+a.model_glb.length,0)/1048576*100)/100};
function measure(name,fn){const t=performance.now(),r=fn();result[name]=Math.round((performance.now()-t)*100)/100;return r;}
const store=measure('stateInitMs',()=>new state.StudioState(scene));measure('moveCommitMs',()=>store.update('audit-item',{position:[2.1,2,0]}));global.gc?.();result.heapBeforeMiB=Math.round(process.memoryUsage().heapUsed/1048576*10)/10;
measure('60MovesMs',()=>{for(let i=0;i<60;i++)store.update('audit-item',{position:[2+i*.001,2,0]});});global.gc?.();result.heapAfterMiB=Math.round(process.memoryUsage().heapUsed/1048576*10)/10;result.historyCount=store.history.length;
measure('previewMoveMs',()=>state.fromTransform(scene,'audit-item',{position:[2.1,2,0]},'translate',{snap:false}));measure('analyzeMs',()=>store.analyze());console.log(JSON.stringify(result,null,2));
