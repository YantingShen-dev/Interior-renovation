// Scene metadata is mutable; media strings are immutable. Never duplicate the
// model/image bytes with structuredClone for an edit or a history snapshot.
function clone(value,seen){
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return seen.get(value);
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return structuredClone(value);
 const next=Array.isArray(value)?new Array(value.length):{};seen.set(value,next);
 for(const key of Object.keys(value))next[key]=clone(value[key],seen);
 return next;
}
const copy=value=>clone(value,new WeakMap());
function equal(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 if(Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
 if(a instanceof Date)return a.getTime()===b.getTime();
 if(!Array.isArray(a)&&Object.getPrototypeOf(a)!==Object.prototype&&Object.getPrototypeOf(a)!==null)return false;
 const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
 return keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
}
module.exports={copy,equal};
