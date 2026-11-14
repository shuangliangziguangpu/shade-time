import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, SRGBColorSpace, NoColorSpace } from 'three';
import { createCourtyardScene } from '../src/domain/scene.js';
import { createShadowBinding, assertVisualBindings } from '../src/view/shadow-proxies.js';
import { proceduralSurface, createVisualMaterials } from '../src/view/visual-materials.js';
import { daylightAppearance } from '../src/view/visual-config.js';

test('B1A procedural PBR maps are deterministic, metre-based and correctly color-tagged', () => {
  assert.deepEqual(proceduralSurface('stone', 16), proceduralSurface('stone', 16));
  assert.notDeepEqual(proceduralSurface('stone', 16).color, proceduralSurface('plaster', 16).color);
  const library = createVisualMaterials();
  for (const material of library.materials.values()) if (material.map) {
    assert.equal(material.map.colorSpace, SRGBColorSpace);
    assert.equal(material.normalMap.colorSpace, NoColorSpace);
    assert.equal(material.roughnessMap.colorSpace, NoColorSpace);
    assert.ok(material.userData.metresPerRepeat > 0);
  }
  assert.equal(library.get('glass').transmission, 0);
  assert.equal(library.get('glass').transparent, false);
  assert.equal(library.get('stone'), library.get('stone'));
  library.dispose();
  library.dispose();
  assert.throws(() => library.get('stone'));
});

test('B1A hidden-main-pass proxies stay visible to shadow renderer and detect protruding or duplicate visuals', () => {
  const scene = createCourtyardScene({regionId:'R3',canopyId:'R3'});
  const bindings = new Map();
  for (const entity of scene.occluders) {
    const binding = createShadowBinding(entity);
    const visual = new Mesh(new BoxGeometry(...entity.size), new MeshStandardMaterial());
    visual.position.fromArray(entity.center);
    binding.visual.add(visual);
    bindings.set(entity.id, binding);
  }
  assert.equal(assertVisualBindings(bindings, scene).length, 7);
  const mesh = bindings.get('C_ROOF').visual.children[0];
  mesh.castShadow = true;
  assert.throws(() => assertVisualBindings(bindings, scene), /Duplicate/);
  mesh.castShadow = false;
  mesh.position.x += 0.1;
  assert.throws(() => assertVisualBindings(bindings, scene), /envelope/);
  for (const binding of bindings.values()) { binding.visual.children[0].geometry.dispose(); binding.visual.children[0].material.dispose(); binding.dispose(); }
});

test('B1A visual daylight is continuous around horizon and leaves numeric domain out of scope', () => {
  assert.equal(daylightAppearance(-0.1).sun, 0);
  assert.equal(daylightAppearance(0).sun, 0);
  assert.ok(daylightAppearance(1e-8).sun < 0.001);
  assert.ok(daylightAppearance(0.8).sun > daylightAppearance(0.1).sun);
});
