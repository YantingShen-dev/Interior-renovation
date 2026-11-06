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
  {id:'gemini',name:'Nano Banana · Gemini',base:'https://generativelanguage.googleapis.com/v1beta',models:['gemini-nano-banana-2.1','gemini-3-pro-image','gemini-2.5-flash-image'],keys:'https://aistudio.google.com/apikey',docs:'https://ai.google.dev/gemini-api/docs/generate-content/image-generation?hl=en',maxImages:5,hint:'使用 Google AI Studio API Key。支持空间底图及多张参考图，通过 Gemini 原生接口生成图片。'},
  {id:'qwen',name:'Qwen · 通义图像编辑',base:'https://dashscope.aliyuncs.com/api/v1',allowCustomBase:true,models:['qwen-image-2.0-pro','qwen-image-2.0','qwen-image-edit-plus'],keys:'https://bailian.console.aliyun.com/?tab=model#/api-key',docs:'https://help.aliyun.com/zh/model-studio/qwen-image-edit-api',maxImages:3,hint:'默认北京地域，须使用对应地域的百炼 Key；新加坡可填 https://dashscope-intl.aliyuncs.com/api/v1，也可填写工作空间专属域名到 /api/v1。含空间底图最多 3 张图片。'},
  {id:'hunyuan',name:'混元 · 腾讯',base:'https://hunyuan.tencentcloudapi.com',models:['hunyuan-image'],auth:'pair',accessLabel:'SecretId',secretLabel:'SecretKey',keys:'https://console.cloud.tencent.com/cam/capi',docs:'https://cloud.tencent.com/document/api/1729/105969',maxImages:1,maxPrompt:1024,formats:['image/jpeg','image/png'],hint:'使用腾讯云 SecretId 和 SecretKey，调用混元生图内容参考图接口并查询任务结果。仅支持 1 张空间底图，描述含文字附件最多 1024 字；hunyuan-image 表示此固定接口，不是可切换的模型版本。'},
  {id:'jimeng',name:'即梦 / Seedream · 火山方舟',base:'https://ark.cn-beijing.volces.com/api/v3',models:['doubao-seedream-5-0-pro-260628','doubao-seedream-5-0-flash-260915','doubao-seedream-4-5-251128'],keys:'https://ark.volcengine.com/region:cn-beijing/apikey',docs:'https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh',maxImages:5,hint:'使用火山方舟 API Key，支持 Seedream 单图和多图编辑。即梦视觉服务的 AK/SK 与方舟密钥不同，不能混用。'},
  {id:'kling',name:'可灵 · Kling',base:'https://api-singapore.klingai.com/v1',allowCustomBase:true,models:['kling-image-o1','kling-v3-omni'],auth:'key-or-pair',accessLabel:'Access Key',secretLabel:'Secret Key',keys:'https://kling.ai/dev',docs:'https://kling.ai/document-api/api/image/o1/image-generation',maxImages:5,maxPrompt:2500,formats:['image/jpeg','image/png'],hint:'新账号填 API Key 即可；旧版账号可切换为 Access Key + Secret Key，本机自动签发 JWT。支持 Omni Image 生成及任务查询。默认新加坡；按账户地域可改为 https://api-beijing.klingai.com/v1。参考图至少 300px，宽高比为 1:2.5 至 2.5:1。'}
 ],
 tripo:[
  {id:'hunyuan',name:'混元 3D · 腾讯 TokenHub',base:'https://tokenhub.tencentmaas.com/v1',models:['hy-3d-express','hy-3d-3.1','hy-3d-3.0'],keys:'https://console.cloud.tencent.com/tokenhub/apikey',docs:'https://cloud.tencent.com/document/product/1823/137175',hint:'填写 TokenHub API Key（不是腾讯云 SecretId / SecretKey）。需开通混元 3D 服务。极速版仅单图；3.1 / 3.0 专业版支持多视图，在录入家具时可选择。'},
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
const checkedAt='2026-11-05';
module.exports={providers,defaults,matchProvider,getProvider,visionModelIssue,checkedAt};
