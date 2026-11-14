import * as THREE from 'three';
import { positionSunLight } from './lighting.js';
import { courtyardLightingFrame } from './courtyard-model.js';
import { VISUAL_CONFIG, daylightAppearance } from './visual-config.js';

export function createRenderPipeline(viewport, sceneState, materialLibrary) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, VISUAL_CONFIG.maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = VISUAL_CONFIG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-label', '建筑可视化样板：固定庭院、B1立面及TD004遮阳棚');
  viewport.appendChild(renderer.domElement);
  materialLibrary.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const world = new THREE.Scene();
  world.background = new THREE.Color(0xd7e2e6);
  const frame = courtyardLightingFrame(sceneState);
  const ambient = new THREE.HemisphereLight(0xe5edf4, 0xb8ad94, 0.5);
  const sunlight = new THREE.DirectionalLight(0xffecd5, 2.5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(VISUAL_CONFIG.shadowSize, VISUAL_CONFIG.shadowSize);
  sunlight.shadow.bias = VISUAL_CONFIG.shadowBias;
  sunlight.shadow.normalBias = VISUAL_CONFIG.normalBias;
  Object.assign(sunlight.shadow.camera, { left: -frame.extent, right: frame.extent, top: frame.extent, bottom: -frame.extent, near: frame.near, far: frame.far });
  sunlight.shadow.camera.updateProjectionMatrix();
  world.add(ambient, sunlight, sunlight.target);

  // Azimuth-invariant sky/ground gradient: no baked sun disk or second directional source.
  const width = 128, height = 64;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = y / (height - 1);
    const sky = Math.max(0, Math.min(1, (v - 0.42) * 6));
    const t = Math.max(0, (v - 0.6) / 0.4);
    const color = new THREE.Color().setRGB(0.22, 0.21, 0.18).lerp(new THREE.Color().setRGB(0.70 - t * 0.23, 0.79 - t * 0.13, 0.91), sky);
    data.set([color.r, color.g, color.b, 1], (y * width + x) * 4);
  }
  const environmentInput = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  environmentInput.colorSpace = THREE.LinearSRGBColorSpace;
  environmentInput.mapping = THREE.EquirectangularReflectionMapping;
  environmentInput.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(environmentInput);
  world.environment = environmentTarget.texture;
  pmrem.dispose();
  environmentInput.dispose();
  let lastFrame = { calls: 0, triangles: 0, lines: 0, points: 0, shadowUpdated: false };
  const night = new THREE.Color(0x151e2c), day = new THREE.Color(0xd7e2e6);
  return {
    renderer, world, frame, sunlight,
    markShadowDirty() { renderer.shadowMap.needsUpdate = true; },
    applySun(sun) {
      const appearance = daylightAppearance(sun.altitude);
      positionSunLight(sunlight, sun.direction, frame.center, frame.distance);
      sunlight.intensity = appearance.sun;
      sunlight.color.setRGB(...appearance.sunColor);
      ambient.intensity = appearance.hemisphere;
      materialLibrary.setEnvironmentIntensity(appearance.environment);
      world.background.copy(night).lerp(day, Math.min(1, Math.sqrt(Math.max(0, Math.sin(sun.altitude))) * 1.4));
      renderer.shadowMap.needsUpdate = true;
    },
    render(camera) {
      const dirty = renderer.shadowMap.needsUpdate;
      renderer.info.reset();
      renderer.render(world, camera);
      lastFrame = { ...renderer.info.render, shadowUpdated: dirty };
      return lastFrame;
    },
    get lastFrame() { return lastFrame; },
    dispose() { environmentTarget.dispose(); renderer.dispose(); },
  };
}

export function verifyProxyRendering(pipeline, camera, bindings) {
  const { renderer, world } = pipeline;
  const target = new THREE.WebGLRenderTarget(320, 240);
  const originalTarget = renderer.getRenderTarget();
  const originalShadow = renderer.shadowMap.enabled;
  const originalBackground = world.background;
  const pixels = () => {
    const array = new Uint8Array(320 * 240 * 4);
    renderer.info.reset();
    renderer.setRenderTarget(target);
    renderer.state.buffers.color.setMask(true);
    renderer.state.buffers.depth.setMask(true);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(world, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 320, 240, array);
    return { array, calls: renderer.info.render.calls };
  };
  const difference = (a, b) => { let changed = 0, total = 0; for (let i = 0; i < a.length; i += 4) {
    const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (delta > 3) changed++;
    total += delta;
  } return { changedPixels: changed, summedRgbDifference: total }; };
  try {
    // Keep the shader's shadow variant enabled throughout. Toggle casters, not renderer capabilities.
    renderer.shadowMap.enabled = true;
    for (const binding of bindings.values()) { binding.proxy.visible = true; binding.proxy.castShadow = false; }
    const hiddenMain = pixels();
    for (const binding of bindings.values()) binding.proxy.visible = false;
    const absentMain = pixels();
    const mainDifference = difference(hiddenMain.array, absentMain.array);
    for (const binding of bindings.values()) { binding.proxy.visible = true; binding.proxy.castShadow = true; }
    renderer.shadowMap.needsUpdate = true;
    const casting = pixels();
    for (const binding of bindings.values()) binding.proxy.castShadow = false;
    renderer.shadowMap.needsUpdate = true;
    const notCasting = pixels();
    const shadowDifference = difference(casting.array, notCasting.array);
    return { status: mainDifference.changedPixels === 0 && shadowDifference.changedPixels > 50 ? 'PASS' : 'FAIL',
      mainDifference, shadowDifference, proxyCount: bindings.size,
      callsWithShadow: casting.calls, callsWithoutShadow: notCasting.calls };
  } finally {
    for (const binding of bindings.values()) { binding.proxy.visible = true; binding.proxy.castShadow = true; }
    renderer.shadowMap.enabled = originalShadow;
    renderer.shadowMap.needsUpdate = true;
    world.background = originalBackground;
    renderer.setRenderTarget(originalTarget);
    target.dispose();
  }
}
