/* Shared door handing in wall coordinates: start/end hinge, inward/outward swing. */
(function(root){
 const directions=['start-in','end-in','start-out','end-out'];
 function pose(w,o,side=null){
  const direction=o.door_direction||'start-in',end=side===null?direction.startsWith('end'):!!side,out=direction.endsWith('out');
  const length=Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]),t=w.end.map((v,k)=>(v-w.start[k])/length),n=w.outward||[t[1],-t[0]],thickness=w.thickness??.12;
  const offset=w.reference_line==='center'?-thickness/2:w.reference_line==='outer'?-thickness:0;
  const hinge=w.start.map((v,k)=>v+t[k]*(o.u+(end?o.width:0))+n[k]*(offset+(out?thickness:0)));
  const closed=t.map(v=>v*(end?-1:1)),swing=n.map(v=>v*(out?1:-1));
  const radius=o.width/(o.subtype==='double_hinged'?2:1);
  const at=angle=>hinge.map((v,k)=>v+radius*(closed[k]*Math.cos(angle)+swing[k]*Math.sin(angle)));
  return {hinge,closed,swing,radius,at};
 }
 function sector(w,o){const p=pose(w,o);return [p.hinge,...Array.from({length:33},(_,i)=>p.at(i*Math.PI/64))];}
 const api={directions,pose,sector};root.RoomDoor=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
