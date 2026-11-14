import { Box3, Vector3 } from 'three';
import { SCENE_CONFIG, getPosition, validateSelection } from './scene-config.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function describe(id, type, min, max, positionId = null) {
  return {
    id, type, positionId, min: [...min], max: [...max],
    center: min.map((value, axis) => (value + max[axis]) / 2),
    size: min.map((value, axis) => max[axis] - value),
    footprint: { minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2] },
  };
}

function atPosition(id, type, position, width, depth, bottom, top, offsetX = 0, offsetZ = 0) {
  const x = position.x + offsetX;
  const z = position.z + offsetZ;
  return describe(id, type, [x - width / 2, bottom, z - depth / 2], [x + width / 2, top, z + depth / 2], position.id);
}

function canopyAt(position, prefix = '') {
  const { roof, post, posts } = SCENE_CONFIG.canopy;
  const structure = atPosition(`${prefix}CANOPY`, 'canopy', position, roof.width, roof.depth, post.bottom, roof.top);
  return {
    ...structure,
    roof: atPosition(`${prefix}${roof.id}`, 'roof', position, roof.width, roof.depth, roof.bottom, roof.top),
    posts: posts.map(item => atPosition(`${prefix}${item.id}`, 'post', position, post.width, post.depth, post.bottom, post.top, item.x, item.z)),
  };
}

// Geometry can describe an invalid proposal (e.g. R2); layout.js grants/rejects use.
// No coordinates or client-supplied geometry are accepted by this entry point.
export function createCourtyardScene(selection) {
  const verifiedSelection = validateSelection(selection);
  const config = SCENE_CONFIG;
  const courtyard = describe(config.courtyard.id, config.courtyard.type, config.courtyard.min, config.courtyard.max);
  const buildings = config.buildings.map(item => describe(item.id, item.type, item.min, item.max));
  const corridor = describe(config.corridor.id, config.corridor.type, config.corridor.min, config.corridor.max);
  const target = atPosition(config.target.id, config.target.type, getPosition(selection.regionId), config.target.width, config.target.depth, 0, 0);
  const canopy = canopyAt(getPosition(selection.canopyId));
  const regionCandidates = config.positions.map(position => atPosition(`REGION_${position.id}`, 'region-candidate', position, config.target.width, config.target.depth, 0, 0));
  const canopyCandidates = config.canopyPositionIds.map(id => canopyAt(getPosition(id), `PREVIEW_${id}_`));
  const solids = [...buildings, canopy.roof, ...canopy.posts];
  const occluders = solids.map(solid => ({
    ...solid,
    box: new Box3(new Vector3(...solid.min), new Vector3(...solid.max)),
  }));
  return freeze({
    version: config.version, selection: verifiedSelection,
    courtyard, buildings, corridor, target, canopy,
    regionCandidates, canopyCandidates, occluders,
  });
}
