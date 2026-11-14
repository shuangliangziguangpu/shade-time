import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3, DirectionalLight } from 'three';
import { createCourtyardScene } from '../src/domain/scene.js';
import { createCourtyardModel, courtyardLightingFrame, disposeModel } from '../src/view/courtyard-model.js';
import { positionSunLight } from '../src/view/lighting.js';
import { sunDirection, DEG } from '../src/core/sun.js';

test('P1 Three.js solid IDs, geometry dimensions and world bounds match all analytical layouts', () => {
  for (const canopyId of ['R1', 'R3', 'R4', 'R6']) {
    const scene = createCourtyardScene({ regionId: canopyId, canopyId });
    const model = createCourtyardModel(scene);
    model.group.updateMatrixWorld(true);
    assert.equal(model.solids.size, 7);
    for (const entity of scene.occluders) {
      const mesh = model.solids.get(entity.id);
      assert.equal(mesh.userData.entityId, entity.id);
      assert.deepEqual(mesh.position.toArray(), entity.center);
      assert.deepEqual([mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth], entity.size);
      const displayedBounds = new Box3().setFromObject(mesh);
      // BoxGeometry stores vertices in Float32; allow its representation error only.
      assert.ok(displayedBounds.min.distanceTo(entity.box.min) < 1e-7, entity.id);
      assert.ok(displayedBounds.max.distanceTo(entity.box.max) < 1e-7, entity.id);
      assert.equal(mesh.castShadow, true);
    }
    disposeModel(model.group);
  }
});

test('P1 three inactive canopy wireframes and six candidate outlines cannot cast shadows', () => {
  const scene = createCourtyardScene({ regionId: 'R3', canopyId: 'R3' });
  const model = createCourtyardModel(scene);
  const previewParts = [];
  const regions = [];
  model.group.traverse(object => {
    if (object.userData.kind === 'canopy-preview') previewParts.push(object);
    if (object.userData.kind === 'region-candidate') regions.push(object);
    if (object.userData.kind !== 'occluder') assert.equal(object.castShadow, false);
  });
  assert.equal(previewParts.length, 15);
  assert.equal(new Set(previewParts.map(item => item.userData.candidateId)).size, 3);
  assert.equal(regions.length, 6);
  assert.equal(scene.occluders.length, 7);
  disposeModel(model.group);
});

test('P1 derived shadow camera encloses courtyard and buildings for multiple sun directions', () => {
  const scene = createCourtyardScene({ regionId: 'R3', canopyId: 'R3' });
  const frame = courtyardLightingFrame(scene);
  assert.ok(frame.extent > 12);
  assert.ok(frame.distance > 30);
  const light = new DirectionalLight();
  Object.assign(light.shadow.camera, { left: -frame.extent, right: frame.extent, top: frame.extent, bottom: -frame.extent, near: frame.near, far: frame.far });
  light.shadow.camera.updateProjectionMatrix();
  for (const altitude of [5, 45, 75]) for (const azimuth of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
    positionSunLight(light, sunDirection(altitude * DEG, azimuth), frame.center, frame.distance);
    light.shadow.updateMatrices(light);
    for (const x of [frame.bounds.min.x, frame.bounds.max.x]) for (const y of [frame.bounds.min.y, frame.bounds.max.y]) for (const z of [frame.bounds.min.z, frame.bounds.max.z]) {
      const point = new Vector3(x, y, z).project(light.shadow.camera);
      assert.ok(point.toArray().every(value => Math.abs(value) <= 1 + 1e-10), `${altitude}/${azimuth}: ${point.toArray()}`);
    }
  }
});
