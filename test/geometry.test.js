import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { castSunRay } from '../src/core/geometry.js';
import { DEG, sunDirection } from '../src/core/sun.js';
import { probeOccluders, runReferenceProbe } from '../src/probe/fixture.js';

const s = new Vector3(1, 1, 0).normalize();
const origin = new Vector3();
const G = probeOccluders();
const box = (id, min, max) => ({ id, box: new Box3(new Vector3(...min), new Vector3(...max)) });

test('G1 no occluder gives direct sunlight', () => {
  assert.equal(castSunRay(origin, s, []).status, 'direct');
});

test('G2 analytical intersection with G is (1,1,0)', () => {
  const result = castSunRay(origin, s, G);
  assert.equal(result.status, 'blocked');
  assert.equal(result.blockerId, 'G');
  assert.ok(result.hit.distanceTo(new Vector3(1, 1, 0)) < 1e-12);
});

test('G3 box behind the positive ray cannot occlude', () => {
  assert.equal(castSunRay(origin, s, [box('behind', [-2, -2, -1], [-1, -1, 1])]).status, 'direct');
});

test('G4-G5 height 1.5m and a 75-degree sun pass over G', () => {
  assert.equal(castSunRay(new Vector3(0, 1.5, 0), s, G).status, 'direct');
  assert.equal(castSunRay(origin, sunDirection(75 * DEG, -Math.PI / 2), G).status, 'direct');
});

test('G6-G7 synthetic roof blocks vertical ray; moving it away removes block', () => {
  const roof = box('roof-fixture', [-1.5, 2.4, -1.5], [1.5, 2.5, 1.5]);
  const vertical = new Vector3(0, 1, 0);
  assert.equal(castSunRay(new Vector3(0, 1.5, 0), vertical, [roof]).status, 'blocked');
  roof.box.translate(new Vector3(4, 0, 0));
  assert.equal(castSunRay(new Vector3(0, 1.5, 0), vertical, [roof]).status, 'direct');
});

test('G8 parallel slab rays hit or miss without NaN', () => {
  assert.equal(castSunRay(new Vector3(0, 1, 0), new Vector3(1, 0, 0), G).status, 'blocked');
  assert.equal(castSunRay(new Vector3(0, 3, 0), new Vector3(1, 0, 0), G).status, 'direct');
});

test('G9 original points inside or on box are invalid before epsilon offset', () => {
  for (const point of [new Vector3(1.5, 1, 0), new Vector3(1, 1, 0), new Vector3(2, 2, 1)]) {
    assert.equal(castSunRay(point, s, G).status, 'invalid-origin');
  }
});

test('G10 multiple occluders count once with closest witness independent of array order', () => {
  const far = box('far', [3, 0, -1], [4, 5, 1]);
  for (const occluders of [[far, ...G], [...G, far]]) {
    const hit = castSunRay(origin, s, occluders);
    assert.equal(hit.status, 'blocked');
    assert.equal(hit.blockerId, 'G');
  }
});

test('boundary tangent, just inside, and just outside have deterministic outcomes', () => {
  const direction = new Vector3(1, 0, 0);
  assert.equal(castSunRay(new Vector3(0, 2, 0), direction, G).status, 'blocked');
  assert.equal(castSunRay(new Vector3(0, 2 - 1e-8, 0), direction, G).status, 'blocked');
  assert.equal(castSunRay(new Vector3(0, 2 + 1e-8, 0), direction, G).status, 'direct');
});

test('malformed geometry and non-unit/zero directions are rejected', () => {
  assert.throws(() => castSunRay(origin, new Vector3(), G), TypeError);
  assert.throws(() => castSunRay(origin, new Vector3(1, 1, 0), G), TypeError);
  assert.throws(() => castSunRay(origin, s, [...G, ...G]), TypeError);
  assert.throws(() => castSunRay(origin, s, [box('zero', [0, 0, 0], [0, 1, 1])]), TypeError);
});

test('independent 100-point benchmark: ground 100%, height 1.5m 30%', () => {
  const ground = runReferenceProbe(0, s);
  const raised = runReferenceProbe(1.5, s);
  assert.equal(ground.samples.length, 100);
  assert.equal(raised.samples.length, 100);
  assert.equal(ground.status, 'valid');
  assert.equal(raised.status, 'valid');
  assert.equal(ground.rate, 1);
  assert.equal(raised.rate, 0.3);
  assert.equal(raised.samples.filter(point => point.status === 'blocked').length, 30);
});
