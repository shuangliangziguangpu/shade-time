import * as THREE from 'three';
import { inspectLayout } from '../domain/layout.js';

const COLORS = { building: 0x779084, roof: 0xd8c48c, post: 0x8e7753 };

function footprintLine(descriptor, color, y = 0.018) {
  const { minX, maxX, minZ, maxZ } = descriptor.footprint;
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(minX, y, minZ), new THREE.Vector3(maxX, y, minZ),
    new THREE.Vector3(maxX, y, maxZ), new THREE.Vector3(minX, y, maxZ),
  ]), new THREE.LineBasicMaterial({ color }));
}

function footprintSurface(descriptor, color, opacity = 1, y = 0) {
  const geometry = new THREE.PlaneGeometry(descriptor.size[0], descriptor.size[2]);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(descriptor.center[0], y, descriptor.center[2]);
  mesh.userData = { entityId: descriptor.id, kind: 'display-surface' };
  return mesh;
}

// No business dimensions live here: every box and footprint comes from the canonical scene.
export function createCourtyardModel(scene) {
  const group = new THREE.Group();
  group.name = 'courtyard-model';
  const solids = new Map();
  const labels = [];
  const ground = footprintSurface(scene.courtyard, 0xe0e5d6);
  ground.receiveShadow = true;
  group.add(ground, footprintLine(scene.courtyard, 0x8da08b));
  const corridor = footprintSurface(scene.corridor, 0xd9c4ae, 0.65, 0.006);
  group.add(corridor, footprintLine(scene.corridor, 0xb79678));
  labels.push({ text: '通道 · 禁止占用', position: [scene.corridor.center[0], 0.2, scene.corridor.min[2] + 0.65], kind: 'corridor' });

  for (const entity of scene.occluders) {
    const geometry = new THREE.BoxGeometry(...entity.size);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: COLORS[entity.type], roughness: 0.8 }));
    mesh.position.fromArray(entity.center);
    mesh.name = entity.id;
    mesh.userData = { entityId: entity.id, kind: 'occluder', sourceType: entity.type };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    solids.set(entity.id, mesh);
    group.add(mesh);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: entity.type === 'building' ? 0x516d60 : 0x9b845d, transparent: true, opacity: 0.45 }));
    outline.position.copy(mesh.position);
    outline.userData = { kind: 'display-outline' };
    group.add(outline);
    if (entity.type === 'building') labels.push({ text: `${entity.id} · ${entity.size[1]}m`, position: [entity.center[0], entity.max[1] + 0.6, entity.center[2]], kind: 'building' });
  }

  for (const candidate of scene.regionCandidates) {
    const active = candidate.positionId === scene.selection.regionId;
    const valid = inspectLayout({ regionId: candidate.positionId, canopyId: scene.selection.canopyId }).validation.valid;
    const color = !valid ? 0xb46c5e : active ? 0x3d8e95 : 0x8aa994;
    const surface = footprintSurface(candidate, color, active ? 0.22 : 0.09, 0.01);
    const outline = footprintLine(candidate, color, 0.02);
    outline.userData = { kind: 'region-candidate', candidateId: candidate.positionId };
    group.add(surface, outline);
    labels.push({ text: `${candidate.positionId}${valid ? '' : ' ×'}`, position: [candidate.center[0], 0.3, candidate.max[2] + 0.35], kind: valid ? 'region' : 'invalid' });
  }

  for (const candidate of scene.canopyCandidates) {
    if (candidate.positionId === scene.selection.canopyId) continue;
    for (const part of [candidate.roof, ...candidate.posts]) {
      const box = new THREE.BoxGeometry(...part.size);
      const geometry = new THREE.EdgesGeometry(box);
      box.dispose();
      const wire = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({ color: 0x98a99d, transparent: true, opacity: 0.38, dashSize: 0.18, gapSize: 0.12 }));
      wire.computeLineDistances();
      wire.position.fromArray(part.center);
      wire.userData = { kind: 'canopy-preview', candidateId: candidate.positionId, entityId: part.id };
      group.add(wire);
    }
  }
  labels.push({ text: `当前棚 · ${scene.selection.canopyId}`, position: [scene.canopy.center[0], scene.canopy.max[1] + 0.6, scene.canopy.center[2]], kind: 'canopy' });
  return { group, solids, labels };
}

export function courtyardLightingFrame(scene) {
  const bounds = new THREE.Box3(new THREE.Vector3(...scene.courtyard.min), new THREE.Vector3(...scene.courtyard.max));
  for (const entity of scene.occluders) bounds.union(entity.box);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const distance = sphere.radius * 3;
  const extent = sphere.radius * 1.1;
  return { bounds, center: sphere.center, radius: sphere.radius, distance, extent,
    near: distance - extent, far: distance + extent };
}

export function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  for (const item of geometries) item.dispose();
  for (const item of textures) item.dispose();
  for (const item of materials) item.dispose();
}
