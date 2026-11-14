import { Vector3 } from 'three';

export function positionSunLight(light, direction, center = new Vector3(), distance = 12) {
  if (!Number.isFinite(distance) || distance <= 0 || Math.abs(direction.lengthSq() - 1) > 1e-12) {
    throw new RangeError('光源距离须为正数，太阳方向须为单位向量');
  }
  light.position.copy(center).addScaledVector(direction, distance);
  light.target.position.copy(center);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
}
