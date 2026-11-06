const crypto=require('node:crypto');
const hmac=(key,text,encoding)=>crypto.createHmac('sha256',key).update(text).digest(encoding);
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function tencentHeaders({accessId,key,action,body,now=Date.now(),host='hunyuan.tencentcloudapi.com',service='hunyuan',version='2023-09-01',region='ap-guangzhou'}){
 if(!accessId||!key)throw Error('请填写腾讯云 SecretId 和 SecretKey');
 const timestamp=Math.floor(now/1000),date=new Date(now).toISOString().slice(0,10),type='application/json; charset=utf-8';
 const signed='content-type;host;x-tc-action',canonical='POST\n/\n\ncontent-type:'+type+'\nhost:'+host+'\nx-tc-action:'+action.toLowerCase()+'\n\n'+signed+'\n'+hash(body),scope=date+'/'+service+'/tc3_request';
 const signingKey=hmac(hmac(hmac('TC3'+key,date),service),'tc3_request'),signature=hmac(signingKey,'TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+hash(canonical),'hex');
 return {'Content-Type':type,Authorization:'TC3-HMAC-SHA256 Credential='+accessId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature,'X-TC-Action':action,'X-TC-Timestamp':String(timestamp),'X-TC-Version':version,'X-TC-Region':region};
}
function klingToken(accessId,key,now=Date.now()){
 if(!accessId||!key)throw Error('请填写可灵 Access Key 和 Secret Key');
 const timestamp=Math.floor(now/1000),encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),text=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({iss:accessId,exp:timestamp+1800,nbf:timestamp-5,iat:timestamp});
 return text+'.'+hmac(key,text,'base64url');
}
module.exports={tencentHeaders,klingToken};
