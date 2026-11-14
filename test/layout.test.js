import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLayout } from '../src/domain/layout.js';
import { rectangleDistance, assessSeparation, assessBoundary } from '../src/domain/clearance.js';
import { createCourtyardScene } from '../src/domain/scene.js';

const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

test('P1 R2 and R5 are rejected by real corridor geometry for every canopy position', () => {
  for (const regionId of ['R2', 'R5']) for (const canopyId of ['R1', 'R3', 'R4', 'R6']) {
    const { validation } = inspectLayout({ regionId, canopyId });
    assert.equal(validation.valid, false);
    assert.ok(validation.violations.some(item => item.subjectId === 'TARGET' && item.obstacleId === 'CORRIDOR' && item.distance === 0));
  }
});

test('P1 sixteen non-corridor ID pairs are legal including target under its own canopy', () => {
  for (const regionId of ['R1', 'R3', 'R4', 'R6']) for (const canopyId of ['R1', 'R3', 'R4', 'R6']) {
    const { scene, validation } = inspectLayout({ regionId, canopyId });
    assert.equal(validation.valid, true, `${regionId}/${canopyId}`);
    assert.ok(validation.checks.every(item => item.valid));
    assert.equal(validation.checks.some(item => item.subjectId === 'TARGET' && item.obstacleId === 'C_ROOF'), false);
    if (regionId === canopyId) {
      assert.equal(rectangleDistance(scene.target.footprint, scene.canopy.roof.footprint), 0);
      assert.ok(validation.checks.filter(item => item.obstacleId.startsWith('C_POST')).every(item => item.distance > 0.39));
    }
  }
});

test('P1 business entry rejects extra coordinates, forged geometry and unknown placement IDs', () => {
  for (const selection of [
    { regionId: 'R9', canopyId: 'R1' }, { regionId: 'R1', canopyId: 'R2' },
    { regionId: 'R1', canopyId: 'R1', occluders: [] },
    { regionId: 'R1', canopyId: 'R1', x: 0, z: 0 },
  ]) assert.throws(() => inspectLayout(selection));
});

test('P1 approved separation boundaries: 0 and 0.009 fail; 0.010 and 0.011 pass on both axes', () => {
  const base = rect(-1, 1, -1, 1);
  for (const [gap, expected] of [[0, false], [0.009, false], [0.010, true], [0.011, true]]) {
    assert.equal(assessSeparation(base, rect(1 + gap, 3 + gap, -1, 1)).valid, expected, `x ${gap}`);
    assert.equal(assessSeparation(base, rect(-1, 1, 1 + gap, 3 + gap)).valid, expected, `z ${gap}`);
    assert.equal(assessSeparation(base, rect(-3 - gap, -1 - gap, -1, 1)).valid, expected, `west ${gap}`);
  }
  assert.equal(assessSeparation(base, rect(1 + 0.01 - 1e-10, 3, -1, 1)).valid, false);
});

test('P1 clearance uses Euclidean diagonal distance rather than square inflation', () => {
  const a = rect(0, 1, 0, 1);
  const b = rect(1.008, 2, 1.008, 2);
  assert.ok(Math.abs(rectangleDistance(a, b) - Math.hypot(0.008, 0.008)) < 1e-14);
  assert.equal(assessSeparation(a, b).valid, true);
  assert.equal(assessSeparation(a, rect(1.006, 2, 1.006, 2)).valid, false);
});

test('P1 courtyard edges enforce clearance including exact 1cm on all four boundaries', () => {
  const outer = rect(-12, 12, -9, 9);
  for (const [gap, expected] of [[-0.01, false], [0, false], [0.009, false], [0.010, true], [0.011, true]]) {
    for (const inner of [rect(-12 + gap, -10 + gap, -1, 1), rect(10 - gap, 12 - gap, -1, 1),
      rect(-1, 1, -9 + gap, -7 + gap), rect(-1, 1, 7 - gap, 9 - gap)]) {
      assert.equal(assessBoundary(inner, outer).valid, expected, String(gap));
    }
  }
});

test('P1 real building, post and canopy-ground footprints detect contact and overlap', () => {
  const scene = createCourtyardScene({ regionId: 'R1', canopyId: 'R1' });
  const b1 = scene.buildings[0].footprint;
  assert.equal(assessSeparation(rect(-9, -7, -1, 1), b1).valid, false);
  assert.equal(assessSeparation(rect(-8, -6, -1, 1), b1).valid, false);
  assert.equal(assessSeparation(rect(-7.99, -5.99, -1, 1), b1).valid, true);
  const post = scene.canopy.posts[0].footprint;
  assert.equal(assessSeparation(rect(post.minX - 0.5, post.maxX + 0.5, post.minZ - 0.5, post.maxZ + 0.5), post).valid, false);
  assert.equal(assessSeparation(rect(post.maxX, post.maxX + 2, post.minZ, post.maxZ), post).valid, false);
  assert.equal(assessSeparation(rect(-1.5, 1.5, -3.5, -0.5), scene.corridor.footprint).valid, false);
});

test('P1 nonfinite, reversed or zero-area clearance fixtures fail closed', () => {
  const valid = rect(0, 1, 0, 1);
  for (const bad of [null, rect(NaN, 1, 0, 1), rect(2, 1, 0, 1), rect(0, 0, 0, 1), rect(0, Infinity, 0, 1)]) {
    assert.throws(() => assessSeparation(valid, bad), TypeError);
    assert.throws(() => assessBoundary(valid, bad), TypeError);
  }
});
