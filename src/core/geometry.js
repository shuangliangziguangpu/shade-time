import { Box3, Ray, Vector3 } from 'three';

export const RAY_EPSILON = 1e-4;

function finiteVector(value) {
  return value instanceof Vector3 && [value.x, value.y, value.z].every(Number.isFinite);
}

// Occluders are explicit data. Render meshes and their materials never enter here.
export function castSunRay(point, direction, occluders) {
  if (!finiteVector(point) || !finiteVector(direction) || Math.abs(direction.lengthSq() - 1) > 1e-12) {
    throw new TypeError('射线需要有限坐标和单位方向向量');
  }
  if (!Array.isArray(occluders)) throw new TypeError('遮挡体必须为数组');
  const ids = new Set();
  for (const { id, box } of occluders) {
    if (typeof id !== 'string' || !id || ids.has(id) || !(box instanceof Box3) ||
        !finiteVector(box.min) || !finiteVector(box.max) ||
        box.min.x >= box.max.x || box.min.y >= box.max.y || box.min.z >= box.max.z) {
      throw new TypeError('遮挡体必须具有唯一ID和正体积有限Box3');
    }
    ids.add(id);
  }
  // Check ORIGINAL point first. Offsetting must not hide an invalid layout.
  for (const { id, box } of occluders) {
    if (box.containsPoint(point)) return { status: 'invalid-origin', blockerId: id };
  }
  const origin = point.clone().addScaledVector(direction, RAY_EPSILON);
  const ray = new Ray(origin, direction);
  let closest = null;
  for (const { id, box } of occluders) {
    const hit = ray.intersectBox(box, new Vector3());
    if (hit === null) continue;
    const distance = hit.clone().sub(origin).dot(direction);
    if (distance <= 0) continue;
    if (closest === null || distance < closest.distance) {
      closest = { status: 'blocked', blockerId: id, distance, hit: hit.clone() };
    }
  }
  return closest ?? { status: 'direct' };
}
