const fs=require('fs');const G=require('./room_geometry.js');
const scene=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const errors=G.validate(scene);if(errors.length)throw new Error(errors.join('; '));
fs.writeFileSync(process.argv[3],Buffer.from(G.exportGLB(scene)));
if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(G.buildParts(scene)));
console.log(JSON.stringify({entities:scene.walls.length+scene.openings.length+(scene.furniture||[]).length+2,parts:G.buildParts(scene).length,output:process.argv[3]}));
