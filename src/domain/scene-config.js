function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Single source of business dimensions. Coordinates are metres, +X east/+Y up/+Z south.
export const SCENE_CONFIG = freeze({
  version: 'courtyard-v1',
  unit: 'm',
  courtyard: { id: 'COURTYARD', type: 'courtyard', min: [-12, 0, -9], max: [12, 0, 9] },
  buildings: [
    { id: 'B1', type: 'building', min: [-12, 0, -9], max: [-8, 6, 9] },
    { id: 'B2', type: 'building', min: [2, 0, 6], max: [10, 4, 9] },
  ],
  corridor: { id: 'CORRIDOR', type: 'corridor', min: [-1, 0, -9], max: [1, 0, 6] },
  target: { id: 'TARGET', type: 'target', width: 2, depth: 2, referenceHeights: [0, 1.5] },
  canopy: {
    id: 'CANOPY', type: 'canopy',
    roof: { id: 'C_ROOF', width: 3, depth: 3, bottom: 2.4, top: 2.5 },
    post: { width: 0.1, depth: 0.1, bottom: 0, top: 2.4 },
    posts: [
      { id: 'C_POST_NW', x: -1.45, z: -1.45 },
      { id: 'C_POST_SW', x: -1.45, z: 1.45 },
      { id: 'C_POST_NE', x: 1.45, z: -1.45 },
      { id: 'C_POST_SE', x: 1.45, z: 1.45 },
    ],
  },
  positions: [
    { id: 'R1', x: -5, z: -2 },
    { id: 'R2', x: 0, z: -2 },
    { id: 'R3', x: 5, z: -2 },
    { id: 'R4', x: -5, z: 3 },
    { id: 'R5', x: 0, z: 3 },
    { id: 'R6', x: 5, z: 3 },
  ],
  canopyPositionIds: ['R1', 'R3', 'R4', 'R6'],
  minimumClearance: 0.01,
  sampleGridSize: 10,
});

export function getPosition(id) {
  const position = SCENE_CONFIG.positions.find(position => position.id === id);
  if (typeof id !== 'string' || !position) throw new RangeError('未知位置ID');
  return position;
}

// Placement positions are shared IDs; entity IDs remain stable when moved.
export function validateSelection(selection) {
  if (!selection || Object.getPrototypeOf(selection) !== Object.prototype ||
      Reflect.ownKeys(selection).length !== 2 ||
      !Object.hasOwn(selection, 'regionId') || !Object.hasOwn(selection, 'canopyId')) {
    throw new TypeError('布置仅接受regionId和canopyId，不接受坐标或未知字段');
  }
  getPosition(selection.regionId);
  getPosition(selection.canopyId);
  if (!SCENE_CONFIG.canopyPositionIds.includes(selection.canopyId)) throw new RangeError('此ID不是已定义的棚候选位置');
  return Object.freeze({ regionId: selection.regionId, canopyId: selection.canopyId });
}
