import {positionDimensionLabels} from './asset-dimensions.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {initialDimensions} from './furniture-scale-math.mjs';
import {FurnitureScaleCommand} from './furniture-scale-command.mjs';

export async function calibrateFurniture(glb,hints,onSave,options={}){
 const dialog=document.createElement('dialog');dialog.className='furniture-scale-dialog';
 dialog.innerHTML=`<div class="dialog-heading"><h2>${options.editing?'家具参照缩放':'家具尺寸校准'}</h2><button class="quiet-button" data-action="close">${options.editing?'取消缩放':'暂不入库'}</button></div>
 <p>先选缩放方式，再点基点 → 第一参照点 → 移动鼠标预览，点击确认。Esc / 右键取消本轮，Ctrl+Z 逐步撤销。</p>
 <div class="scale-command-bar" role="status" aria-live="polite"><b data-step>正在加载模型…</b><span data-readout></span></div>
 <div class="furniture-scale-layout"><div class="furniture-scale-view" tabindex="0" aria-label="参照缩放三维画布"><div class="furniture-scale-labels"></div><span class="scale-snap-tip" hidden></span></div>
 <div class="furniture-scale-controls">
 <div class="scale-mode-buttons" aria-label="缩放命令"><button data-mode="1">单轴 Scale1D</button><button data-mode="2">双轴 Scale2D</button><button data-mode="3">三轴 Scale</button></div>
 <label data-axis-label>方向 / 工作平面<select data-axes aria-label="方向或工作平面"><option value="012">XYZ · 等比</option></select></label>
 <button class="primary-button" data-action="start">开始参照缩放</button>
 <div class="scale-command-input"><label><span data-input-label>倍率 / 目标长度</span><input data-value type="number" min="0.0001" step="any" disabled placeholder="先选择基点"></label><button class="quiet-button" data-action="enter" disabled>确认 · Enter</button></div>
 <p data-note>正在加载模型…</p>
 <button class="quiet-button" data-action="cancel" disabled>取消本轮 · Esc</button>
 <div class="scale-dimensions" aria-label="实时尺寸"></div>
 <div class="scale-utility"><button class="quiet-button" data-action="undo" aria-keyshortcuts="Control+Z Meta+Z" disabled>撤销 · Ctrl+Z</button><button class="quiet-button" data-action="fit">适应画面</button><button class="quiet-button" data-action="reset">恢复原尺寸</button></div>
 <label><input data-confirm type="checkbox"> 已根据实测参照校准尺寸</label>
 <p class="micro-note">${options.editing?'保存尺寸更新原资产；取消关闭不写入。':'未知尺寸可先暂估入库；未经实测的尺寸标记为待核对。'}</p>
 <details><summary>操作说明</summary><p>基点保持固定。包围盒角点、中点可吸附；也可选模型表面或地面。单轴沿 X/Y/Z，双轴沿所选平面，三轴等比。选基点后可直接输入倍率；选第一参照点后可输入目标长度（cm）。中键旋转，右键拖动平移，滚轮缩放视图。</p></details>
 </div></div><div class="furniture-scale-footer"><button class="primary-button" data-action="save" disabled>${options.editing?'保存尺寸':'确认尺寸并入库'}</button></div>`;
 document.body.append(dialog);dialog.showModal();
 const q=s=>dialog.querySelector(s),host=q('.furniture-scale-view'),labels=q('.furniture-scale-labels'),command=new FurnitureScaleCommand();
 let renderer,orbit,scene,root,line,bounds,handles,guide,observer,disposed=false,initial,dims,native,origin=[0,0,0],history=[],mode=3,hover=null,down=null;
 const note=text=>q('[data-note]').textContent=text,active=()=>command.stage!=='idle';
 q('[data-confirm]').checked=!!options.confirmed;
 const release=o=>{o?.geometry?.dispose();o?.material?.dispose();};
 function cleanup(){disposed=true;observer?.disconnect();orbit?.dispose();renderer?.setAnimationLoop(null);scene?.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});renderer?.dispose();dialog.remove();options.onClose?.();}
 dialog.addEventListener('close',cleanup,{once:true});q('[data-action=close]').onclick=()=>dialog.close();
 try{
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.prepend(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#f3f7fc');scene.add(new THREE.HemisphereLight(0xffffff,0x78899a,3));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(3,-4,6);scene.add(sun);
 const camera=new THREE.PerspectiveCamera(42,1,.001,1000);camera.up.set(0,0,1);orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
 const gltf=await new GLTFLoader().loadAsync(glb);if(disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])m.dispose();});return;}
 root=new THREE.Group();const object=gltf.scene;object.rotation.x=Math.PI/2;object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());native=size.toArray();object.position.set(-center.x,-center.y,-box.min.z);root.add(object);scene.add(root);
 initial=initialDimensions(native,hints);dims=[...initial];
 const spans=['宽','深','高'].map((name,i)=>{const s=document.createElement('span');labels.append(s);const l=document.createElement('div');l.innerHTML=`<small>${['X 宽','Y 深','Z 高'][i]} / cm</small><output></output>`;q('.scale-dimensions').append(l);return s;});let labelPoints=[];
 function axes(){return [...q('[data-axes]').value].map(Number);}
 function ruler(){if(line){scene.remove(line);release(line);}const [x,y,z]=dims,pad=Math.max(...dims)*.1;
  const edges=[[[-x/2,-y/2-pad,0],[x/2,-y/2-pad,0]],[[x/2+pad,-y/2,0],[x/2+pad,y/2,0]],[[-x/2-pad,-y/2-pad,0],[-x/2-pad,-y/2-pad,z]]];const vertices=[];
  for(const [i,[a,b]]of edges.entries()){for(const p of [a,b]){vertices.push(...p.map((v,j)=>v+origin[j]));}for(const p of [a,b]){const lo=[...p],hi=[...p],axis=i===2?0:2;lo[axis]-=pad*.15;hi[axis]+=pad*.15;vertices.push(...lo.map((v,j)=>v+origin[j]),...hi.map((v,j)=>v+origin[j]));}}
  line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color:0x0058a3,depthTest:false}));line.renderOrder=10;scene.add(line);
  labelPoints=edges.map(([a,b])=>new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5).add(new THREE.Vector3(...origin)));
 }
 function corners(d=dims,o=origin){const result=[];for(const x of [-.5,0,.5])for(const y of [-.5,0,.5])for(const z of [0,.5,1])if([x===0,y===0,z===.5].filter(Boolean).length<=1)result.push(new THREE.Vector3(x*d[0]+o[0],y*d[1]+o[1],z*d[2]+o[2]));return result;}
 function update(){root.scale.set(...dims.map((d,i)=>d/native[i]));root.position.set(...origin);root.updateMatrixWorld(true);ruler();
  spans.forEach((s,i)=>{s.textContent=['宽','深','高'][i]+' '+(dims[i]*100).toFixed(1)+' cm';q('.scale-dimensions').children[i].querySelector('output').textContent=(dims[i]*100).toFixed(1);});
  if(bounds){scene.remove(bounds);release(bounds);}bounds=new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(origin[0]-dims[0]/2,origin[1]-dims[1]/2,origin[2]),new THREE.Vector3(origin[0]+dims[0]/2,origin[1]+dims[1]/2,origin[2]+dims[2])),0xe8b700);bounds.material.depthTest=false;bounds.renderOrder=8;bounds.visible=active();scene.add(bounds);
  if(handles){scene.remove(handles);release(handles);}handles=new THREE.Points(new THREE.BufferGeometry().setFromPoints(corners()),new THREE.PointsMaterial({color:0x0058a3,size:6,sizeAttenuation:false,depthTest:false}));handles.renderOrder=12;handles.visible=active()&&command.stage!=='target';scene.add(handles);
 }
 function fit(){const d=Math.max(...dims)*1.65;orbit.target.set(origin[0],origin[1],origin[2]+dims[2]/2);camera.position.copy(orbit.target).add(new THREE.Vector3(d,-d,d*.65));orbit.update();}
 function state(){const stage=command.stage;
  q('[data-step]').textContent={idle:'选择缩放方式，开始操作',base:'① 指定基点 · Enter 使用底面中心',reference:'② 第一参照点 · 或输入缩放倍率',target:'③ 第二参照点 · 移动鼠标预览，点击 / Enter 确认'}[stage];
  q('[data-action=cancel]').disabled=!active();q('[data-action=save]').disabled=active();q('[data-action=undo]').disabled=!active()&&!history.length;
  q('[data-value]').disabled=stage==='base'||stage==='idle';q('[data-action=enter]').disabled=stage==='idle';
  q('[data-input-label]').textContent=stage==='reference'?'缩放倍率':stage==='target'?'目标参照长度 / cm':'倍率 / 目标长度';q('[data-value]').placeholder=stage==='reference'?'例如 1.5，Enter 确认':'输入长度，Enter 确认';
  orbit.mouseButtons.LEFT=active()?null:THREE.MOUSE.ROTATE;host.style.cursor=active()?'crosshair':'grab';
  if(bounds)bounds.visible=active();if(handles)handles.visible=active()&&stage!=='target';
 }
 function clearGuide(){if(guide){scene.remove(guide);guide.traverse(release);guide=null;}hover=null;q('.scale-snap-tip').hidden=true;}
 function drawGuide(point){clearGuide();guide=new THREE.Group();scene.add(guide);const base=command.base&&new THREE.Vector3(...command.base);
  if(base){const ball=new THREE.Mesh(new THREE.SphereGeometry(Math.max(...dims)*.008,10,6),new THREE.MeshBasicMaterial({color:0xf2b900,depthTest:false}));ball.position.copy(base);ball.renderOrder=20;guide.add(ball);}
  if(point&&base){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([base,point]),new THREE.LineBasicMaterial({color:0xe29a00,depthTest:false}));l.renderOrder=20;guide.add(l);}
 }
 function apply(result){dims=[...result.dimensions];origin=[...result.origin];update();q('[data-readout]').textContent=(result.ratio||1).toFixed(3)+'×'+(result.length?' · 目标 '+(result.length*100).toFixed(2)+' cm':'');}
 function cancel(){if(!active())return;apply(command.cancel());clearGuide();q('[data-value]').value='';q('[data-readout]').textContent='';state();note('已取消本轮，恢复操作前的尺寸。');}
 function start(){if(active())cancel();command.begin(dims,origin,axes());command.base=null;q('[data-value]').value='';q('[data-readout]').textContent='';update();state();note('在画布点击基点，角点和中点可吸附。');host.focus();}
 function confirm(){try{const result=command.confirm();history.push(command.before);apply(result);clearGuide();q('[data-value]').value='';state();note('本轮缩放已确认。可继续缩放，或保存尺寸。');host.focus();}catch(e){note(e.message);}}
 function numeric(){const value=Number(q('[data-value]').value);if(!q('[data-value]').value)return false;
  try{if(command.stage==='reference')apply(command.previewRatio(value));else if(command.stage==='target'){const result=command.previewLength(value/100);apply(result);drawGuide(new THREE.Vector3(...command.base).addScaledVector(new THREE.Vector3(...command.direction),value/100));}return true;}catch(e){note(e.message);return false;}}
 function enter(){if(command.stage==='base'){command.setBase([...origin]);state();drawGuide();note('已用底面中心为基点，请指定第一参照点。');}else if((command.stage==='reference'||command.stage==='target')&&(q('[data-value]').value?numeric():!!command.result))confirm();}
 q('[data-action=start]').onclick=start;q('[data-action=cancel]').onclick=cancel;q('[data-action=enter]').onclick=enter;q('[data-value]').oninput=numeric;
 for(const b of dialog.querySelectorAll('[data-mode]'))b.onclick=()=>{if(active())cancel();mode=Number(b.dataset.mode);q('[data-axes]').innerHTML=mode===1?'<option value="0">X · 宽</option><option value="1">Y · 深</option><option value="2">Z · 高</option>':mode===2?'<option value="01">XY · 水平面</option><option value="02">XZ · 正面</option><option value="12">YZ · 侧面</option>':'<option value="012">XYZ · 等比</option>';for(const button of dialog.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button===b));start();};
 q('[data-axes]').onchange=start;q('[data-action=fit]').onclick=fit;
 function undo(){if(active()){cancel();host.focus();return;}const last=history.pop();if(last){apply(last);clearGuide();q('[data-value]').value='';q('[data-readout]').textContent='';state();note('已撤销上次缩放'+(history.length?'，还可撤销 '+history.length+' 步。':'，已回到最初尺寸。'));host.focus();}else note('没有可撤销的缩放。');}
 q('[data-action=undo]').onclick=undo;
 q('[data-action=reset]').onclick=()=>{if(active())cancel();history.push({dimensions:[...dims],origin:[...origin]});dims=[...initial];origin=[0,0,0];q('[data-confirm]').checked=!!options.confirmed;update();state();fit();};
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
 function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(mouse,camera);return r;}
 function pick(e){const r=pointerRay(e);let closest=null,distance=14;
  for(const p of corners(command.before?.dimensions||dims,command.before?.origin||origin)){const v=p.clone().project(camera);if(v.z< -1||v.z>1)continue;const dist=Math.hypot((v.x+1)*r.width/2+r.left-e.clientX,(1-v.y)*r.height/2+r.top-e.clientY);if(dist<distance){closest=p;distance=dist;}}
  if(closest)return {point:closest,snap:true};
  root.updateMatrixWorld(true);const hit=ray.intersectObject(root,true)[0];if(hit)return {point:hit.point,snap:false};
  const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-origin[2]),point=new THREE.Vector3();return ray.ray.intersectPlane(plane,point)?{point,snap:false}:null;
 }
 function target(e){pointerRay(e);const base=new THREE.Vector3(...command.base),direction=new THREE.Vector3(...command.direction),view=camera.getWorldDirection(new THREE.Vector3());
  const normal=view.addScaledVector(direction,-view.dot(direction));if(normal.lengthSq()<1e-8)return null;
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(),base),point=new THREE.Vector3();return ray.ray.intersectPlane(plane,point)?point:null;
 }
 function move(e){if(!active()||e.buttons)return;
  if(command.stage==='target'){
   if(document.activeElement===q('[data-value]')&&q('[data-value]').value)return;
   const point=target(e);if(!point)return;try{const result=command.previewPoint(point.toArray());apply(result);drawGuide(new THREE.Vector3(...command.base).addScaledVector(new THREE.Vector3(...command.direction),result.length));note('点击第二参照点确认；也可输入目标长度后 Enter。');}catch{command.result=null;note('请在基点的参照方向一侧移动，且各边尺寸介于 0.1cm–100m。');}
  }else{const hit=pick(e);if(!hit)return;drawGuide(hit.point);hover=hit;const r=host.getBoundingClientRect(),tip=q('.scale-snap-tip');tip.hidden=false;tip.textContent=hit.snap?'包围盒端点 / 中点':'表面 / 地面';tip.style.left=Math.min(r.width-120,e.clientX-r.left+12)+'px';tip.style.top=Math.max(0,e.clientY-r.top-24)+'px';}
 }
 renderer.domElement.addEventListener('pointermove',move);
 renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,button:e.button};});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
  if(e.button===2){if(active())cancel();return;}if(e.button!==0||!active())return;
  if(command.stage==='target'){if(document.activeElement===q('[data-value]')&&q('[data-value]').value){if(numeric())confirm();}else{move({...e,buttons:0,clientX:e.clientX,clientY:e.clientY});if(command.result)confirm();}return;}
  const hit=pick(e);if(!hit)return;
  if(command.stage==='base'){command.setBase(hit.point.toArray());drawGuide();state();note('基点已固定。点第一参照点，或输入倍率后 Enter。');}
  else{try{command.setReference(hit.point.toArray());q('[data-value]').value='';state();drawGuide(hit.point);q('[data-readout]').textContent='原参照 '+(command.reference*100).toFixed(2)+' cm';note('移动鼠标调整大小，点击第二参照点；也可输入目标长度。');}catch(err){note(err.message);}}
  host.focus();
 });
 renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 dialog.addEventListener('cancel',e=>{if(active()){e.preventDefault();cancel();}});
 dialog.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();if(!e.repeat)undo();return;}if(e.key==='Enter'&&active()){e.preventDefault();enter();}else if(active()&&['reference','target'].includes(command.stage)&&!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)&&/^[0-9.]$/.test(e.key)){e.preventDefault();q('[data-value]').focus();q('[data-value]').value=e.key;numeric();}});
 q('[data-action=save]').onclick=async()=>{if(active())return;q('[data-action=save]').disabled=true;try{await onSave([...dims],q('[data-confirm]').checked);dialog.close();}catch(e){note(e.message);q('[data-action=save]').disabled=false;}};
 observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(host);update();fit();state();q('[data-mode="3"]').setAttribute('aria-pressed','true');note('选择单轴、双轴或三轴开始；当前尺寸'+(options.confirmed?'已实测校准。':'仍为暂估。'));
 renderer.setAnimationLoop(()=>{if(!dialog.open)return;orbit.update();renderer.render(scene,camera);positionDimensionLabels(labelPoints.map((point,i)=>({point,node:spans[i]})),camera,host);});
 }catch(e){note('预览加载失败：'+e.message+'。关闭后可重新打开，模型不会自动入库。');}
}
