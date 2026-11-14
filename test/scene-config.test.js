import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_CONFIG as config, getPosition, validateSelection } from '../src/domain/scene-config.js';

test('P1 configuration freezes the documented courtyard, buildings and corridor', () => {
  assert.deepEqual(config.courtyard.min, [-12, 0, -9]);
  assert.deepEqual(config.courtyard.max, [12, 0, 9]);
  assert.deepEqual(config.buildings.map(({ id, min, max }) => ({ id, min, max })), [
    { id: 'B1', min: [-12, 0, -9], max: [-8, 6, 9] },
    { id: 'B2', min: [2, 0, 6], max: [10, 4, 9] },
  ]);
  assert.deepEqual(config.corridor.min, [-1, 0, -9]);
  assert.deepEqual(config.corridor.max, [1, 0, 6]);
  assert.equal(config.unit, 'm');
  assert.equal(config.target.width, 2);
  assert.equal(config.target.depth, 2);
});

test('P1 six region IDs and four canopy IDs have the exact frozen coordinates', () => {
  assert.deepEqual(config.positions.map(({ id, x, z }) => [id, x, z]), [
    ['R1', -5, -2], ['R2', 0, -2], ['R3', 5, -2],
    ['R4', -5, 3], ['R5', 0, 3], ['R6', 5, 3],
  ]);
  assert.deepEqual(config.canopyPositionIds.map(id => { const { x, z } = getPosition(id); return [id, x, z]; }), [
    ['R1', -5, -2], ['R3', 5, -2], ['R4', -5, 3], ['R6', 5, 3],
  ]);
});

test('P1 only declared IDs can form a selection; coordinates and extra fields are rejected', () => {
  assert.deepEqual(validateSelection({ regionId: 'R1', canopyId: 'R6' }), { regionId: 'R1', canopyId: 'R6' });
  for (const value of [null, [], {}, { regionId: 'R1' }, { regionId: 'R1', canopyId: 'R1', x: -5 }, { x: -5, z: -2 }]) {
    assert.throws(() => validateSelection(value), TypeError);
  }
  for (const id of ['R7', '__proto__', 1, { x: -5, z: -2 }]) assert.throws(() => getPosition(id), RangeError);
  assert.throws(() => validateSelection({ regionId: 'R7', canopyId: 'R1' }), RangeError);
  for (const canopyId of ['R2', 'R5']) assert.throws(() => validateSelection({ regionId: 'R1', canopyId }), RangeError);
});

test('P1 configuration cannot be mutated and entity IDs are globally unique', () => {
  assert.throws(() => { config.positions[0].x = 100; }, TypeError);
  assert.throws(() => { config.canopy.posts[0].x = 100; }, TypeError);
  const ids = [config.courtyard.id, ...config.buildings.map(item => item.id), config.corridor.id,
    config.target.id, config.canopy.id, config.canopy.roof.id, ...config.canopy.posts.map(item => item.id),
    ...config.positions.map(item => item.id)];
  assert.equal(new Set(ids).size, ids.length);
});
