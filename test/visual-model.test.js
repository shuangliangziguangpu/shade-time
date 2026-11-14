import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Matrix4, Vector3 } from 'three';
import { createCourtyardScene } from '../src/domain/scene.js';
import { createVisualMaterials } from '../src/view/visual-materials.js';
import { createVisualScene } from '../src/view/visual-scene.js';
import { createB1Facade } from '../src/view/building-visuals.js';
import { createPaving } from '../src/view/ground-visuals.js';
import { createCanopySurface } from '../src/view/canopy-visuals.js';
import { analyzeCourtyard } from '../src/domain/analysis.js';
import { parseShanghaiDateTime } from '../src/core/sun.js';
import { castSunRay } from '../src/core/geometry.js';

const original = createCourtyardScene({regionId:'R3',canopyId:'R3'});

test('B1A facade has extruded two-storey opaque construction inside B1, merged by material', () => {
  const library = createVisualMaterials();
  const facade = createB1Facade(original.buildings[0], library);
  facade.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(facade);
  assert.ok(original.occluders[0].box.clone().expandByScalar(1e-6).containsBox(bounds));
  assert.equal(facade.userData.storeys, 2);
  assert.equal(facade.userData.bays, 6);
  assert.equal(facade.userData.openingModel, 'opaque-backed');
  assert.ok(facade.userData.componentCount > 150);
  assert.ok(facade.children.length <= library.materials.size);
  assert.ok(facade.children.some(mesh => mesh.material.name === 'glass'));
  facade.traverse(object => { assert.equal(object.castShadow, false); object.geometry?.dispose(); });
  library.dispose();
});

test('B1A paving uses two instanced batches, actual metre module and never rises above Y=0', () => {
  const library = createVisualMaterials();
  const paving = createPaving(original, library);
  const instanced = paving.group.children.filter(object => object.isInstancedMesh);
  assert.equal(instanced.length, 2);
  assert.ok(paving.group.userData.tileCount > 1000);
  assert.deepEqual(paving.group.userData.corridor, original.corridor.footprint);
  const matrix = new Matrix4();
  for (const mesh of instanced) for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    const bounds = new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5)).applyMatrix4(matrix);
    assert.ok(bounds.max.y <= 1e-7);
    assert.ok(Math.abs(bounds.max.y) <= 1e-7);
    assert.ok(bounds.min.x >= -12 - 1e-6 && bounds.max.x <= 12 + 1e-6 && bounds.min.z >= -9 - 1e-6 && bounds.max.z <= 9 + 1e-6);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.userData.moduleMetres, 0.6);
  }
  paving.dispose(); library.dispose();
});

test('B1A static resources persist across region and canopy changes; seven bindings remain exact', () => {
  const library = createVisualMaterials();
  const visual = createVisualScene(original, library);
  const staticId = visual.staticGroup.uuid;
  const ids = visual.staticGroup.children.map(object => object.uuid);
  const geometryIds = [];
  visual.group.traverse(object=>{if(object.geometry&&object.userData.role!=='guide')geometryIds.push(object.geometry.uuid);});
  for (const canopyId of ['R1','R4','R6','R3']) {
    const next = createCourtyardScene({regionId:'R6',canopyId});
    assert.equal(visual.update(next).bindings.length, 7);
    assert.equal(visual.staticGroup.uuid, staticId);
    assert.deepEqual(visual.staticGroup.children.map(object=>object.uuid), ids);
  }
  const after=[];visual.group.traverse(object=>{if(object.geometry&&object.userData.role!=='guide')after.push(object.geometry.uuid);});
  assert.deepEqual(after,geometryIds);
  visual.dispose(); library.dispose();
});

test('B1A refined roof and post finishes preserve every TD004 envelope at all four placements', () => {
  const library=createVisualMaterials();
  for(const canopyId of ['R1','R3','R4','R6']) {
    const scene=createCourtyardScene({regionId:'R3',canopyId});
    for(const entity of scene.occluders.filter(item=>item.type==='roof'||item.type==='post')) {
      const visual=createCanopySurface(entity,library);
      visual.updateMatrixWorld(true);
      const bounds=new Box3().setFromObject(visual);
      assert.ok(entity.box.clone().expandByScalar(1e-6).containsBox(bounds),entity.id);
      assert.ok(bounds.min.distanceTo(entity.box.min)<1e-6);
      assert.ok(bounds.max.distanceTo(entity.box.max)<1e-6);
      assert.equal(visual.userData.geometryContract,'TD004');
      visual.traverse(object=>{assert.equal(object.castShadow,false);object.geometry?.dispose();});
    }
  }
  library.dispose();
});

test('B1A transformed render proxies reproduce all 200 reference rays for morning and afternoon placements', () => {
  const library=createVisualMaterials(),visual=createVisualScene(original,library);
  for(const canopyId of ['R1','R3','R4','R6'])for(const clock of ['08:00','12:00','15:00','16:00']){
    const result=analyzeCourtyard({regionId:'R3',canopyId},parseShanghaiDateTime('2026-06-21',clock));
    visual.update(result.scene);
    const boxes=[...visual.bindings.values()].map(binding=>({id:binding.entityId,box:new Box3().setFromObject(binding.proxy)}));
    for(const sample of [...result.ground.samples,...result.elevated.samples]){
      const actual=castSunRay(sample.point,result.sun.direction,boxes);
      assert.equal(actual.status,sample.status,`${canopyId}/${clock}/${sample.id}`);
      assert.equal(actual.blockerId,sample.blockerId);
    }
  }
  visual.dispose();library.dispose();
});

test('B1A disposing paving releases instance buffers once and retains library-owned textures', () => {
  const library=createVisualMaterials(),paving=createPaving(original,library);
  let instanceDisposals=0,textureDisposals=0;
  paving.group.traverse(object=>{if(object.isInstancedMesh)object.addEventListener('dispose',()=>instanceDisposals++);});
  for(const texture of library.textures)texture.addEventListener('dispose',()=>textureDisposals++);
  paving.dispose();paving.dispose();
  assert.equal(instanceDisposals,2);
  assert.equal(textureDisposals,0);
  library.dispose();
  assert.equal(textureDisposals,15);
});
