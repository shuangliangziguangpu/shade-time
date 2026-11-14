import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createCourtyardScene } from '../src/domain/scene.js';
import { SCENE_CONFIG } from '../src/domain/scene-config.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const sceneAt = canopyId => createCourtyardScene({ regionId: 'R1', canopyId });

test('P1 scene contains exactly seven finite positive-volume analytical solids with stable unique IDs', () => {
  const expected = ['B1', 'B2', 'C_ROOF', 'C_POST_NW', 'C_POST_SW', 'C_POST_NE', 'C_POST_SE'];
  for (const id of SCENE_CONFIG.canopyPositionIds) {
    const scene = sceneAt(id);
    assert.deepEqual(scene.occluders.map(item => item.id), expected);
    for (const item of scene.occluders) {
      assert.deepEqual(item.box.min.toArray(), item.min);
      assert.deepEqual(item.box.max.toArray(), item.max);
      assert.ok(item.box.getSize(new Vector3()).toArray().every(value => Number.isFinite(value) && value > 0));
      assert.deepEqual(item.box.getCenter(new Vector3()).toArray(), item.center);
    }
    assert.equal(scene.regionCandidates.length, 6);
    assert.equal(scene.canopyCandidates.length, 4);
  }
});

test('P1 TD004 roof and four posts meet exactly at 2.4m at every approved canopy center', () => {
  for (const canopyId of SCENE_CONFIG.canopyPositionIds) {
    const { canopy } = sceneAt(canopyId);
    const position = SCENE_CONFIG.positions.find(item => item.id === canopyId);
    assert.deepEqual(canopy.roof.min, [position.x - 1.5, 2.4, position.z - 1.5]);
    assert.deepEqual(canopy.roof.max, [position.x + 1.5, 2.5, position.z + 1.5]);
    assert.equal(canopy.posts.length, 4);
    for (let i = 0; i < 4; i++) {
      const post = canopy.posts[i];
      const offset = SCENE_CONFIG.canopy.posts[i];
      near(post.center[0], position.x + offset.x);
      near(post.center[2], position.z + offset.z);
      near(post.size[0], 0.1);
      near(post.size[2], 0.1);
      assert.equal(post.min[1], 0);
      assert.equal(post.max[1], canopy.roof.min[1]);
      near(offset.x < 0 ? post.min[0] : post.max[0], offset.x < 0 ? canopy.roof.min[0] : canopy.roof.max[0]);
      near(offset.z < 0 ? post.min[2] : post.max[2], offset.z < 0 ? canopy.roof.min[2] : canopy.roof.max[2]);
    }
  }
});

test('P1 generated target, candidate surfaces and corridor share the frozen descriptors', () => {
  const scene = createCourtyardScene({ regionId: 'R6', canopyId: 'R4' });
  assert.deepEqual(scene.target.center, [5, 0, 3]);
  assert.deepEqual(scene.target.size, [2, 0, 2]);
  assert.deepEqual(scene.target.footprint, { minX: 4, maxX: 6, minZ: 2, maxZ: 4 });
  assert.deepEqual(scene.courtyard.size, [24, 0, 18]);
  assert.deepEqual(scene.corridor.footprint, { minX: -1, maxX: 1, minZ: -9, maxZ: 6 });
  const candidate = scene.regionCandidates.find(item => item.positionId === 'R6');
  assert.deepEqual(candidate.min, scene.target.min);
  assert.deepEqual(candidate.max, scene.target.max);
  const canopyPreview = scene.canopyCandidates.find(item => item.positionId === 'R4');
  assert.deepEqual(canopyPreview.roof.min, scene.canopy.roof.min);
  assert.deepEqual(canopyPreview.posts.map(item => item.min), scene.canopy.posts.map(item => item.min));
});

test('P1 render-only surfaces and preview structures are never analytical occluders', () => {
  const scene = sceneAt('R1');
  const excludedIds = [scene.courtyard.id, scene.target.id, scene.corridor.id,
    ...scene.regionCandidates.map(item => item.id),
    ...scene.canopyCandidates.flatMap(item => [item.roof.id, ...item.posts.map(post => post.id)])];
  assert.ok(scene.occluders.every(item => !excludedIds.includes(item.id)));
  assert.ok(scene.occluders.every(item => ['building', 'roof', 'post'].includes(item.type)));
});

test('P1 scene creation rejects unknown IDs and state snapshots cannot mutate other layouts', () => {
  assert.throws(() => createCourtyardScene({ regionId: 'R1', canopyId: 'R2' }), RangeError);
  assert.throws(() => createCourtyardScene({ regionId: 'R1', canopyId: 'R1', center: [0, 0] }), TypeError);
  const first = sceneAt('R1');
  assert.throws(() => { first.occluders[2].box.min.x = 100; }, TypeError);
  const second = sceneAt('R6');
  assert.notDeepEqual(first.canopy.roof.min, second.canopy.roof.min);
  assert.deepEqual(sceneAt('R1').canopy.roof.min, first.canopy.roof.min);
});
