// Debounce interactions and keep a single save in flight. Read live state only
// when the next save actually starts, so slow storage cannot queue old edits.
export function createAutosave(save,{delay=900,onPending=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let dirty=false,timer=null,running=null;
 const stopTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 async function flush(force=true){
  stopTimer();
  while(dirty||running){
   if(running){await running;if(!force&&timer!==null)return;continue;}
   dirty=false;const attempt=Promise.resolve().then(save);running=attempt;
   try{await attempt;}catch(error){dirty=true;throw error;}finally{if(running===attempt)running=null;}
   if(!force&&timer!==null)return;
  }
 }
 return {
  schedule(){dirty=true;stopTimer();onPending();timer=setTimer(()=>{timer=null;flush(false).catch(onError);},delay);},
  cancel(){dirty=false;stopTimer();},flush,
  get pending(){return dirty||timer!==null;}
 };
}
