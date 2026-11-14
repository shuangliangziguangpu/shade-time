import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bake metre-based face UVs, then merge by material instead of retaining one mesh per detail.
export function buildBoxParts(parts, materials, entityId, uvOrigin = [0, 0, 0]) {
  const batches = new Map();
  for (const part of parts) {
    const size = part.max.map((value, axis) => value - part.min[axis]);
    if (!size.every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid visual box');
    const center = part.min.map((value, axis) => (value + part.max[axis]) / 2);
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...center);
    const positions = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv;
    const repeat = materials.get(part.material).userData.metresPerRepeat ?? 1;
    for (let index = 0; index < positions.count; index++) {
      const nx = Math.abs(normals.getX(index)), ny = Math.abs(normals.getY(index));
      const u = nx > 0.5 ? positions.getZ(index) - uvOrigin[2] : positions.getX(index) - uvOrigin[0];
      const v = ny > 0.5 ? positions.getZ(index) - uvOrigin[2] : positions.getY(index) - uvOrigin[1];
      uv.setXY(index, u / repeat, v / repeat);
    }
    if (!batches.has(part.material)) batches.set(part.material, []);
    batches.get(part.material).push(geometry);
  }
  const group = new THREE.Group();
  for (const [name, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    for (const item of geometries) item.dispose();
    const mesh = new THREE.Mesh(geometry, materials.get(name));
    mesh.receiveShadow = true;
    mesh.userData = { entityId, role: 'visual-surface', materialFamily: name };
    group.add(mesh);
  }
  group.userData = { entityId, role: 'visual-assembly', componentCount: parts.length };
  return group;
}
