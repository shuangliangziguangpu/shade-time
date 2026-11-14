import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { analyzeCourtyard } from '../src/domain/analysis.js';
import { parseShanghaiDateTime } from '../src/core/sun.js';
import { runReferenceProbe, probeOccluders } from '../src/probe/fixture.js';

const time = value => parseShanghaiDateTime('2026-06-21', value);
const choice = { regionId: 'R3', canopyId: 'R3' };

test('P1 business analysis computes independent 100-point center grids at 0m and 1.5m', () => {
  const result = analyzeCourtyard(choice, time('15:00'));
  assert.equal(result.status, 'valid');
  for (const reference of [result.ground, result.elevated]) {
    assert.equal(reference.samples.length, 100);
    assert.equal(reference.total, 100);
    assert.equal(new Set(reference.samples.map(sample => sample.id)).size, 100);
    assert.equal(reference.rate, reference.shadedCount / 100);
    assert.ok(reference.samples.every(sample => sample.point.y === reference.height));
    assert.ok(Math.abs(reference.samples[0].point.x - 4.1) < 1e-12);
    assert.ok(Math.abs(reference.samples[0].point.z + 2.9) < 1e-12);
    assert.ok(Math.abs(reference.samples.at(-1).point.x - 5.9) < 1e-12);
    assert.ok(Math.abs(reference.samples.at(-1).point.z + 1.1) < 1e-12);
    const ids = result.scene.occluders.map(item => item.id);
    assert.ok(reference.samples.every(sample => sample.status === 'direct' || ids.includes(sample.blockerId)));
    assert.equal(Object.values(reference.witnesses).reduce((sum, count) => sum + count, 0), reference.shadedCount);
  }
  assert.equal(result.ground.height, 0);
  assert.equal(result.elevated.height, 1.5);
  assert.notEqual(result.ground.samples[0].point, result.elevated.samples[0].point);
});

test('P1 independent noon bound: overhead canopy fully shields its 1.5m target while distant canopy does not', () => {
  // R3 is clear of B1/B2 at summer noon; horizontal shift through the roof is <0.5m at this height.
  const sheltered = analyzeCourtyard(choice, time('12:00'));
  const distant = analyzeCourtyard({ regionId: 'R3', canopyId: 'R1' }, time('12:00'));
  assert.equal(sheltered.elevated.rate, 1);
  assert.equal(distant.elevated.rate, 0);
  assert.equal(sheltered.elevated.witnesses.C_ROOF, 100);
  assert.equal(distant.scene.canopy.positionId, 'R1');
  assert.deepEqual(sheltered.scene.buildings, distant.scene.buildings);
});

test('P1 higher reference and real time changes are recomputed, not copied from the G benchmark', () => {
  const afternoon = analyzeCourtyard(choice, time('15:00'));
  const noon = analyzeCourtyard(choice, time('12:00'));
  assert.ok(afternoon.elevated.rate > afternoon.ground.rate);
  assert.notDeepEqual(afternoon.sun.direction.toArray(), noon.sun.direction.toArray());
  assert.notEqual(afternoon.elevated.rate, noon.elevated.rate);
  assert.notEqual(afternoon.ground.rate, 1);
});

test('P1 invalid layout, night and low sun return no normal metrics and no removed samples', () => {
  for (const regionId of ['R2', 'R5']) {
    const invalid = analyzeCourtyard({ regionId, canopyId: 'R3' }, time('12:00'));
    assert.equal(invalid.status, 'invalid-layout');
    assert.equal(invalid.ground, null);
    assert.equal(invalid.elevated, null);
  }
  for (const [clock, status] of [['00:00', 'below-horizon'], ['04:45', 'low-altitude']]) {
    const result = analyzeCourtyard(choice, time(clock));
    assert.equal(result.status, status);
    assert.equal(result.ground, null);
    assert.equal(result.elevated, null);
  }
  assert.throws(() => analyzeCourtyard({ ...choice, metrics: { rate: 1 } }, time('12:00')), TypeError);
  assert.throws(() => analyzeCourtyard(choice, new Date(NaN)), TypeError);
});

test('P1 business analysis and G regression fixture remain independent across repeated layouts', () => {
  const direction = new Vector3(1, 1, 0).normalize();
  const before = probeOccluders().map(item => [item.id, item.box.min.toArray(), item.box.max.toArray()]);
  analyzeCourtyard(choice, time('15:00'));
  analyzeCourtyard({ regionId: 'R4', canopyId: 'R6' }, time('08:00'));
  assert.deepEqual(probeOccluders().map(item => [item.id, item.box.min.toArray(), item.box.max.toArray()]), before);
  assert.equal(runReferenceProbe(0, direction).rate, 1);
  assert.equal(runReferenceProbe(1.5, direction).rate, 0.3);
});
