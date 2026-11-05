import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
// Local real-time raster rendering. No cloud request or path-tracing dependency.
export class QuickRender{
 constructor(renderer,scene,camera){this.composer=new EffectComposer(renderer);this.composer.setPixelRatio(1);this.ao=new SSAOPass(scene,camera,1,1,24);this.ao.kernelRadius=.55;this.output=new OutputPass();this.antialias=new ShaderPass(FXAAShader);this.beauty=new RenderPass(scene,camera);this.composer.addPass(this.beauty);this.composer.addPass(this.ao);this.composer.addPass(this.output);this.composer.addPass(this.antialias);}
 resize(w,h){const factor=Math.min(1.5,globalThis.devicePixelRatio||1,1600/Math.max(w,h)),width=Math.max(1,Math.round(w*factor)),height=Math.max(1,Math.round(h*factor));this.composer.setSize(width,height);this.antialias.uniforms.resolution.value.set(1/width,1/height);}
 render(camera){this.beauty.camera=camera;this.ao.camera=camera;
  // SSAO distances are normalized by camera depth, while radius is in scene metres.
  // Keep contact shading stable when switching cameras or changing the far plane.
  this.ao.minDistance=.006/(camera.far-camera.near);this.ao.maxDistance=.8/(camera.far-camera.near);
  const perspective=camera.isPerspectiveCamera?1:0;
  for(const material of [this.ao.ssaoMaterial,this.ao.depthRenderMaterial]){if(material.defines.PERSPECTIVE_CAMERA!==perspective){material.defines.PERSPECTIVE_CAMERA=perspective;material.needsUpdate=true;}material.uniforms.cameraNear.value=camera.near;material.uniforms.cameraFar.value=camera.far;}
  this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);this.composer.render();}
 dispose(){this.ao.dispose();this.output.dispose();this.antialias.dispose();this.composer.dispose();}
}
