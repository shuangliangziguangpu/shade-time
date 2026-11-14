import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { DEG, getSunPosition, parseShanghaiDateTime, sunDirection } from './core/sun.js';
import { probeOccluders, runReferenceProbe } from './probe/fixture.js';
import { positionSunLight } from './view/lighting.js';

const $ = id => document.getElementById(id);
let height = 0;

async function start() {
  const viewport = $('viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xe8ede4);
  renderer.domElement.setAttribute('aria-label', '独立盒G、参考面、100个采样点和太阳方向');
  viewport.appendChild(renderer.domElement);
  $('loading').hidden = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  function resetCamera() {
    camera.position.set(-5.7, 5.6, 7.5);
    controls.target.set(0.35, 0.7, 0);
    controls.update();
  }
  resetCamera();
  $('reset-view').addEventListener('click', resetCamera);
  scene.add(new THREE.HemisphereLight(0xf5f7ec, 0x84958b, 1.6));
  const light = new THREE.DirectionalLight(0xfff0d1, 2.2);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 30 });
  light.shadow.bias = -0.00015;
  light.shadow.normalBias = 0.015;
  scene.add(light, light.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), new THREE.MeshStandardMaterial({ color: 0xdbe3d4, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.012;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(7, 14, 0xc6d2c1, 0xd0dacb);
  grid.position.y = -0.008;
  scene.add(grid);
  // All occluding geometry is built from exactly the analytical fixture box.
  for (const { box } of probeOccluders()) {
    const size = box.getSize(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x6b8a7d, roughness: 0.8 }));
    mesh.position.copy(box.getCenter(new THREE.Vector3()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x426556, transparent: true, opacity: 0.4 }));
    edges.position.copy(mesh.position);
    scene.add(edges);
  }
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x6fa3aa, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  reference.rotation.x = -Math.PI / 2;
  reference.position.x = 0.05;
  scene.add(reference);
  const referenceOutline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.95, 0, -1), new THREE.Vector3(1.05, 0, -1),
    new THREE.Vector3(1.05, 0, 1), new THREE.Vector3(-0.95, 0, 1),
  ]), new THREE.LineBasicMaterial({ color: 0x649092 }));
  scene.add(referenceOutline);
  const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshBasicMaterial(), 100);
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  markers.frustumCulled = false;
  scene.add(markers);
  const sunArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(-2.1, 0.1, -1.7), 2.5, 0xc59137, 0.22, 0.12);
  scene.add(sunArrow);
  const evidenceLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x287f99 }));
  scene.add(evidenceLine);
  const eastArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-2.5, 0.02, 2.1), 0.7, 0x8b9d81, 0.1, 0.07);
  const northArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-2.5, 0.02, 2.1), 0.7, 0x8b9d81, 0.1, 0.07);
  scene.add(eastArrow, northArrow);

  function clearAnalysis(message) {
    for (const id of ['rate', 'ground-rate', 'raised-rate']) $(id).textContent = 'N/A';
    $('sample-count').textContent = '本条件不提供正常遮阴指标';
    $('evidence').textContent = '当前条件没有可用的分析证据。';
    $('analysis-state').textContent = message;
    markers.visible = false;
    evidenceLine.visible = false;
  }

  function update() {
    const fixture = $('mode').value === 'fixture';
    $('date-fields').hidden = fixture;
    $('height-ground').setAttribute('aria-pressed', String(height === 0));
    $('height-person').setAttribute('aria-pressed', String(height === 1.5));
    reference.position.y = height + 0.005;
    referenceOutline.position.y = height + 0.01;
    try {
      const sun = fixture
        ? { altitude: 45 * DEG, azimuth: -Math.PI / 2, direction: sunDirection(45 * DEG, -Math.PI / 2), status: 'valid' }
        : getSunPosition(parseShanghaiDateTime($('date').value, $('time').value));
      $('altitude').textContent = `${(sun.altitude / DEG).toFixed(1)}°`;
      $('azimuth').textContent = `${((sun.azimuth / DEG + 180 + 360) % 360).toFixed(1)}°`;
      positionSunLight(light, sun.direction);
      light.intensity = sun.status === 'valid' ? 2.2 : 0;
      sunArrow.visible = true;
      sunArrow.setDirection(sun.direction);
      if (sun.status !== 'valid') {
        clearAnalysis(sun.status === 'below-horizon' ? '太阳位于地平线以下，指标 N/A。' : '太阳高度低于5°，超出本项目正常分析范围。');
        return;
      }
      const groundResult = runReferenceProbe(0, sun.direction);
      const raisedResult = runReferenceProbe(1.5, sun.direction);
      const result = height === 0 ? groundResult : raisedResult;
      if (groundResult.status !== 'valid' || raisedResult.status !== 'valid') {
        clearAnalysis('采样点位于实体内部或表面，布局无效。');
        return;
      }
      const percent = rate => `${(rate * 100).toFixed(0)}%`;
      $('rate').textContent = percent(result.rate);
      $('ground-rate').textContent = percent(groundResult.rate);
      $('raised-rate').textContent = percent(raisedResult.rate);
      $('sample-count').textContent = `${Math.round(result.rate * 100)} / 100 个网格中心被遮挡`;
      $('analysis-state').textContent = fixture ? '人工基准已启用；预期地面100%、离地1.5米30%。' : '真实日期太阳方向；指标仅描述此采样时刻。';
      markers.visible = true;
      const transform = new THREE.Matrix4();
      const blockedColor = new THREE.Color(0x438ba0);
      const directColor = new THREE.Color(0xd7a146);
      result.samples.forEach((sample, index) => {
        transform.makeTranslation(sample.point.x, sample.point.y + 0.025, sample.point.z);
        markers.setMatrixAt(index, transform);
        markers.setColorAt(index, sample.status === 'blocked' ? blockedColor : directColor);
      });
      markers.instanceMatrix.needsUpdate = true;
      markers.instanceColor.needsUpdate = true;
      const witness = result.samples[55];
      const end = witness.hit ?? witness.point.clone().addScaledVector(sun.direction, 4);
      evidenceLine.geometry.dispose();
      evidenceLine.geometry = new THREE.BufferGeometry().setFromPoints([witness.point, end]);
      evidenceLine.visible = true;
      $('evidence').textContent = witness.status === 'blocked'
        ? `P56 · (${witness.point.x.toFixed(2)}, ${height.toFixed(1)}, ${witness.point.z.toFixed(2)}) → 最近命中 G。蓝线显示遮挡见证。`
        : `P56 · (${witness.point.x.toFixed(2)}, ${height.toFixed(1)}, ${witness.point.z.toFixed(2)}) → 未命中遮挡体，模型内直射。`;
    } catch (error) {
      $('altitude').textContent = '—';
      $('azimuth').textContent = '—';
      light.intensity = 0;
      sunArrow.visible = false;
      clearAnalysis(error.message);
    }
  }
  for (const id of ['mode', 'date', 'time']) $(id).addEventListener('change', update);
  $('height-ground').addEventListener('click', () => { height = 0; update(); });
  $('height-person').addEventListener('click', () => { height = 1.5; update(); });
  new ResizeObserver(() => {
    const width = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    renderer.setSize(width, viewportHeight, false);
    camera.aspect = width / viewportHeight;
    camera.updateProjectionMatrix();
  }).observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    $('browser-status').textContent = '浏览器：WebGL上下文丢失，请刷新页面重试';
  });
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  update();
  const regression = getSunPosition(new Date('2013-03-05T00:00:00Z'), { latitude: 50.5, longitude: 30.5 });
  if (THREE.REVISION !== '160' || Math.abs(regression.azimuth + 2.5003175907168385) > 1e-15 ||
      Math.abs(regression.altitude + 0.7000406838781611) > 1e-15) throw new Error('浏览器依赖版本或太阳回归校验失败');
  $('browser-status').textContent = '浏览器 PASS · WebGL / Three r160 / SunCalc 1.9.0 回归';
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('HTTP健康检查失败');
    const health = await response.json();
    $('server-status').textContent = health.status === 'ok' ? 'HTTP PASS · 本地资源已就绪' : 'HTTP FAIL';
    $('ai-status').textContent = health.ai.status === 'BLOCKED' ? 'AI BLOCKED · 待配置本机专用密钥' : 'AI 密钥已配置 · 联网实测见验收报告';
  } catch {
    $('server-status').textContent = 'HTTP FAIL · 无法读取本地健康状态';
  }
}

start().catch(error => {
  $('browser-status').textContent = `浏览器 FAIL · ${error.message}`;
  $('loading').hidden = false;
  $('loading').textContent = '三维初始化失败，请检查浏览器WebGL支持并刷新。';
});
