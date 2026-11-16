import * as THREE from 'three';
import { SCENE_CONFIG } from './domain/scene-config.js';
import { inspectLayout } from './domain/layout.js';
import { analyzePeriod } from './domain/period.js';
import { renderPeriodPanel } from './view/period-panel.js';
import { enumerateCandidates, comparePeriods, comparisonKey, normalizeConstraints } from './domain/candidates.js';
import { renderCandidatePanel } from './view/candidate-panel.js';
import { pointEvidence } from './domain/point-evidence.js';
import { createPointEvidenceView } from './view/point-evidence.js';
import { createDecisionSession } from './domain/decision-session.js';
import { DEG } from './core/sun.js';
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
  const readPeriodInput=()=>({date:$('date').value,startTime:$('start-time').value,endTime:$('end-time').value,intervalMinutes:Number($('sample-interval').value)});
  const session=createDecisionSession({selection,period:readPeriodInput(),height:referenceHeight,constraints:readConstraints()});
  const textureStart = performance.now();
  const materials = createVisualMaterials();
  const proceduralTextureMs = performance.now() - textureStart;
  const viewport = $('court-viewport');
  const pipeline = createRenderPipeline(viewport, initial, materials);
  const { renderer, world } = pipeline;
  const model = createVisualScene(initial, materials);
  world.add(model.group);
  const dualEvidenceView=createPointEvidenceView();world.add(dualEvidenceView.group);
  for(let point=0;point<100;point++)$('evidence-point').add(new Option(`P${point+1}`,String(point)));
  const rig = createCameraRig(renderer.domElement, initial);
  const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }), 100);
  markers.frustumCulled = false;
  markers.renderOrder = 5;
  world.add(markers);
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(initial.target.size[0], initial.target.size[2]), new THREE.MeshBasicMaterial({ color: 0x52959c, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  reference.rotation.x = -Math.PI / 2;
  world.add(reference);
  const activeRegionGeometry=new THREE.BufferGeometry();
  activeRegionGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));
  const activeRegion=new THREE.LineLoop(activeRegionGeometry,new THREE.LineBasicMaterial({color:0x3f897f,depthWrite:false}));
  activeRegion.frustumCulled=false;world.add(activeRegion);
  const evidenceRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x26879c, depthTest: false }));
  evidenceRay.renderOrder = 6;
  world.add(evidenceRay);
  const sunArrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0.12,initial.courtyard.min[2]+2.2),3.2,0xc49542,0.35,0.18);
  sunArrow.visible=false;world.add(sunArrow);
  let analysis, periodAnalysis=null, selectedSampleIndex=0, periodDurationMs=0, analysisRuns = 0, bindingRows = [];
  let comparison=null, preview=null, shown='A', candidateDurationMs=null;
  let selectedEvidence=null,comparisonRequest=null;
  let proxyCheck = null, performanceResult = null, measuring = null;
  let latestTimestamp = 0, firstRenderReturnedMs = null;
  function invalidatePerformance() { performanceResult=null;measuring=null;$('performance-result').textContent='当前视角尚未测量帧率'; }
  function invalidateVerification() {proxyCheck=null;$('proxy-result').textContent='当前布局、时刻或视角尚未执行WebGL对照';}
  function clearComparison(){comparison=null;comparisonRequest=null;preview=null;shown='A';candidateDurationMs=null;renderCandidatePanel(null,null,referenceHeight);}
  const visiblePeriod=()=>shown==='B'&&preview?preview.result:periodAnalysis;
  function clearPointEvidence(){session.observe();selectedEvidence=null;dualEvidenceView.update(null);$('evidence-point').value='';$('dual-evidence-status').textContent='上下文已变化，请重新选择有效采样点。';$('ground-evidence').textContent=$('elevated-evidence').textContent='—';}

  function failure(message) {
    for (const id of ['rate','ground-rate','raised-rate']) $(id).textContent = 'N/A';
    $('sample-count').textContent = '当前条件不提供正常采样指标';
    $('analysis-state').textContent = message;
    $('evidence').textContent = '没有可用的遮挡证据。';
    markers.visible = reference.visible = evidenceRay.visible = sunArrow.visible = false;
  }
  function drawAnalysis() {
    const displayed=visiblePeriod();
    renderPeriodPanel(displayed,referenceHeight,selectedSampleIndex,preview?(shown==='A'?preview.result:periodAnalysis):null);
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
  function showSelectedSample() {
    clearPointEvidence();
    invalidatePerformance();invalidateVerification();
    analysis=visiblePeriod()?.samples[selectedSampleIndex]?.analysis??null;
    const displayedSelection=visiblePeriod()?.selection??selection;
    $('view-layout-status').textContent=`${shown==='B'?'B 预览，未应用':'A 已确认'} · 区域${displayedSelection.regionId} / 棚${displayedSelection.canopyId}`;
    $('evidence-point').disabled=analysis?.status!=='valid';
    if(!analysis){drawAnalysis();failure('没有可用的采样时刻');publish();return;}
    const modelUpdate=model.update(analysis.scene);bindingRows=modelUpdate.bindings;
    const bounds=analysis.scene.target.footprint;
    const corners=[[bounds.minX,.012,bounds.minZ],[bounds.maxX,.012,bounds.minZ],[bounds.maxX,.012,bounds.maxZ],[bounds.minX,.012,bounds.maxZ]];
    corners.forEach((point,index)=>activeRegionGeometry.attributes.position.setXYZ(index,...point));
    activeRegionGeometry.attributes.position.needsUpdate=true;activeRegion.material.color.setHex(shown==='B'?0xbe8b38:0x3f897f);
    if(modelUpdate.moved)pipeline.markShadowDirty();
    pipeline.applySun(analysis.sun);sunArrow.setDirection(analysis.sun.direction);
    $('altitude').textContent=`${(analysis.sun.altitude/DEG).toFixed(1)}°`;
    $('azimuth').textContent=`${((analysis.sun.azimuth/DEG+540)%360).toFixed(1)}°`;
    $('geometry-status').textContent=`${bindingRows.length}个分析实体 · 视觉与投影绑定已校验`;
    drawAnalysis();
    if(analysis.status!=='valid')failure(analysis.status==='below-horizon'?'太阳位于地平线以下，当前时刻N/A。':analysis.status==='low-altitude'?'太阳高度低于5°，当前时刻N/A。':'布局或采样原点无效。');
    publish();
  }
  function refresh() {
    clearComparison();
    invalidatePerformance();
    invalidateVerification();
    try {
      const previousClock=$('time').value;
      const started=performance.now();
      session.update({selection,period:readPeriodInput(),height:referenceHeight,constraints:readConstraints()});
      periodAnalysis=analyzePeriod(selection,session.snapshot().period);
      session.acceptAnalysis(periodAnalysis);
      periodDurationMs=performance.now()-started;
      selectedSampleIndex=Math.max(0,periodAnalysis.samples.findIndex(sample=>sample.clock===previousClock));
      analysisRuns++;
      showSelectedSample();
    } catch(error) { session.invalidate();clearPointEvidence();$('evidence-point').disabled=true;analysis=null;periodAnalysis=null;renderPeriodPanel(null,referenceHeight,0);model.update(inspectLayout(selection).scene);pipeline.sunlight.intensity=0;pipeline.markShadowDirty();$('altitude').textContent='—';$('azimuth').textContent='—';failure(error.message); }
    finally { publish(); }
  }
  function changePlacement() {
    const proposal={regionId:$('region-id').value,canopyId:$('canopy-id').value};
    try {
      const check=inspectLayout(proposal);
      if(!check.validation.valid)throw new Error(`${proposal.regionId}不能占用通道或实体净距范围`);
      session.update({selection:check.scene.selection});selection=session.snapshot().selection;
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
  for(const id of ['date','start-time','end-time','sample-interval']) $(id).addEventListener('change',refresh);
  $('time').addEventListener('change',()=>{selectedSampleIndex=visiblePeriod().samples.findIndex(sample=>sample.clock===$('time').value);showSelectedSample();});
  $('sample-times').addEventListener('click',event=>{const button=event.target.closest('button[data-sample-index]');if(button){selectedSampleIndex=Number(button.dataset.sampleIndex);showSelectedSample();}});
  function changeHeight(height){referenceHeight=height;session.update({height});if(periodAnalysis)session.acceptAnalysis(periodAnalysis);clearComparison();showSelectedSample();}
  $('height-ground').addEventListener('click',()=>changeHeight(0));
  $('height-person').addEventListener('click',()=>changeHeight(1.5));
  function readConstraints(){const mode=$('movement-mode').value;const text=$('minimum-target').value;if(!['region','canopy','both'].includes(mode)||!text.trim())throw new RangeError('请选择已支持的移动权限并输入0–100%的最低目标');return normalizeConstraints({regionMovable:mode!=='canopy',canopyMovable:mode!=='region',minimumShade:Number(text)/100});}
  function updateComparisonPanel(){renderCandidatePanel(comparison,preview,referenceHeight,shown,candidateDurationMs);}
  for(const id of ['movement-mode','minimum-target'])$(id).addEventListener('change',()=>{clearComparison();try{session.update({constraints:readConstraints()});if(periodAnalysis)session.acceptAnalysis(periodAnalysis);showSelectedSample();}catch(error){session.invalidate();showSelectedSample();$('candidate-status').textContent=error.message;publish();}});
  $('compare-candidates').addEventListener('click',()=>{
    try{if(!periodAnalysis)throw new Error('先修正时段输入');session.update({constraints:readConstraints()});if(!session.snapshot().analysisId)session.acceptAnalysis(periodAnalysis);comparisonRequest=session.beginRequest('candidates');const started=performance.now();const computed=enumerateCandidates(selection,periodAnalysis.period,referenceHeight,session.snapshot().constraints);const registered=session.registerCandidates(comparisonRequest,computed);comparison={...computed,candidates:registered};candidateDurationMs=performance.now()-started;preview=null;shown='A';updateComparisonPanel();showSelectedSample();publish();}
    catch(error){clearComparison();$('candidate-status').textContent=error.message;publish();}
  });
  $('candidate-rows').addEventListener('click',event=>{
    const button=event.target.closest('button[data-candidate-id]');if(!button)return;
    try{if(!comparison||comparison.key!==comparisonKey(periodAnalysis,referenceHeight))throw new Error('旧候选条件已过期');preview=session.resolveCandidate(button.dataset.candidateId);comparePeriods(periodAnalysis,preview.result,referenceHeight);shown='B';updateComparisonPanel();showSelectedSample();}
    catch(error){clearComparison();$('candidate-status').textContent=error.message;showSelectedSample();}
  });
  for(const mode of ['A','B'])$('show-'+mode.toLowerCase()).addEventListener('click',()=>{if(preview){shown=mode;updateComparisonPanel();showSelectedSample();}});
  $('reject-candidate').addEventListener('click',()=>{preview=null;shown='A';updateComparisonPanel();showSelectedSample();});
  $('apply-candidate').addEventListener('click',()=>{
    try{if(!preview||!comparison||comparison.key!==comparisonKey(periodAnalysis,referenceHeight))throw new Error('预览已过期');session.update({constraints:readConstraints()});periodAnalysis=session.applyCandidate(preview.candidateId);analysisRuns++;selection=session.snapshot().selection;$('region-id').value=selection.regionId;$('canopy-id').value=selection.canopyId;$('layout-message').classList.remove('error');$('layout-message').textContent=`区域 ${selection.regionId} / 棚 ${selection.canopyId} · 用户确认后已应用`;clearComparison();showSelectedSample();}
    catch(error){clearComparison();$('candidate-status').textContent=error.message;showSelectedSample();}
  });
  $('show-samples').addEventListener('change',drawAnalysis);
  $('evidence-point').addEventListener('change',()=>{
    try{const value=$('evidence-point').value;clearPointEvidence();if(value===''){publish();return;}$('evidence-point').value=value;selectedEvidence=pointEvidence(visiblePeriod(),selectedSampleIndex,Number(value),session.context());dualEvidenceView.update(selectedEvidence);$('dual-evidence-status').textContent=`P${selectedEvidence.pointNumber} · ${visiblePeriod().samples[selectedSampleIndex].clock} · 当前${shown}布局`;
      const describe=record=>`${record.status==='blocked'?`最近命中 ${record.blockerId}，交点(${record.hit.map(value=>value.toFixed(2)).join(', ')})m`:'未命中实体，模型内直射'}。证据 ${record.evidenceId}`;
      $('ground-evidence').textContent=describe(selectedEvidence.ground);$('elevated-evidence').textContent=describe(selectedEvidence.elevated);publish();
    }catch(error){clearPointEvidence();$('dual-evidence-status').textContent=error.message;publish();}
  });
  $('expand-view').addEventListener('click',()=>{invalidatePerformance();document.body.classList.toggle('scene-expanded');$('expand-view').textContent=document.body.classList.contains('scene-expanded')?'恢复面板':'放大场景';});
  $('tone-mapping').addEventListener('change',()=>{renderer.toneMapping=$('tone-mapping').value==='aces'?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;});
  const device = () => {
    const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,logicalCores:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,visibility:document.visibilityState,documentHasFocus:document.hasFocus(),screenWidth:screen.width,screenHeight:screen.height,
      gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
      cssWidth:viewport.clientWidth,cssHeight:viewport.clientHeight,dpr:renderer.getPixelRatio(),drawingBuffer:renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()};
  };
  function diagnostics() { return {version:'batch1b-v1',view:rig.mode,selection,state:session.snapshot(),evidenceContext:session.context(),selectedEvidence,shownSelection:analysis?.scene.selection??null,shown,analysisRuns,periodDurationMs,candidateDurationMs,comparison:comparison?{status:comparison.status,height:comparison.height,key:comparison.key,request:comparisonRequest,examined:comparison.examined,rejected:comparison.rejected.length,candidates:comparison.candidates.map(item=>({id:item.id,candidateId:item.candidateId,selection:item.selection,minimum:item.metrics.minimum,average:item.metrics.average,movedCount:item.movedCount,qualified:item.qualified})),previewId:preview?.candidateId??null}:null,period:periodAnalysis?{status:periodAnalysis.status,settings:periodAnalysis.period,selectedSampleIndex,ground:periodAnalysis.ground,elevated:periodAnalysis.elevated,samples:periodAnalysis.samples.map(sample=>({timestamp:sample.timestamp,clock:sample.clock,status:sample.status,ground:sample.analysis.ground?.rate??null,elevated:sample.analysis.elevated?.rate??null,groundValidCount:sample.groundValidCount,elevatedValidCount:sample.elevatedValidCount}))}:null,metrics:analysis?.status==='valid'?{ground:analysis.ground.rate,elevated:analysis.elevated.rate}:null,
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
  $('runtime-status').textContent='时段实验已就绪 · 含结束时刻 / 双高度100点';
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
  window.addEventListener('pagehide',event=>{if(event.persisted)return;rig.dispose();model.dispose();dualEvidenceView.dispose();activeRegionGeometry.dispose();activeRegion.material.dispose();sunArrow.dispose();markers.dispose();markers.geometry.dispose();markers.material.dispose();reference.geometry.dispose();reference.material.dispose();evidenceRay.geometry.dispose();evidenceRay.material.dispose();materials.dispose();pipeline.dispose();});
}

try{start();}catch(error){$('runtime-status').textContent=`初始化失败：${error.message}`;$('court-loading').textContent=error.message;console.error(error);}
