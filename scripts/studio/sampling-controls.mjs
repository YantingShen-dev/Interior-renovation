import sampling from './video-sampling.cjs';
export function samplingMarkup(prefix,limit=120){return `<fieldset class="sampling-controls" id="${prefix}-sampling"><legend>视频抽帧设置</legend><div class="sampling-fields"><label>抽帧方式<select id="${prefix}-sampling-mode"><option value="count">均匀抽取指定帧数</option><option value="interval">每隔指定秒数抽一帧</option></select></label><label id="${prefix}-sampling-count-label">抽取帧数<input id="${prefix}-sampling-count" type="number" min="2" max="${limit}" step="1" value="20"></label><label id="${prefix}-sampling-interval-label" hidden>间隔 / 秒<input id="${prefix}-sampling-interval" type="number" min="0.1" max="3600" step="0.1" value="2"></label></div><p class="micro-note" id="${prefix}-sampling-note">默认均匀抽 20 帧。每次最多 ${limit} 帧；帧数越多，后续 AI 读图耗时和用量可能越高。</p></fieldset>`;}
export function setupSampling(prefix,{limit=120,onChange}={}){
 const $=suffix=>document.getElementById(prefix+'-sampling-'+suffix),mode=$('mode'),count=$('count'),interval=$('interval');mode.value='count';count.value='20';interval.value='2';
 const read=()=>sampling.samplingOptions({mode:mode.value,count:Number(count.value),interval:Number(interval.value),limit});
 function sync(){const byTime=mode.value==='interval';$('count-label').hidden=byTime;$('interval-label').hidden=!byTime;}
 const change=()=>{sync();try{read();$('note').textContent='设置已更改，请重新读取 / 抽取视频画面后使用。每次最多 '+limit+' 帧。';onChange?.();}catch(e){$('note').textContent=e.message;onChange?.();}};
 for(const input of [mode,count,interval])input.onchange=change;sync();return {read,setBusy(value){for(const input of [mode,count,interval])input.disabled=value;}};
}
