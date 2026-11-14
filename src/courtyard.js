import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { SCENE_CONFIG } from './domain/scene-config.js';
import { createCourtyardScene } from './domain/scene.js';
import { inspectLayout } from './domain/layout.js';
import { analyzeCourtyard } from './domain/analysis.js';
import { parseShanghaiDateTime, DEG } from './core/sun.js';
import { positionSunLight } from './view/lighting.js';
import { createCourtyardModel, courtyardLightingFrame, disposeModel } from './view/courtyard-model.js';

const $ = id => document.getElementById(id);
let selection = { regionId: 'R3', canopyId: 'R3' };
let referenceHeight = 1.5;

function labelSprite(text, kind = 'region') {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = '600 48px "Microsoft YaHei", sans-serif';
  canvas.width = Math.max(130, Math.ceil(context.measureText(text).width + 44));
  canvas.height = 88;
  context.fillStyle = kind === 'invalid' || kind === 'corridor' ? 'rgba(250,239,228,0.92)' : 'rgba(247,250,240,0.92)';
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, 84, 16);
  context.fill();
  context.font = '600 48px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = kind === 'invalid' || kind === 'corridor' ? '#9a624b' : '#365b4d';
  context.fillText(text, canvas.width / 2, 45);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  sprite.scale.set(canvas.width / 88, 1, 1);
  sprite.renderOrder = 8;
  return sprite;
}

function describeFailure(violation) {
  if (violation.kind === 'boundary') return '必须位于庭院内并保留1厘米边界净距';
  if (violation.obstacleId === 'CORRIDOR') return '不能占用通道或进入其1厘米净距范围';
  if (violation.obstacleId.startsWith('C_POST')) return '与实际棚柱相交或净距不足1厘米';
  return `与${violation.obstacleId}相交或净距不足1厘米`;
}

