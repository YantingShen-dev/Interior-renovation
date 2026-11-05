const path=require('path');
const runtime=require('../studio/reconstruction-runtime.cjs');
runtime.status(path.resolve(__dirname,'../..'),{fresh:true}).then(value=>{
 console.log(JSON.stringify(value,null,2));
 if(!value.ready)process.exitCode=1;
}).catch(error=>{console.error(error.message);process.exitCode=1;});
