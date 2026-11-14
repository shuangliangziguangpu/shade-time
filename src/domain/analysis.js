import { Vector3 } from 'three';
import { getSunPosition } from '../core/sun.js';
import { castSunRay } from '../core/geometry.js';
import { SCENE_CONFIG } from './scene-config.js';
import { inspectLayout } from './layout.js';

function analyzeReference(scene, sun, height) {
  const grid = SCENE_CONFIG.sampleGridSize;
  const { center, size } = scene.target;
  const samples = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const point = new Vector3(center[0] + ((i + 0.5) / grid - 0.5) * size[0], height,
        center[2] + ((j + 0.5) / grid - 0.5) * size[2]);
      const hit = castSunRay(point, sun.direction, scene.occluders);
      samples.push({ id: `${height === 0 ? 'G' : 'H'}${samples.length + 1}`, point, ...hit });
    }
  }
  if (samples.some(sample => sample.status === 'invalid-origin')) return { status: 'invalid-origin', height, rate: null, samples };
  const shadedCount = samples.filter(sample => sample.status === 'blocked').length;
  const witnesses = {};
  for (const sample of samples) if (sample.status === 'blocked') witnesses[sample.blockerId] = (witnesses[sample.blockerId] ?? 0) + 1;
  return { status: 'valid', height, rate: shadedCount / (grid * grid), shadedCount, total: grid * grid, witnesses, samples };
}

// Reconstruct geometry from IDs and recompute the actual sun; no caller-provided percentages or boxes.
export function analyzeCourtyard(selection, instant) {
  const { scene, validation } = inspectLayout(selection);
  const sun = getSunPosition(instant);
  const base = { scene, validation, sun, instant: instant.toISOString() };
  if (!validation.valid) return { ...base, status: 'invalid-layout', ground: null, elevated: null };
  if (sun.status !== 'valid') return { ...base, status: sun.status, ground: null, elevated: null };
  const [ground, elevated] = SCENE_CONFIG.target.referenceHeights.map(height => analyzeReference(scene, sun, height));
  if (ground.status !== 'valid' || elevated.status !== 'valid') {
    return { ...base, status: 'invalid-origin', ground: null, elevated: null };
  }
  return { ...base, status: 'valid', ground, elevated };
}
