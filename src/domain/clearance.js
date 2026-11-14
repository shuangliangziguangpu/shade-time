import { SCENE_CONFIG } from './scene-config.js';

function checkRectangle(rectangle) {
  if (!rectangle || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(rectangle[key])) ||
      rectangle.minX >= rectangle.maxX || rectangle.minZ >= rectangle.maxZ) {
    throw new TypeError('占地必须是正面积、有限坐标的XZ矩形');
  }
}

// Geometric primitive only. Business selection entry points accept IDs, never rectangles.
export function rectangleDistance(a, b) {
  checkRectangle(a);
  checkRectangle(b);
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  return Math.hypot(dx, dz);
}

export function boundaryDistance(inner, outer) {
  checkRectangle(inner);
  checkRectangle(outer);
  return Math.min(inner.minX - outer.minX, outer.maxX - inner.maxX,
    inner.minZ - outer.minZ, outer.maxZ - inner.maxZ);
}

function comparison(distance, rectangles) {
  // A few coordinate-scale ULPs absorb decimal subtraction roundoff at exactly 0.010m.
  // This is not a geometric buffer and does not reuse the ray's 1e-4m offset.
  const scale = Math.max(1, ...rectangles.flatMap(rect => ['minX', 'maxX', 'minZ', 'maxZ'].map(key => Math.abs(rect[key]))));
  const roundoff = 8 * Number.EPSILON * scale;
  return { distance, required: SCENE_CONFIG.minimumClearance, valid: distance >= SCENE_CONFIG.minimumClearance - roundoff };
}

export function assessSeparation(a, b) {
  return comparison(rectangleDistance(a, b), [a, b]);
}

export function assessBoundary(inner, outer) {
  return comparison(boundaryDistance(inner, outer), [inner, outer]);
}
