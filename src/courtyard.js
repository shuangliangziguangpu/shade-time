import * as THREE from 'three';
import { SCENE_CONFIG } from './domain/scene-config.js';
import { inspectLayout } from './domain/layout.js';
import { analyzeCourtyard } from './domain/analysis.js';
import { parseShanghaiDateTime, DEG } from './core/sun.js';
import { castSunRay } from './core/geometry.js';
import { createVisualMaterials } from './view/visual-materials.js';
import { createVisualScene } from './view/visual-scene.js';
import { createRenderPipeline, verifyProxyRendering } from './view/render-pipeline.js';
import { createCameraRig } from './view/camera-rig.js';

const $ = id => document.getElementById(id);
let selection = { regionId: 'R3', canopyId: 'R3' };
let referenceHeight = 1.5;

function start() {
  for (const position of SCENE_CONFIG.positions) {
    const legal = inspectLayout({ regionId: position.id, canopyId: selection.canopyId }).validation.valid;
    $('region-id').add(new Option(`${position.id}${legal ? '' : ' · 通道禁放'}`, position.id));
  }
  for (const id of SCENE_CONFIG.canopyPositionIds) $('canopy-id').add(new Option(id, id));
  const initial = inspectLayout(selection).scene;
  const textureStart = performance.now();
  const materials = createVisualMaterials();
  const proceduralTextureMs = performance.now() - textureStart;
  const viewport = $('court-viewport');
  const pipeline = createRenderPipeline(viewport, initial, materials);
  const { renderer, world } = pipeline;
  const model = createVisualScene(initial, materials);
  world.add(model.group);
  const rig = createCameraRig(renderer.domElement, initial);
  const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }), 100);
  markers.frustumCulled = false;
  markers.renderOrder = 5;
  world.add(markers);
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(initial.target.size[0], initial.target.size[2]), new THREE.MeshBasicMaterial({ color: 0x52959c, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  reference.rotation.x = -Math.PI / 2;
  world.add(reference);
  const evidenceRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x26879c, depthTest: false }));
  evidenceRay.renderOrder = 6;
  world.add(evidenceRay);
  const sunArrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0.12,initial.courtyard.min[2]+2.2),3.2,0xc49542,0.35,0.18);
  sunArrow.visible=false;world.add(sunArrow);
  let analysis, analysisRuns = 0, bindingRows = [];
  let proxyCheck = null, performanceResult = null, measuring = null;
  let latestTimestamp = 0, firstRenderReturnedMs = null;
  function invalidatePerformance() { performanceResult=null;measuring=null;$('performance-result').textContent='当前视角尚未测量帧率'; }
  function invalidateVerification() {proxyCheck=null;$('proxy-result').textContent='当前布局、时刻或视角尚未执行WebGL对照';}

  function failure(message) {
    for (const id of ['rate','ground-rate','raised-rate']) $(id).textContent = 'N/A';
    $('sample-count').textContent = '当前条件不提供正常采样指标';
    $('analysis-state').textContent = message;
    $('evidence').textContent = '没有可用的遮挡证据。';
    markers.visible = reference.visible = evidenceRay.visible = sunArrow.visible = false;
  }
  function drawAnalysis() {
    $('height-ground').setAttribute('aria-pressed', String(referenceHeight === 0));
    $('height-person').setAttribute('aria-pressed', String(referenceHeight === 1.5));
    const overlay = $('show-samples').checked;
    model.guides.visible = overlay;
    sunArrow.visible=overlay&&Boolean(analysis?.sun.altitude>0);
    if (!analysis || analysis.status !== 'valid') return;
    const result = referenceHeight === 0 ? analysis.ground : analysis.elevated;
    const percent = value => `${(value * 100).toFixed(0)}%`;
    $('rate').textContent = percent(result.rate);
    $('ground-rate').textContent = percent(analysis.ground.rate);
    $('raised-rate').textContent = percent(analysis.elevated.rate);
    $('sample-count').textContent = `${result.shadedCount} / ${result.total} 个网格中心被遮挡`;
    $('analysis-state').textContent = '';
    markers.visible = reference.visible = evidenceRay.visible = overlay;
    reference.position.set(analysis.scene.target.center[0], referenceHeight + 0.006, analysis.scene.target.center[2]);
    const matrix = new THREE.Matrix4();
    result.samples.forEach((sample,index) => {
      markers.setMatrixAt(index, matrix.makeTranslation(sample.point.x,sample.point.y+0.02,sample.point.z));
      markers.setColorAt(index,new THREE.Color(sample.status==='blocked'?0x318ba0:0xc69435));
    });
    markers.instanceMatrix.needsUpdate = markers.instanceColor.needsUpdate = true;
    const witness = result.samples[55];
    evidenceRay.geometry.dispose();
    evidenceRay.geometry = new THREE.BufferGeometry().setFromPoints([witness.point,witness.hit??witness.point.clone().addScaledVector(analysis.sun.direction,6)]);
    $('evidence').textContent = witness.status==='blocked' ? `${witness.id} → 最近命中 ${witness.blockerId}。` : `${witness.id} → 模型内直射。`;
  }
  function refresh() {
    invalidatePerformance();
    invalidateVerification();
    try {
      analysis = analyzeCourtyard(selection,parseShanghaiDateTime($('date').value,$('time').value));
      analysisRuns++;
      const modelUpdate=model.update(analysis.scene);
      bindingRows = modelUpdate.bindings;
      if(modelUpdate.moved)pipeline.markShadowDirty();
      pipeline.applySun(analysis.sun);
      sunArrow.setDirection(analysis.sun.direction);
      $('altitude').textContent = `${(analysis.sun.altitude/DEG).toFixed(1)}°`;
      $('azimuth').textContent = `${((analysis.sun.azimuth/DEG+540)%360).toFixed(1)}°`;
      $('geometry-status').textContent = `${bindingRows.length}个分析实体 · 视觉与投影绑定已校验`;
      if(analysis.status!=='valid') failure(analysis.status==='below-horizon'?'太阳位于地平线以下，指标N/A。':analysis.status==='low-altitude'?'太阳高度低于5°，指标N/A。':'布局或采样原点无效。');
      else drawAnalysis();
    } catch(error) { analysis=null;pipeline.sunlight.intensity=0;pipeline.markShadowDirty();$('altitude').textContent='—';$('azimuth').textContent='—';failure(error.message); }
    finally { publish(); }
  }
  function changePlacement() {
    const proposal={regionId:$('region-id').value,canopyId:$('canopy-id').value};
    try {
      const check=inspectLayout(proposal);
      if(!check.validation.valid)throw new Error(`${proposal.regionId}不能占用通道或实体净距范围`);
      selection=check.scene.selection;
      $('layout-message').classList.remove('error');
      $('layout-message').textContent=`区域 ${selection.regionId} / 棚 ${selection.canopyId} · 布置合法`;
      refresh();
    } catch(error) {
      $('region-id').value=selection.regionId;$('canopy-id').value=selection.canopyId;
      $('layout-message').classList.add('error');$('layout-message').textContent=`已拒绝 ${error.message}；保留原布置。`;
      publish();
    }
  }
  function setView(name) { invalidatePerformance();invalidateVerification();rig.view(name,model.scene); $('view-status').textContent={overview:'庭院整体',facade:'B1立面近景',paving:'铺装近景',canopy:'TD004棚体近景',top:'北上俯视'}[name]; publish(); }
  for(const [id,name] of [['reset-view','overview'],['top-view','top'],['facade-view','facade'],['paving-view','paving'],['canopy-view','canopy']]) $(id).addEventListener('click',()=>setView(name));
  for(const id of ['region-id','canopy-id']) $(id).addEventListener('change',changePlacement);
  for(const id of ['date','time']) $(id).addEventListener('change',refresh);
  $('height-ground').addEventListener('click',()=>{referenceHeight=0;drawAnalysis();});
  $('height-person').addEventListener('click',()=>{referenceHeight=1.5;drawAnalysis();});
  $('show-samples').addEventListener('change',drawAnalysis);
  $('expand-view').addEventListener('click',()=>{invalidatePerformance();document.body.classList.toggle('scene-expanded');$('expand-view').textContent=document.body.classList.contains('scene-expanded')?'恢复面板':'放大场景';});
  $('tone-mapping').addEventListener('change',()=>{renderer.toneMapping=$('tone-mapping').value==='aces'?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;});
  const device = () => {
    const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,logicalCores:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,visibility:document.visibilityState,documentHasFocus:document.hasFocus(),screenWidth:screen.width,screenHeight:screen.height,
      gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
      cssWidth:viewport.clientWidth,cssHeight:viewport.clientHeight,dpr:renderer.getPixelRatio(),drawingBuffer:renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()};
  };
  function diagnostics() { return {version:'batch1a-v1',view:rig.mode,selection,analysisRuns,metrics:analysis?.status==='valid'?{ground:analysis.ground.rate,elevated:analysis.elevated.rate}:null,
    device:device(),sun:analysis?{direction:analysis.sun.direction.toArray(),lightToSun:pipeline.sunlight.position.clone().sub(pipeline.frame.center).normalize().toArray(),propagation:pipeline.sunlight.target.position.clone().sub(pipeline.sunlight.position).normalize().toArray()}:null,camera:{position:rig.camera.position.toArray(),target:rig.controls.target.toArray(),aspect:rig.camera.aspect},frame:pipeline.lastFrame,resources:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length},
    staticGroupId:model.staticGroup.uuid,bindings:bindingRows,proxyCheck,performance:performanceResult,
    loading:{proceduralTextureMs,firstRenderReturnedMs,navigation:performance.getEntriesByType('navigation').map(entry=>({duration:entry.duration,domContentLoaded:entry.domContentLoadedEventEnd})),resources:performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).origin===location.origin).map(entry=>({name:new URL(entry.name).pathname,duration:entry.duration,transferSize:entry.transferSize,decodedBodySize:entry.decodedBodySize}))}}; }
  function publish() {$('render-diagnostics').textContent=JSON.stringify(diagnostics(),null,2);}
  $('proxy-check').addEventListener('click',()=>{
    const runs=analysisRuns;
    if(analysis?.status!=='valid'){proxyCheck={status:'NOT_RUN',reason:'requires-valid-sun'};$('proxy-result').textContent='NOT RUN · 请选太阳高度至少5°的有效时刻';publish();return;}
    try{
      proxyCheck=verifyProxyRendering(pipeline,rig.camera,model.bindings);
      proxyCheck.context={selection:{...selection},instant:analysis.instant,view:rig.mode,camera:rig.camera.position.toArray()};
      const boxes=[...model.bindings.values()].map(binding=>({id:binding.entityId,box:new THREE.Box3().setFromObject(binding.proxy)}));
      const samples=[...analysis.ground.samples,...analysis.elevated.samples];
      const mismatches=[];
      for(const sample of samples){const hit=castSunRay(sample.point,analysis.sun.direction,boxes);if(hit.status!==sample.status||hit.blockerId!==sample.blockerId)mismatches.push(sample.id);}
      const casters=[];world.traverse(object=>{if((object.isMesh||object.isLine||object.isPoints)&&object.castShadow)casters.push(object);});
      const casterCount=casters.length;
      proxyCheck.transformedProxyRays={compared:samples.length,matching:samples.length-mismatches.length,mismatches};
      proxyCheck.casterCount=casterCount;
      proxyCheck.casterIds=casters.map(object=>object.userData.entityId??object.name);
      proxyCheck.analysisUnchanged=analysisRuns===runs;
      if(mismatches.length||casterCount!==7||casters.some(object=>object.userData.role!=='shadow-proxy'))proxyCheck.status='FAIL';
      $('proxy-result').textContent=`阴影代理 ${proxyCheck.status} · 主通道差异${proxyCheck.mainDifference.changedPixels}像素 / 投影差异${proxyCheck.shadowDifference.changedPixels}像素 · 几何射线${samples.length-mismatches.length}/${samples.length}`;
    }catch(error){proxyCheck={status:'FAIL',message:error.message};$('proxy-result').textContent=`FAIL · ${error.message}`;}
    publish();
  });
  $('measure-performance').addEventListener('click',()=>{measuring={start:latestTimestamp,last:latestTimestamp,frames:[],calls:[],triangles:[],cpu:[],visible:document.visibilityState==='visible',focused:document.hasFocus()};$('performance-result').textContent='采样中：请保持当前视角5秒…';});
  const sortedQuantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
  new ResizeObserver(()=>{renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);rig.resize(viewport.clientWidth,viewport.clientHeight);}).observe(viewport);
  renderer.setSize(viewport.clientWidth,viewport.clientHeight,false);rig.resize(viewport.clientWidth,viewport.clientHeight);
  $('region-id').value=selection.regionId;$('canopy-id').value=selection.canopyId;
  changePlacement();
  $('court-loading').hidden=true;
  $('runtime-status').textContent='建筑样板已就绪 · 程序化PBR / 七实体分析';
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('runtime-status').textContent='WebGL上下文丢失，请刷新';});
  renderer.setAnimationLoop(timestamp=>{
    latestTimestamp=timestamp;rig.update();const frame=pipeline.render(rig.camera);
    if(firstRenderReturnedMs===null)firstRenderReturnedMs=performance.now();
    if(measuring){
      if(timestamp>measuring.last){measuring.frames.push(timestamp-measuring.last);measuring.calls.push(frame.calls);measuring.triangles.push(frame.triangles);measuring.cpu.push(frame.renderCpuMs);}
      measuring.last=timestamp;
      measuring.visible = measuring.visible && document.visibilityState==='visible';
      measuring.focused = measuring.focused && document.hasFocus();
      if(timestamp-measuring.start>=5000){const elapsed=timestamp-measuring.start;performanceResult={measuredAt:new Date().toISOString(),durationMs:elapsed,frames:measuring.frames.length,fps:measuring.frames.length*1000/elapsed,p50Ms:sortedQuantile(measuring.frames,.5),p95Ms:sortedQuantile(measuring.frames,.95),cpuSubmitP50Ms:sortedQuantile(measuring.cpu,.5),cpuSubmitP95Ms:sortedQuantile(measuring.cpu,.95),rafStallsOver250Ms:measuring.frames.filter(value=>value>250).length,drawCalls:sortedQuantile(measuring.calls,.5),triangles:sortedQuantile(measuring.triangles,.5),view:rig.mode,visibleThroughout:measuring.visible,focusedThroughout:measuring.focused,device:device(),analysisRuns};measuring=null;$('performance-result').textContent=`实测 ${performanceResult.fps.toFixed(1)} FPS · ${performanceResult.drawCalls} draw calls · ${performanceResult.triangles} triangles`;publish();}
    }
  });
  setTimeout(publish,1000);
  window.addEventListener('pagehide',event=>{if(event.persisted)return;rig.dispose();model.dispose();sunArrow.dispose();markers.dispose();markers.geometry.dispose();markers.material.dispose();reference.geometry.dispose();reference.material.dispose();evidenceRay.geometry.dispose();evidenceRay.material.dispose();materials.dispose();pipeline.dispose();});
}

try{start();}catch(error){$('runtime-status').textContent=`初始化失败：${error.message}`;$('court-loading').textContent=error.message;console.error(error);}
