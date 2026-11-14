import { buildBoxParts } from './box-parts.js';

export function createCanopySurface(entity, materials) {
  const parts = [];
  const [x0, y0, z0] = entity.min, [x1, y1, z1] = entity.max;
  const add = (material, min, max) => parts.push({ material, min, max });
  if (entity.type === 'roof') {
    const edge = 0.045;
    // Continuous opaque coverage and inward edge folds stay inside the approved 3x3x0.1m box.
    add('roof', [x0 + edge, y0 + 0.012, z0 + edge], [x1 - edge, y1 - 0.008, z1 - edge]);
    add('frame', [x0, y0, z0], [x0 + edge, y1, z1]);
    add('frame', [x1 - edge, y0, z0], [x1, y1, z1]);
    add('frame', [x0 + edge, y0, z0], [x1 - edge, y1, z0 + edge]);
    add('frame', [x0 + edge, y0, z1 - edge], [x1 - edge, y1, z1]);
    for (let fraction = 1 / 3; fraction < 0.99; fraction += 1 / 3) {
      const x = x0 + (x1 - x0) * fraction;
      add('roof', [x - 0.004, y1 - 0.008, z0 + edge], [x + 0.004, y1, z1 - edge]);
    }
    for (const x of [x0, x1 - 0.14]) for (const z of [z0, z1 - 0.14]) {
      add('metal', [x, y0, z], [x + 0.14, y0 + 0.012, z + 0.14]);
    }
  } else if (entity.type === 'post') {
    // Butt-jointed finish bands keep the full 0.1m cross section at every height.
    add('frame', [x0, y0, z0], [x1, y0 + 0.018, z1]);
    add('metal', [x0, y0 + 0.018, z0], [x1, y1 - 0.05, z1]);
    add('frame', [x0, y1 - 0.05, z0], [x1, y1, z1]);
  } else throw new TypeError('Canopy surface requires roof or post');
  const group = buildBoxParts(parts, materials, entity.id, entity.min);
  group.userData.geometryContract = 'TD004';
  return group;
}
