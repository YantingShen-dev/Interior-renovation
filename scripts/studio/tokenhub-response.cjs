// TokenHub can report a failed operation in an HTTP 200 response.
// Never confuse request_id (diagnostic trace) with id (billable job).
function tokenHubResult(raw,{allowFailed=false}={}){
 const result=raw?.data&&!Array.isArray(raw.data)&&typeof raw.data==='object'&&!raw.status?raw.data:raw;
 const error=result?.error||raw?.error;
 const requestId=result?.request_id||raw?.request_id;
 const trace=typeof requestId==='string'?'（请求编号：'+requestId.slice(0,100)+'）':'';
 if(error||result?.status==='failed'){
  const message=typeof error==='string'?error:error?.message||result?.message||'服务商未说明失败原因';
  const code=error?.code?String(error.code)+': ':'';
  const detail='混元 3D：'+code+String(message).slice(0,500)+trace;
  if(allowFailed&&result?.status==='failed')return {result,trace,failure:detail};
  const failure=Error(detail);failure.code=error?.code;failure.request_id=requestId;throw failure;
 }
 return {result,trace};
}
function tokenHubTask(raw){
 const {result,trace}=tokenHubResult(raw),id=result?.id;
 if(typeof id==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(id))return id;
 // Do not retry submissions automatically: missing id does not prove no charge.
 throw Error('混元提交响应缺少有效任务 ID'+trace+'；请先到 TokenHub 核对任务和用量，勿重复提交');
}
module.exports={tokenHubResult,tokenHubTask};
