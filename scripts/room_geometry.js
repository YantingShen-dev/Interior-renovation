/* Shared parametric geometry for the editor and the GLB exporter. Units: metres. */
(function (root) {
  const EPS=1e-7;
  const F=typeof module!=='undefined'&&module.exports?require('./furniture_geometry.js'):root.RoomFurniture;
  function length(w){return Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]);}
  function wallMap(s){return Object.fromEntries(s.walls.map(w=>[w.id,w]));}
  function validate(s){
    const errors=[];const ids=new Set();
    if(!s.room||![s.room.length,s.room.width,s.room.height].every(v=>Number.isFinite(v)&&v>0))errors.push('房间尺寸必须为正数');
    for(const e of [...s.walls,...s.openings,...(Array.isArray(s.furniture)?s.furniture:[])]){if(ids.has(e.id))errors.push(`重复 ID ${e.id}`);ids.add(e.id);}
    for(const w of s.walls){if(![...w.start,...w.end,w.height,w.thickness].every(Number.isFinite)||length(w)<.1||w.height<=.1||w.thickness<=0)errors.push(`${w.label} 参数无效`);}
    const walls=wallMap(s);
    for(const o of s.openings){const w=walls[o.wall_id];if(!w){errors.push(`${o.label} 缺少所属墙`);continue;}
      if(![o.u,o.width,o.bottom,o.height,o.open_angle_deg||0].every(Number.isFinite)||o.u<0||o.width<=.05||o.bottom<0||o.height<=.05||o.u+o.width>length(w)+EPS||o.bottom+o.height>w.height+EPS)errors.push(`${o.label} 超出墙体范围或尺寸无效`);}
    for(let i=0;i<s.openings.length;i++)for(let j=i+1;j<s.openings.length;j++){
      const a=s.openings[i],b=s.openings[j];if(a.wall_id===b.wall_id&&Math.min(a.u+a.width,b.u+b.width)-Math.max(a.u,b.u)>EPS&&Math.min(a.bottom+a.height,b.bottom+b.height)-Math.max(a.bottom,b.bottom)>EPS)errors.push(`${a.label} 与 ${b.label} 的洞口重叠`);}
    if(F)errors.push(...F.validate(s));else if(s.furniture?.length)errors.push('家具模块未加载');
    return errors;
  }
  function wallPoint(w,u,z,depth=0){const L=length(w),dx=(w.end[0]-w.start[0])/L,dy=(w.end[1]-w.start[1])/L;return [w.start[0]+dx*u+w.outward[0]*depth,w.start[1]+dy*u+w.outward[1]*depth,z];}
  function buildParts(s){
    const errors=validate(s);if(errors.length)throw new Error(errors.join('；'));
    const parts=[],walls=wallMap(s),H=s.room.height;
    function add(id,parent,color,boxes,role){parts.push({id,parent,color,boxes,role});}
    for(const w of s.walls){
      const openings=s.openings.filter(o=>o.wall_id===w.id),L=length(w);
      const us=[...new Set([0,L,...openings.flatMap(o=>[o.u,o.u+o.width])])].sort((a,b)=>a-b);
      const zs=[...new Set([0,w.height,...openings.flatMap(o=>[o.bottom,o.bottom+o.height])])].sort((a,b)=>a-b);
      const boxes=[];const yaw=Math.atan2(w.end[1]-w.start[1],w.end[0]-w.start[0]);
      for(let i=0;i<us.length-1;i++)for(let j=0;j<zs.length-1;j++){
        if(us[i+1]-us[i]<EPS||zs[j+1]-zs[j]<EPS)continue;
        const u=(us[i]+us[i+1])/2,z=(zs[j]+zs[j+1])/2;
        if(openings.some(o=>u>o.u-EPS&&u<o.u+o.width+EPS&&z>o.bottom-EPS&&z<o.bottom+o.height+EPS))continue;
        boxes.push({center:wallPoint(w,u,z,w.thickness/2),size:[us[i+1]-us[i],w.thickness,zs[j+1]-zs[j]],yaw});
      }
      add(w.id+'_surface',w.id,[.79,.83,.87,1],boxes,'wall');
    }
    add('floor_surface','floor',[.53,.56,.59,1],[{center:[s.room.length/2,s.room.width/2,-.025],size:[s.room.length,s.room.width,.05],yaw:0}],'floor');
    add('ceiling_surface','ceiling',[.90,.92,.94,1],[{center:[s.room.length/2,s.room.width/2,H+.025],size:[s.room.length,s.room.width,.05],yaw:0}],'ceiling');
    for(const o of s.openings){
      const w=walls[o.wall_id],yaw=Math.atan2(w.end[1]-w.start[1],w.end[0]-w.start[0]),t=.035;
      const frame=[{center:wallPoint(w,o.u+t/2,o.bottom+o.height/2),size:[t,.045,o.height],yaw},
        {center:wallPoint(w,o.u+o.width-t/2,o.bottom+o.height/2),size:[t,.045,o.height],yaw},
        {center:wallPoint(w,o.u+o.width/2,o.bottom+o.height-t/2),size:[o.width,.045,t],yaw}];
      if(o.kind==='window'){
        frame.push({center:wallPoint(w,o.u+o.width/2,o.bottom+t/2),size:[o.width,.045,t],yaw});
        frame.push({center:wallPoint(w,o.u+o.width/2,o.bottom+o.height/2),size:[t,.045,o.height],yaw});
        frame.push({center:wallPoint(w,o.u+o.width/2,o.bottom+o.height*.48),size:[o.width,.045,.04],yaw});
        frame.push({center:wallPoint(w,o.u+o.width/2,o.bottom+o.height*.63),size:[o.width,.045,.04],yaw});
        add(o.id+'_frame',o.id,[.22,.30,.35,1],frame,'window_frame');
        add(o.id+'_glass',o.id,[.31,.69,.82,.28],[{center:wallPoint(w,o.u+o.width/2,o.bottom+o.height/2),size:[o.width-.04,.012,o.height-.04],yaw}],'glass');
        add(o.id+'_infill',o.id,[.82,.84,.85,1],[{center:wallPoint(w,o.u+o.width/2,o.bottom+o.height*.555),size:[o.width,.045,o.height*.15],yaw}],'window_infill');
      }else{
        add(o.id+'_frame',o.id,[.30,.34,.37,1],frame,'door_frame');
        const panel=[];
        if(o.subtype==='double_hinged'){
          const angle=(o.open_angle_deg||0)*Math.PI/180;
          for(const side of [0,1]){
            const hinge=wallPoint(w,o.u+(side?o.width:0),o.bottom+o.height/2);
            const directionYaw=yaw+(side?Math.PI:0)+(side?-1:1)*angle;
            panel.push({center:[hinge[0]+Math.cos(directionYaw)*o.width/4,hinge[1]+Math.sin(directionYaw)*o.width/4,hinge[2]],size:[o.width/2,.025,o.height-.015],yaw:directionYaw});
          }
        }else if(o.subtype==='elevator'){
          for(const f of [.25,.75])panel.push({center:wallPoint(w,o.u+o.width*f,o.bottom+o.height/2),size:[o.width/2-.006,.022,o.height-.015],yaw});
        }else{
          const a=(o.open_angle_deg||0)*Math.PI/180,hinge=wallPoint(w,o.u,o.bottom+o.height/2);
          panel.push({center:[hinge[0]+Math.cos(yaw+a)*o.width/2,hinge[1]+Math.sin(yaw+a)*o.width/2,hinge[2]],size:[o.width,.025,o.height-.015],yaw:yaw+a});
        }
        add(o.id+'_panel',o.id,o.subtype==='elevator'?[.58,.62,.66,1]:[.79,.64,.43,1],panel,'door');
      }
    }
    if(F)parts.push(...F.buildParts(s));
    return parts;
  }
  const QUADS=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  function boxVertices(b){const c=Math.cos(b.yaw||0),s=Math.sin(b.yaw||0);return [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(v=>{const x=v[0]*b.size[0]/2,y=v[1]*b.size[1]/2;return [b.center[0]+x*c-y*s,b.center[1]+x*s+y*c,b.center[2]+v[2]*b.size[2]/2];});}
  function partTriangles(part){const positions=[],normals=[];for(const box of part.boxes){const v=boxVertices(box);for(const q of QUADS){const a=v[q[0]],b=v[q[1]],c=v[q[2]],u=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-a[i]);let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];const d=Math.hypot(...n);n=n.map(x=>x/d);for(const j of [q[0],q[1],q[2],q[0],q[2],q[3]]){positions.push(...v[j]);normals.push(...n);}}}return {positions,normals};}
  function exportGLB(s){
    const parts=buildParts(s),chunks=[],views=[],accessors=[],meshes=[],materials=[],nodes=[],bufferOffsets=[];let offset=0;
    const entities=[{id:'floor',label:'地面',kind:'floor',status:'user_dimensions'},{id:'ceiling',label:'顶面',kind:'ceiling',status:'user_dimensions'},...s.walls,...s.openings,...(s.furniture||[])];
    const rootChildren=[];nodes.push({name:'room',children:rootChildren,extras:{units:'meter',mesh_coordinate_system:'RH_Y_UP',parameter_coordinate_system:'RH_Z_UP',room:s.room,provenance:s.provenance}});
    const parents={};for(const e of entities){parents[e.id]=nodes.length;rootChildren.push(nodes.length);nodes.push({name:e.id,children:[],extras:JSON.parse(JSON.stringify(e))});}
    function attribute(values){const bytes=new Uint8Array(new Float32Array(values).buffer);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){min[i%3]=Math.min(min[i%3],values[i]);max[i%3]=Math.max(max[i%3],values[i]);}const vi=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962});chunks.push(bytes);offset+=bytes.length;const ai=accessors.length;accessors.push({bufferView:vi,componentType:5126,count:values.length/3,type:'VEC3',min,max});return ai;}
    for(const part of parts){const data=partTriangles(part);function yup(v){const r=[];for(let i=0;i<v.length;i+=3)r.push(v[i],v[i+2],-v[i+1]);return r;}const pos=attribute(yup(data.positions)),norm=attribute(yup(data.normals));const mi=materials.length;materials.push({name:part.id,pbrMetallicRoughness:{baseColorFactor:part.color,metallicFactor:(part.role==='door'&&part.id.includes('lift')) ? 0.65 : 0,roughnessFactor:.8},alphaMode:part.color[3]<1?'BLEND':'OPAQUE',doubleSided:true});const gi=meshes.length;meshes.push({name:part.id,primitives:[{attributes:{POSITION:pos,NORMAL:norm},material:mi,mode:4}]});nodes[parents[part.parent]].children.push(nodes.length);nodes.push({name:part.id,mesh:gi,extras:{semantic_parent:part.parent,role:part.role}});}
    const gltf={asset:{version:'2.0',generator:'Room pilot parametric editor'},scene:0,scenes:[{nodes:[0]}],nodes,meshes,materials,buffers:[{byteLength:offset}],bufferViews:views,accessors};
    let text=new TextEncoder().encode(JSON.stringify(gltf));const jsonLength=Math.ceil(text.length/4)*4,binLength=Math.ceil(offset/4)*4;
    const result=new ArrayBuffer(12+8+jsonLength+8+binLength),dv=new DataView(result),bytes=new Uint8Array(result);
    dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,result.byteLength,true);dv.setUint32(12,jsonLength,true);dv.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonLength);bytes.set(text,20);dv.setUint32(20+jsonLength,binLength,true);dv.setUint32(24+jsonLength,0x004e4942,true);let at=28+jsonLength;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return new Uint8Array(result);
  }
  const api={length,validate,wallPoint,buildParts,boxVertices,partTriangles,exportGLB,quads:QUADS};root.RoomGeometry=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
