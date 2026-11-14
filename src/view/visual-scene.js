import * as THREE from 'three';
import { createShadowBinding, assertVisualBindings } from './shadow-proxies.js';
import { createB1Facade } from './building-visuals.js';
import { createPaving } from './ground-visuals.js';
import { buildBoxParts } from './box-parts.js';
import { createCanopySurface } from './canopy-visuals.js';

export function createVisualScene(scene, materials) {
  const group = new THREE.Group();
  const staticGroup = new THREE.Group();
  const canopyGroup = new THREE.Group();
  const guides = new THREE.Group();
  group.add(staticGroup, canopyGroup, guides);
  const bindings = new Map();
  const ownedGeometries = new Set();
  let currentScene = scene;
  for (const entity of scene.occluders) {
    const binding = createShadowBinding(entity);
    const visual = entity.id === 'B1' ? createB1Facade(entity, materials)
      : entity.type === 'roof' || entity.type === 'post' ? createCanopySurface(entity, materials)
      : buildBoxParts([{min:entity.min,max:entity.max,material:'plaster'}], materials, entity.id);
    visual.traverse(object => { if (object.geometry) ownedGeometries.add(object.geometry); });
    binding.visual.add(visual);
    bindings.set(entity.id, binding);
    (entity.type === 'building' ? staticGroup : canopyGroup).add(binding.proxy, binding.visual);
  }
  const paving = createPaving(scene, materials);
  staticGroup.add(paving.group);
  const guideMaterial = new THREE.LineDashedMaterial({ color: 0x758d81, transparent: true, opacity: 0.55, dashSize: 0.15, gapSize: 0.13, depthWrite: false });
  function updateGuides(snapshot) {
    while (guides.children.length) {
      const child = guides.children[0];
      child.geometry.dispose();
      guides.remove(child);
    }
    for (const candidate of [...snapshot.regionCandidates, ...snapshot.canopyCandidates.filter(item => item.positionId !== snapshot.selection.canopyId)]) {
      const { minX, maxX, minZ, maxZ } = candidate.footprint;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(minX, 0.015, minZ), new THREE.Vector3(maxX, 0.015, minZ), new THREE.Vector3(maxX, 0.015, maxZ), new THREE.Vector3(minX, 0.015, maxZ), new THREE.Vector3(minX, 0.015, minZ)]);
      const line = new THREE.Line(geometry, guideMaterial);
      line.userData.role = 'guide';
      line.computeLineDistances();
      guides.add(line);
    }
  }
  updateGuides(scene);
  return {
    group, staticGroup, canopyGroup, guides, bindings,
    get scene() { return currentScene; },
    update(snapshot) {
      const moved = snapshot.selection.canopyId !== currentScene.selection.canopyId;
      if (moved) for (const entity of snapshot.occluders.filter(item => item.type !== 'building')) {
        const binding = bindings.get(entity.id);
        const old = currentScene.occluders.find(item => item.id === entity.id);
        const delta = new THREE.Vector3(...entity.center).sub(new THREE.Vector3(...old.center));
        binding.proxy.position.add(delta);
        binding.visual.position.add(delta);
        binding.analysisBox = entity.box;
      }
      if (snapshot.selection.regionId !== currentScene.selection.regionId || moved) updateGuides(snapshot);
      currentScene = snapshot;
      group.updateMatrixWorld(true);
      return { moved, bindings: assertVisualBindings(bindings, snapshot) };
    },
    validate() { group.updateMatrixWorld(true); return assertVisualBindings(bindings, currentScene); },
    dispose() {
      for (const binding of bindings.values()) binding.dispose();
      for (const geometry of ownedGeometries) geometry.dispose();
      paving.dispose();
      for (const child of guides.children) child.geometry.dispose();
      guideMaterial.dispose();
    },
  };
}
