// Official API documentation checked on 2026-11-02. Directory entries do not imply an implemented transport.
const providers={
 chat:[
  {id:'deepseek',name:'DeepSeek',base:'https://api.deepseek.com',models:['deepseek-flash'],keys:'https://platform.deepseek.com/api_keys',docs:'https://api-docs.deepseek.com/quick_start/'},
  {id:'kimi',name:'Kimi · 月之暗面',base:'https://api.moonshot.cn/v1',models:['kimi-k3.1-pro'],keys:'https://platform.kimi.com/console/api-keys',docs:'https://platform.kimi.com/docs/get-api-key'},
  {id:'qwen-cn',name:'Qwen · 通义千问（北京）',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',models:['qwen3.8-max','qwen3.8-flash','qwen3.7-plus','qwen3-vl-plus','qwen3-vl-flash'],keys:'https://bailian.console.aliyun.com/?tab=model#/api-key',docs:'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',hint:'使用北京地域的 API Key；专属域名请选自定义服务。'},
  {id:'qwen-intl',name:'Qwen · 通义千问（新加坡）',base:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',models:['qwen3.8-max','qwen3.8-flash','qwen3.7-plus','qwen3-vl-plus','qwen3-vl-flash'],keys:'https://bailian.console.alibabacloud.com/?tab=model#/api-key',docs:'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope',hint:'使用新加坡地域的 API Key。'},
  {id:'glm',name:'GLM · 智谱',base:'https://open.bigmodel.cn/api/paas/v4',models:['glm-5.3-flash','glm-5.3-flashx','glm-4.6v','glm-4.6v-flash'],keys:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',docs:'https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash',hint:'使用模型标准 API 密钥，Coding Plan 密钥不能混用。'},
  {id:'minimax',name:'MiniMax',base:'https://api.minimax.cn/v1',models:['MiniMax-M3.1-Flash'],keys:'https://platform.minimax.cn/user-center/basic-information/interface-key',docs:'https://platform.minimax.cn/docs/api-reference/text-openai-api',jsonMode:false},
  {id:'openai',name:'GPT · OpenAI',base:'https://api.openai.com/v1',models:['gpt-6.1-sol','gpt-6.1-terra','gpt-6-astra','gpt-6-luna'],keys:'https://platform.openai.com/api-keys',docs:'https://developers.openai.com/api/docs/models'},
  {id:'claude',name:'Claude · Anthropic',base:'https://api.anthropic.com/v1',models:['claude-opus-5-5','claude-sonnet-5-5','claude-haiku-5-5','claude-fable-5-1'],keys:'https://platform.claude.com/settings/keys',docs:'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk',jsonMode:false},
  {id:'gemini',name:'Gemini · Google',base:'https://generativelanguage.googleapis.com/v1beta/openai',models:['gemini-4-argon','gemini-3.8-flash'],keys:'https://aistudio.google.com/apikey',docs:'https://ai.google.dev/gemini-api/docs/openai'},
  {id:'grok',name:'Grok · xAI',base:'https://api.x.ai/v1',models:['grok-4.7'],keys:'https://console.x.ai/',docs:'https://docs.x.ai/developers/quickstart'}
 ],
 image:[
  {id:'openai',name:'GPT Image · OpenAI',base:'https://api.openai.com/v1',models:['gpt-image-2.5-sunburst','gpt-image-2.5-flare'],keys:'https://platform.openai.com/api-keys',docs:'https://developers.openai.com/api/reference/resources/images/methods/edit'},
  {id:'gemini',name:'Nano Banana · Gemini',models:['gemini-nano-banana-2.1','gemini-3-pro-image'],keys:'https://aistudio.google.com/apikey',docs:'https://ai.google.dev/gemini-api/docs/image-generation',pending:true},
  {id:'qwen',name:'Qwen · 通义图像编辑',models:['qwen-image-2.0-pro','qwen-image-2.0'],keys:'https://bailian.console.aliyun.com/?tab=model#/api-key',docs:'https://help.aliyun.com/zh/model-studio/qwen-image-edit-api',pending:true},
  {id:'hunyuan',name:'混元 · 腾讯',models:[],keys:'https://console.cloud.tencent.com/cam/capi',docs:'https://cloud.tencent.com/document/api/1668/113697',pending:true,hint:'官方接口使用 SecretId / SecretKey，需在腾讯云开通相应服务。'},
  {id:'jimeng',name:'即梦 · 火山引擎',models:['doubao-seedream-5-0-pro-260628','doubao-seedream-5-0-flash-260915'],keys:'https://console.volcengine.com/ai/ability',docs:'https://docs.volcengine.com/docs/ark/image-generation-tutorial?lang=zh',pending:true,hint:'Seedream 5.0 的模型 ID 对应火山方舟接口；即梦视觉服务的请求参数不同，平台调用仍待接入。'},
  {id:'kling',name:'可灵 · Kling',models:[],keys:'https://kling.ai/dev',docs:'https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview',pending:true,hint:'在开发者平台创建 Access Key / Secret Key。'}
 ],
 tripo:[
  {id:'hunyuan',name:'混元 3D · 腾讯 TokenHub',base:'https://tokenhub.tencentmaas.com/v1',models:['hy-3d-express'],keys:'https://console.cloud.tencent.com/tokenhub/apikey',docs:'https://cloud.tencent.com/document/product/1823/137175',hint:'填写 TokenHub API Key（不是腾讯云 SecretId / SecretKey）。需开通混元 3D 服务；图片最大 6MB。'},
  {id:'tripo',name:'Tripo',base:'https://openapi.tripo3d.ai/v3',models:['v3.1-20260211','v3.0-20250812'],keys:'https://platform.tripo3d.ai/api-keys',docs:'https://docs.tripo3d.ai/'},
  {id:'rodin',name:'影眸 · Hyper3D / Rodin',models:['Gen-2.5'],keys:'https://hyper3d.ai/workspace/api-dashboard',docs:'https://docs.hyper3d.ai/en',pending:true},
  {id:'meshy',name:'Meshy',base:'https://api.meshy.ai/openapi/v1',models:['meshy-7.1','meshy-t2.5'],keys:'https://www.meshy.ai/developers/keys',docs:'https://docs.meshy.ai/en/api/image-to-3d'}
 ]
};
const defaults={chat:'deepseek',image:'openai',tripo:'tripo'};
function matchProvider(kind,base){return providers[kind]?.find(p=>p.base&&p.base.replace(/\/$/,'')===String(base||'').replace(/\/$/,''));}
function getProvider(kind,id){return providers[kind]?.find(p=>p.id===id);}
// Former text presets (or presets without verified vision support) must not stay active silently.
const removedVisionPresets=new Set(['deepseek-chat','deepseek-reasoner','deepseek-v4-pro','qwen-plus','qwen-turbo','glm-5.3','MiniMax-M2','MiniMax-M2.5','MiniMax-M2.7']);
function visionModelIssue(model){return removedVisionPresets.has(model)?'原模型未满足视觉预设要求，请在「配置服务」重新选择支持图片与工具调用的模型。':'';}
const checkedAt='2026-11-02';
module.exports={providers,defaults,matchProvider,getProvider,visionModelIssue,checkedAt};
