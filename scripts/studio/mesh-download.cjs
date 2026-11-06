const fs=require('node:fs');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');

async function downloadMesh(url,file,fetchModel=fetch){
 const controller=new AbortController(),{signal}=controller;
 const idle=setTimeout(()=>controller.abort(Error('下载连接超过 60 秒没有收到数据')),60_000);
 try{
  const response=await fetchModel(url,{signal});
  if(!response.ok||!response.body){
   await response.body?.cancel();
   throw Error(`模型文件服务器返回 HTTP ${response.status}`);
  }
  const trackActivity=new Transform({transform(chunk,encoding,done){idle.refresh();done(null,chunk);}});
  idle.refresh();
  await pipeline(Readable.fromWeb(response.body),trackActivity,fs.createWriteStream(file),{signal});
 }catch(error){throw signal.reason||error;}
 finally{clearTimeout(idle);}
}

module.exports={downloadMesh};
