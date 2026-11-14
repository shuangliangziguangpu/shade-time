import { VISUAL_CONFIG } from './visual-config.js';
import { buildBoxParts } from './box-parts.js';

export function createB1Facade(entity, materials) {
  const [xmin, ymin, zmin] = entity.min;
  const [front, top, zmax] = entity.max;
  const height = top - ymin, length = zmax - zmin;
  const bayWidth = length / VISUAL_CONFIG.facadeBays;
  const storey = height / VISUAL_CONFIG.facadeStoreys;
  const parts = [];
  const box = (material, x0, x1, y0, y1, z0, z1) => parts.push({ material, min: [x0, y0, z0], max: [x1, y1, z1] });
  box('concrete', xmin, front - 0.18, ymin, top, zmin, zmax); // opaque backing, never a through opening
  box('concrete', front - 0.18, front, ymin, ymin + 0.24, zmin, zmax);
  box('sill', front - 0.18, front - 0.005, top - 0.16, top, zmin, zmax);
  box('concrete', front - 0.18, front - 0.015, ymin + storey - 0.12, ymin + storey + 0.045, zmin, zmax);
  for (let level = 0; level < VISUAL_CONFIG.facadeStoreys; level++) {
    for (let bay = 0; bay < VISUAL_CONFIG.facadeBays; bay++) {
      const start = zmin + bay * bayWidth, end = start + bayWidth;
      const bottom = ymin + level * storey;
      const door = level === 0 && bay === 2;
      const openingBottom = door ? ymin + 0.10 : bottom + 0.86;
      const openingTop = door ? bottom + 2.55 : bottom + 2.42;
      const width = door ? 1.82 : 2.12;
      const center = (start + end) / 2;
      const left = center - width / 2, right = center + width / 2;
      box('plaster', front - 0.18, front - 0.065, bottom, bottom + storey, start, left);
      box('plaster', front - 0.18, front - 0.065, bottom, bottom + storey, right, end);
      if (openingBottom > bottom) box('plaster', front - 0.18, front - 0.065, bottom, openingBottom, left, right);
      box('plaster', front - 0.18, front - 0.065, openingTop, bottom + storey, left, right);
      // Recessed reveal, opaque reflective glass, real extruded jambs and mullions.
      box('frame', front - 0.175, front - 0.105, openingBottom, openingTop, left, right);
      box('glass', front - 0.112, front - 0.087, openingBottom + 0.06, openingTop - 0.06, left + 0.06, right - 0.06);
      box('frame', front - 0.105, front - 0.025, openingBottom, openingTop, left, left + 0.065);
      box('frame', front - 0.105, front - 0.025, openingBottom, openingTop, right - 0.065, right);
      for (const y of [openingBottom, openingTop - 0.065]) box('frame', front - 0.105, front - 0.025, y, y + 0.065, left, right);
      const divisions = door ? 2 : 3;
      for (let index = 1; index < divisions; index++) {
        const z = left + width * index / divisions;
        box('frame', front - 0.11, front - 0.022, openingBottom, openingTop, z - 0.023, z + 0.023);
      }
      if (!door) {
        const y = openingBottom + (openingTop - openingBottom) * 0.7;
        box('frame', front - 0.11, front - 0.024, y, y + 0.035, left, right);
        box('sill', front - 0.18, front - 0.002, openingBottom - 0.055, openingBottom + 0.008, left - 0.045, right + 0.045);
      } else {
        for (const z of [center - 0.12, center + 0.12]) box('sill', front - 0.04, front - 0.006, 1.02, 1.48, z - 0.018, z + 0.018);
      }
    }
  }
  const group = buildBoxParts(parts, materials, entity.id);
  group.userData = { ...group.userData, bays: VISUAL_CONFIG.facadeBays, storeys: VISUAL_CONFIG.facadeStoreys, openingModel: 'opaque-backed', physicalEnvelope: { min: entity.min, max: entity.max } };
  return group;
}