function start() {
  for (const position of SCENE_CONFIG.positions) {
    const legal = inspectLayout({ regionId: position.id, canopyId: selection.canopyId }).validation.valid;
    $('region-id').add(new Option(`${position.id}${legal ? '' : ' · 通道禁放'}`, position.id));
  }
  for (const id of SCENE_CONFIG.canopyPositionIds) $('canopy-id').add(new Option(id, id));
  $('region-id').value = selection.regionId;
  $('canopy-id').value = selection.canopyId;

  const viewport = $('court-viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xe8ede4);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '24乘18米庭院、B1和B2、一个遮阳棚、六个区域及禁放通道');
  viewport.appendChild(renderer.domElement);
  $('court-loading').hidden = true;
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 250);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  const initialScene = createCourtyardScene(selection);
  const frame = courtyardLightingFrame(initialScene);
  controls.minDistance = frame.radius * 0.5;
  controls.maxDistance = frame.radius * 8;

  function resetCamera(top = false) {
    const halfAngle = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    const distance = frame.radius / Math.sin(halfAngle) * 1.1;
    const direction = top ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1.05, 1.2, -1.25).normalize();
    controls.target.copy(frame.center);
    camera.position.copy(frame.center).addScaledVector(direction, distance);
    controls.update();
  }
  $('reset-view').addEventListener('click', () => resetCamera());
  $('top-view').addEventListener('click', () => resetCamera(true));
  // Set a valid camera before the first WebGL frame, not only in ResizeObserver.
  renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  resetCamera();

  const ambient = new THREE.HemisphereLight(0xf6f7eb, 0x8b9b84, 1.65);
  world.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffefd0, 2.2);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.bias = -0.0001;
  sunlight.shadow.normalBias = 0.012;
  Object.assign(sunlight.shadow.camera, { left: -frame.extent, right: frame.extent, top: frame.extent, bottom: -frame.extent, near: frame.near, far: frame.far });
  sunlight.shadow.camera.updateProjectionMatrix();
  world.add(sunlight, sunlight.target);
  const sunOrigin = new THREE.Vector3(initialScene.courtyard.center[0], 0.2, initialScene.courtyard.min[2] + 2.4);
  const sunArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), sunOrigin, frame.radius * 0.25, 0xbf8c35, 0.45, 0.24);
  world.add(sunArrow);
  const compass = new THREE.Group();
  const { min, max, center } = initialScene.courtyard;
  for (const [text, x, z] of [['北 N', center[0], min[2] - 0.85], ['南 S', center[0], max[2] + 0.85], ['东 E', max[0] + 2.2, center[2]], ['西 W', min[0] - 2.2, center[2]]]) {
    const sprite = labelSprite(text);
    sprite.position.set(x, 0.2, z);
    compass.add(sprite);
  }
  world.add(compass);

  const sampleMaterial = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), sampleMaterial, 100);
  markers.frustumCulled = false;
  markers.renderOrder = 6;
  world.add(markers);
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(initialScene.target.size[0], initialScene.target.size[2]),
    new THREE.MeshBasicMaterial({ color: 0x549aa1, opacity: 0.10, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  reference.rotation.x = -Math.PI / 2;
  world.add(reference);
  const evidenceRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x258ca0, depthTest: false, depthWrite: false }));
  evidenceRay.renderOrder = 7;
  world.add(evidenceRay);
  let model;
  let modelSelection;
  let analysis = null;

  function updateModel(scene) {
    const signature = `${scene.selection.regionId}/${scene.selection.canopyId}`;
    reference.position.set(scene.target.center[0], referenceHeight + 0.008, scene.target.center[2]);
    if (signature === modelSelection) return;
    if (model) { world.remove(model.group); disposeModel(model.group); }
    model = createCourtyardModel(scene);
    for (const label of model.labels) {
      const sprite = labelSprite(label.text, label.kind);
      sprite.position.fromArray(label.position);
      model.group.add(sprite);
    }
    const same = scene.occluders.length === model.solids.size && scene.occluders.every(entity => {
      const mesh = model.solids.get(entity.id);
      return mesh && mesh.position.toArray().every((value, axis) => value === entity.center[axis]) &&
        [mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth].every((value, axis) => value === entity.size[axis]);
    });
    if (!same) throw new Error('计算与显示几何不一致');
    $('geometry-status').textContent = `${model.solids.size}个遮挡实体 · 显示尺寸与计算一致`;
    world.add(model.group);
    modelSelection = signature;
  }

  function unavailable(message) {
    for (const id of ['rate', 'ground-rate', 'raised-rate']) $(id).textContent = 'N/A';
    $('sample-count').textContent = '当前条件不提供正常采样指标';
    $('evidence').textContent = '没有可用的遮挡证据。';
    $('analysis-state').textContent = message;
    markers.visible = false;
    evidenceRay.visible = false;
  }

  function drawAnalysis() {
    $('height-ground').setAttribute('aria-pressed', String(referenceHeight === 0));
    $('height-person').setAttribute('aria-pressed', String(referenceHeight === 1.5));
    reference.position.y = referenceHeight + 0.008;
    if (!analysis || analysis.status !== 'valid') return;
    const result = referenceHeight === 0 ? analysis.ground : analysis.elevated;
    const percent = value => `${(value * 100).toFixed(0)}%`;
    $('rate').textContent = percent(result.rate);
    $('sample-count').textContent = `${result.shadedCount} / ${result.total} 个网格中心被遮挡`;
    $('ground-rate').textContent = percent(analysis.ground.rate);
    $('raised-rate').textContent = percent(analysis.elevated.rate);
    $('analysis-state').textContent = '';
    markers.visible = $('show-samples').checked;
    const transform = new THREE.Matrix4();
    const shaded = new THREE.Color(0x318aa0);
    const direct = new THREE.Color(0xd09a36);
    result.samples.forEach((sample, index) => {
      transform.makeTranslation(sample.point.x, sample.point.y + 0.025, sample.point.z);
      markers.setMatrixAt(index, transform);
      markers.setColorAt(index, sample.status === 'blocked' ? shaded : direct);
    });
    markers.instanceMatrix.needsUpdate = true;
    markers.instanceColor.needsUpdate = true;
    const witness = result.samples[55];
    evidenceRay.geometry.dispose();
    evidenceRay.geometry = new THREE.BufferGeometry().setFromPoints([witness.point, witness.hit ?? witness.point.clone().addScaledVector(analysis.sun.direction, frame.radius * 0.45)]);
    evidenceRay.visible = true;
    const coordinate = witness.point.toArray().map(value => value.toFixed(2)).join(', ');
    $('evidence').textContent = witness.status === 'blocked'
      ? `${witness.id} · (${coordinate})m → 最近命中 ${witness.blockerId}。蓝线为当前遮挡见证。`
      : `${witness.id} · (${coordinate})m → 未命中遮挡实体，模型内直射。蓝线指向太阳。`;
  }

  function refresh() {
    try {
      analysis = analyzeCourtyard(selection, parseShanghaiDateTime($('date').value, $('time').value));
      updateModel(analysis.scene);
      const { sun } = analysis;
      $('altitude').textContent = `${(sun.altitude / DEG).toFixed(1)}°`;
      $('azimuth').textContent = `${((sun.azimuth / DEG + 180 + 360) % 360).toFixed(1)}°`;
      positionSunLight(sunlight, sun.direction, frame.center, frame.distance);
      sunlight.intensity = sun.altitude > 0 ? 2.2 : 0;
      ambient.intensity = sun.altitude > 0 ? 1.65 : 0.55;
      sunArrow.visible = sun.altitude > 0;
      sunArrow.setDirection(sun.direction);
      if (analysis.status !== 'valid') {
        unavailable(analysis.status === 'below-horizon' ? '太阳位于地平线以下，指标N/A。'
          : analysis.status === 'low-altitude' ? '太阳高度低于5°，超出正常分析范围，指标N/A。' : '布局或采样原点无效，未计算正常比例。');
      } else drawAnalysis();
    } catch (error) {
      analysis = null;
      updateModel(createCourtyardScene(selection));
      sunlight.intensity = 0;
      sunArrow.visible = false;
      $('altitude').textContent = '—';
      $('azimuth').textContent = '—';
      unavailable(error.message);
    }
  }

  function changePlacement() {
    const proposal = { regionId: $('region-id').value, canopyId: $('canopy-id').value };
    try {
      const { scene, validation } = inspectLayout(proposal);
      if (!validation.valid) throw new Error(`${proposal.regionId}：${describeFailure(validation.violations[0])}`);
      selection = scene.selection;
      $('layout-message').classList.remove('error');
      $('layout-message').textContent = `区域 ${selection.regionId} / 棚 ${selection.canopyId} · 布置合法`;
      refresh();
    } catch (error) {
      $('region-id').value = selection.regionId;
      $('canopy-id').value = selection.canopyId;
      $('layout-message').classList.add('error');
      $('layout-message').textContent = `已拒绝 ${error.message}；保留原布置。`;
    }
  }
  for (const id of ['region-id', 'canopy-id']) $(id).addEventListener('change', changePlacement);
  for (const id of ['date', 'time']) $(id).addEventListener('change', refresh);
  $('height-ground').addEventListener('click', () => { referenceHeight = 0; drawAnalysis(); });
  $('height-person').addEventListener('click', () => { referenceHeight = 1.5; drawAnalysis(); });
  $('show-samples').addEventListener('change', drawAnalysis);
  let firstSize = true;
  new ResizeObserver(() => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (firstSize) { firstSize = false; resetCamera(); }
  }).observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    $('runtime-status').textContent = 'WebGL上下文丢失，请刷新页面重试';
  });
  changePlacement();
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(world, camera); });
  $('runtime-status').textContent = '庭院已就绪 · 单时刻100点真实计算';
}

try { start(); } catch (error) {
  $('runtime-status').textContent = `初始化失败：${error.message}`;
  $('court-loading').hidden = false;
  $('court-loading').textContent = '庭院初始化失败，请检查浏览器WebGL支持。';
}
