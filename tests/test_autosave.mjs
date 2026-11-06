import assert from 'node:assert/strict';
import {createAutosave} from '../scripts/studio/autosave.mjs';
const timers=new Map();let serial=0,value=0,writes=[];
const options={setTimer:(fn,delay)=>{assert.equal(delay,900);timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)};
const tick=async()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());for(let i=0;i<10;i++)await Promise.resolve();};
const queue=createAutosave(async()=>{writes.push(value);},options);
for(let i=1;i<=30;i++){value=i;queue.schedule();}assert.equal(writes.length,0);assert.equal(timers.size,1);await tick();assert.deepEqual(writes,[30]);assert(!queue.pending);
// Changes during a slow save must not create concurrent writes or old snapshots.
let release,active=0,maxActive=0;
const slow=createAutosave(async()=>{active++;maxActive=Math.max(maxActive,active);writes.push(value);if(!release)await new Promise(r=>release=r);active--;},options);
value=40;slow.schedule();await tick();assert.equal(active,1);
for(let i=41;i<=60;i++){value=i;slow.schedule();}await tick();assert.equal(writes.at(-1),40);
release();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(maxActive,1);assert.deepEqual(writes.slice(-2),[40,60]);assert(!slow.pending);
// Explicit save consumes the pending timer; a failed save remains retryable.
value=70;queue.schedule();await queue.flush();assert.equal(writes.at(-1),70);assert.equal(timers.size,0);assert(!queue.pending);
let fail=true;const errors=[],retry=createAutosave(async()=>{if(fail)throw Error('storage unavailable');writes.push(value);},{...options,onError:e=>errors.push(e.message)});
retry.schedule();await tick();assert.deepEqual(errors,['storage unavailable']);assert(retry.pending);fail=false;value=80;await retry.flush();assert.equal(writes.at(-1),80);assert(!retry.pending);
queue.schedule();queue.cancel();await tick();assert(!queue.pending);assert.equal(writes.at(-1),80);
console.log('PASS 30 edits → one latest save, single in-flight writer, coalesced edits during slow storage, explicit flush, retry and timer cancellation');
