import * as THREE from 'three';
import { VISUAL_VERSION } from './visual-config.js';

export function createShadowBinding(entity) {
  const geometry = new THREE.BoxGeometry(...entity.size);
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, shadowSide: THREE.FrontSide });
  const proxy = new THREE.Mesh(geometry, material);
  proxy.name = `shadow:${entity.id}`;
  proxy.position.fromArray(entity.center);
  proxy.visible = true;
  proxy.castShadow = true;
  proxy.userData = { entityId: entity.id, role: 'shadow-proxy', geometryVersion: VISUAL_VERSION };
  return { entityId: entity.id, analysisBox: entity.box, proxy, visual: new THREE.Group(), geometryVersion: VISUAL_VERSION,
    dispose() { geometry.dispose(); material.dispose(); } };
}

export function assertVisualBindings(bindings, scene, tolerance = 1e-6) {
  if (bindings.size !== scene.occluders.length) throw new Error('Shadow binding count mismatch');
  const rows = [];
  for (const entity of scene.occluders) {
    const binding = bindings.get(entity.id);
    if (!binding || !binding.proxy.visible || !binding.proxy.castShadow || binding.proxy.material.colorWrite || binding.proxy.material.depthWrite) throw new Error(`Invalid proxy: ${entity.id}`);
    binding.proxy.updateMatrixWorld(true);
    binding.visual.updateMatrixWorld(true);
    const proxyBounds = new THREE.Box3().setFromObject(binding.proxy);
    const visualBounds = new THREE.Box3().setFromObject(binding.visual);
    const envelope = entity.box.clone().expandByScalar(tolerance);
    if (proxyBounds.min.distanceTo(entity.box.min) > tolerance || proxyBounds.max.distanceTo(entity.box.max) > tolerance ||
        visualBounds.isEmpty() || !envelope.containsBox(visualBounds)) throw new Error(`Visual envelope mismatch: ${entity.id}`);
    binding.visual.traverse(object => { if (object.castShadow) throw new Error(`Duplicate visual caster: ${entity.id}`); });
    rows.push({ entityId: entity.id, geometryVersion: binding.geometryVersion, proxyMin: proxyBounds.min.toArray(), proxyMax: proxyBounds.max.toArray(), visualMin: visualBounds.min.toArray(), visualMax: visualBounds.max.toArray() });
  }
  return rows;
}
