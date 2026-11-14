import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { courtyardLightingFrame } from './courtyard-model.js';

export function createCameraRig(element, scene) {
  const camera = new THREE.PerspectiveCamera(43, 1, 0.04, 220);
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;
  controls.minDistance = 0.65;
  controls.maxDistance = 100;
  const frame = courtyardLightingFrame(scene);
  const blockers = scene.buildings.map(item => new THREE.Box3(new THREE.Vector3(...item.min), new THREE.Vector3(...item.max)).expandByScalar(0.16));
  let mode = 'overview';
  function view(name, current = scene) {
    mode = name;
    camera.near = name === 'overview' || name === 'top' ? 0.3 : 0.06;
    camera.far = 160;
    camera.updateProjectionMatrix();
    const c = current.canopy.center;
    const t = current.target.center;
    let target, position;
    if (name === 'facade') { target = new THREE.Vector3(current.buildings[0].max[0], 2.8, -0.5); position = new THREE.Vector3(1.5, 3.4, -7.8); }
    else if (name === 'canopy') { target = new THREE.Vector3(c[0], 1.35, c[2]); position = target.clone().add(new THREE.Vector3(4.2, 2.2, -5)); }
    else if (name === 'paving') { target = new THREE.Vector3(t[0] - 0.3, 0, t[2]); position = target.clone().add(new THREE.Vector3(1.6, 1.5, -2)); }
    else {
      target = new THREE.Vector3(0, 1.7, 0);
      const half = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      const distance = frame.radius / Math.sin(half) * 1.02;
      const direction = name === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1.2, 1.05, -1.4).normalize();
      position = target.clone().addScaledVector(direction, distance);
    }
    controls.enableDamping = false;
    controls.target.copy(target);
    camera.position.copy(position);
    controls.update();
    controls.enableDamping = true;
  }
  return { camera, controls, view, get mode() { return mode; },
    resize(width, height) { camera.aspect = width / height; camera.updateProjectionMatrix(); if (mode === 'overview' || mode === 'top') view(mode); },
    update() {
      controls.update();
      for (const box of blockers) {
        const expanded = box;
        if (!expanded.containsPoint(camera.position)) continue;
        const candidates = [
          ['x', expanded.min.x, Math.abs(camera.position.x - expanded.min.x)], ['x', expanded.max.x, Math.abs(camera.position.x - expanded.max.x)],
          ['y', expanded.max.y, Math.abs(camera.position.y - expanded.max.y)],
          ['z', expanded.min.z, Math.abs(camera.position.z - expanded.min.z)], ['z', expanded.max.z, Math.abs(camera.position.z - expanded.max.z)],
        ].sort((a, b) => a[2] - b[2]);
        camera.position[candidates[0][0]] = candidates[0][1] + (candidates[0][1] === expanded.min[candidates[0][0]] ? -0.002 : 0.002);
      }
      camera.position.y = Math.max(camera.position.y, 0.16);
    },
    dispose() { controls.dispose(); },
  };
}
