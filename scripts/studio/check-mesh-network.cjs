const fs=require('node:fs');
const path=require('node:path');
const {createHunyuanTransport}=require('./hunyuan-network.cjs');

const config=path.resolve(__dirname,'../../.env.local');
if(fs.existsSync(config))process.loadEnvFile(config);

console.log('检查混元 HTTPS 连通性。401、404 或 405 也表示可以连接。');
createHunyuanTransport().check('https://tokenhub.tencentmaas.com/api/3d/submit').then(routes=>{
 for(const route of routes)console.log(JSON.stringify(route));
 if(!routes.some(route=>route.ok))process.exitCode=1;
}).catch(error=>{console.error(error.message);process.exitCode=1;});
