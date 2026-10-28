/* Bundle dependencies into local HTML: no CDN, module fetch, or server needed to open it. */
const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'../..');
async function build(project){
 project=path.resolve(project);const folder=path.join(project,'furniture_layout'),source=path.join(folder,'room.scene.json');if(!fs.existsSync(source))throw new Error('Furniture scene JSON is missing.');
 const scene=JSON.parse(fs.readFileSync(source,'utf8'));
 const scanPath=path.join(project,'structure/cleaned_sample.json'),planePath=path.join(project,'structure/aligned_planes.json');
 let evidence={points:[],planes:[],registered:false};
 if(fs.existsSync(scanPath))evidence.points=JSON.parse(fs.readFileSync(scanPath,'utf8')).points.filter((_,i)=>i%2===0);
 if(fs.existsSync(planePath))evidence.planes=JSON.parse(fs.readFileSync(planePath,'utf8')).planes;
 evidence.source_video_sha256=scene.provenance.source_video_sha256;
 const result=await esbuild.build({entryPoints:[path.join(__dirname,'main.mjs')],bundle:true,format:'iife',platform:'browser',target:['chrome110','edge110'],minify:true,write:false,legalComments:'inline'});
 const js=result.outputFiles[0].text,css=fs.readFileSync(path.join(__dirname,'studio.css'),'utf8'),template=fs.readFileSync(path.join(__dirname,'studio.html.in'),'utf8');
 const html=template.replace('__STYLES__',()=>css).replace('__EVIDENCE__',()=>JSON.stringify(evidence).replace(/</g,'\\u003c')).replace('__SCENE__',()=>JSON.stringify(scene).replace(/</g,'\\u003c')).replace('__BUNDLE__',()=>js.replace(/<\/script/gi,'<\\/script'));
 for(const placeholder of ['__STYLES__','__SCENE__','__BUNDLE__'])if(html.includes(placeholder))throw new Error('Unresolved studio placeholder: '+placeholder);
 const outputs=[path.join(folder,'家具布置.html'),path.join(ROOT,'打开家具布置.html'),path.join(ROOT,'打开矢量房间.html'),path.join(ROOT,'打开单视频结果.html')];
 for(const target of outputs)fs.writeFileSync(target,html,'utf8');
 const three=require(path.join(ROOT,'node_modules/three/package.json')),license=fs.readFileSync(path.join(ROOT,'node_modules/three/LICENSE'),'utf8');
 const report={renderer:'Three.js WebGLRenderer',three_version:three.version,self_contained:true,external_runtime_dependencies:0,source_scene_sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),bundle_bytes:Buffer.byteLength(js),html_bytes:Buffer.byteLength(html),features:['perspective','orthographic','walk','raycast_selection','transform_controls','floor_drag','snapping','measure','json_glb_export']};
 fs.writeFileSync(path.join(folder,'studio_build.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(folder,'THREE-LICENSE.txt'),license);console.log(JSON.stringify(report));return report;
}
if(require.main===module)build(process.argv[2]||path.join(ROOT,'单视频流程/试验01')).catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={build};
