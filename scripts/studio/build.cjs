/* Bundle dependencies into local HTML: no CDN, module fetch, or server needed to open it. */
const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'../..');
async function build(){
 const source=path.join(ROOT,'examples/room.scene.json');
 const scene=JSON.parse(fs.readFileSync(source,'utf8'));
 const result=await esbuild.build({entryPoints:[path.join(__dirname,'main.mjs')],bundle:true,format:'iife',platform:'browser',target:['chrome110','edge110'],minify:true,write:false,legalComments:'inline'});
 const js=result.outputFiles[0].text,css=fs.readFileSync(path.join(__dirname,'studio.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'hub.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'video-room.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'theme.css'),'utf8').replace(/__FONT_(SMILEY|SPACE)__/g,(_,name)=>'data:font/woff2;base64,'+fs.readFileSync(path.join(__dirname,'assets/fonts',name==='SMILEY'?'SmileySans-Oblique.woff2':'SpaceGrotesk-Variable.woff2')).toString('base64'))+'\n/* Bundled font licenses:\n'+['SmileySans-LICENSE.txt','SpaceGrotesk-LICENSE.txt'].map(name=>fs.readFileSync(path.join(__dirname,'assets/fonts',name),'utf8')).join('\n')+'\n*/',template=fs.readFileSync(path.join(__dirname,'studio.html.in'),'utf8');
 const html=template.replace('__SHELL__',()=>fs.readFileSync(path.join(__dirname,'hub.html'),'utf8')).replace('__SPACE_EMPTY_ROOM__',()=> 'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'assets/space-empty-room-transparent.png')).toString('base64')).replace('__DESIGN_INTERIOR__',()=> 'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'assets/free-design-interior.png')).toString('base64')).replace('__POLYLAB_LOGO__',()=> 'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'assets/polylab.png')).toString('base64')).replace('__STYLES__',()=>css).replace('__SCENE__',()=>JSON.stringify(scene).replace(/</g,'\\u003c')).replace('__BUNDLE__',()=>js.replace(/<\/script/gi,'<\\/script'));
 for(const placeholder of ['__FONT_SMILEY__','__FONT_SPACE__','__STYLES__','__SCENE__','__BUNDLE__','__SHELL__','__DESIGN_INTERIOR__','__SPACE_EMPTY_ROOM__'])if(html.includes(placeholder))throw new Error('Unresolved studio placeholder: '+placeholder);
 const folder=path.join(ROOT,'.cache');
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(ROOT,'打开家具布置.html'),html,'utf8');
 const three=require(path.join(ROOT,'node_modules/three/package.json')),license=fs.readFileSync(path.join(ROOT,'node_modules/three/LICENSE'),'utf8');
 const report={renderer:'Three.js WebGLRenderer',three_version:three.version,self_contained:true,external_runtime_dependencies:0,source_scene_sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),bundle_bytes:Buffer.byteLength(js),html_bytes:Buffer.byteLength(html),features:['perspective','orthographic','walk','raycast_selection','transform_controls','floor_drag','snapping','measure','json_glb_export']};
 fs.writeFileSync(path.join(folder,'studio-build.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(folder,'THREE-LICENSE.txt'),license);console.log(JSON.stringify(report));return report;
}
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={build};
