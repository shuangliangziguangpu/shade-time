import { Box3, Vector3 } from 'three';
import { castSunRay } from '../core/geometry.js';

// Independent phase-zero mathematical fixture, not the MVP courtyard.
export function probeOccluders() {
  return [{ id: 'G', box: new Box3(new Vector3(1, 0, -1), new Vector3(2, 2, 1)) }];
}

export function runReferenceProbe(height, direction) {
  if (height !== 0 && height !== 1.5) throw new RangeError('验证参考高度仅支持0或1.5米');
  const occluders = probeOccluders();
  const samples = [];
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      const point = new Vector3(0.05 + ((i + 0.5) / 10 - 0.5) * 2, height, ((j + 0.5) / 10 - 0.5) * 2);
      samples.push({ point, ...castSunRay(point, direction, occluders) });
    }
  }
  if (samples.some(sample => sample.status === 'invalid-origin')) {
    return { status: 'invalid-layout', rate: null, samples };
  }
  return { status: 'valid', rate: samples.filter(sample => sample.status === 'blocked').length / 100, samples };
}
