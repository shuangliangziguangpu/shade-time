import * as THREE from 'three';
import { VISUAL_CONFIG } from './visual-config.js';

function paverMaterial(base) {
  const material = base.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec2 paverUvScale; attribute vec2 paverUvOffset;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv = vMapUv * paverUvScale + paverUvOffset;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = vNormalMapUv * paverUvScale + paverUvOffset;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = vRoughnessMapUv * paverUvScale + paverUvOffset;
      #endif`);
  };
  material.customProgramCacheKey = () => 'metre-paving-v1';
  return material;
}

export function createPaving(scene, library) {
  const group = new THREE.Group();
  group.name = 'metre-paving';
  const floor = scene.courtyard.footprint, path = scene.corridor.footprint;
  const regions = [
    { minX: floor.minX, maxX: path.minX, minZ: floor.minZ, maxZ: floor.maxZ, family: 'stone' },
    { minX: path.maxX, maxX: floor.maxX, minZ: floor.minZ, maxZ: floor.maxZ, family: 'stone' },
    { minX: path.minX, maxX: path.maxX, minZ: floor.minZ, maxZ: path.maxZ, family: 'concrete' },
    { minX: path.minX, maxX: path.maxX, minZ: path.maxZ, maxZ: floor.maxZ, family: 'stone' },
  ];
  const collections = new Map([['stone', []], ['concrete', []]]);
  const pitch = VISUAL_CONFIG.pavingModule;
  for (const region of regions) {
    const nx = Math.ceil((region.maxX - region.minX) / pitch - 1e-10);
    const nz = Math.ceil((region.maxZ - region.minZ) / pitch - 1e-10);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = region.minX + i * pitch, z0 = region.minZ + j * pitch;
      const fullWidth = Math.min(pitch, region.maxX - x0), fullDepth = Math.min(pitch, region.maxZ - z0);
      const width = fullWidth - VISUAL_CONFIG.pavingJoint, depth = fullDepth - VISUAL_CONFIG.pavingJoint;
      collections.get(region.family).push({ x: x0 + fullWidth / 2, z: z0 + fullDepth / 2, width, depth });
    }
  }
  const baseGeometry = new THREE.PlaneGeometry(scene.courtyard.size[0], scene.courtyard.size[2]);
  const base = new THREE.Mesh(baseGeometry, library.get('joint'));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.002;
  base.receiveShadow = true;
  group.add(base);
  let tileCount = 0;
  const ownMaterials = [];
  for (const [family, tiles] of collections) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const scale = new Float32Array(tiles.length * 2), offsets = new Float32Array(tiles.length * 2);
    const repeat = library.get(family).userData.metresPerRepeat;
    tiles.forEach((tile, index) => {
      scale.set([tile.width / repeat, tile.depth / repeat], index * 2);
      offsets.set([Math.abs(Math.sin(tile.x * 17.31 + tile.z * 6.73)), Math.abs(Math.sin(tile.z * 9.7))], index * 2);
    });
    geometry.setAttribute('paverUvScale', new THREE.InstancedBufferAttribute(scale, 2));
    geometry.setAttribute('paverUvOffset', new THREE.InstancedBufferAttribute(offsets, 2));
    const material = paverMaterial(library.get(family));
    ownMaterials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    tiles.forEach((tile, index) => {
      matrix.compose(new THREE.Vector3(tile.x, -VISUAL_CONFIG.pavingDepth / 2, tile.z), new THREE.Quaternion(), new THREE.Vector3(tile.width, VISUAL_CONFIG.pavingDepth, tile.depth));
      mesh.setMatrixAt(index, matrix);
      const change = 0.94 + (Math.sin(tile.x * 17.31 + tile.z * 6.73) * 0.5 + 0.5) * 0.11;
      mesh.setColorAt(index, new THREE.Color().setRGB(change, change, change));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = { role: 'paving', family, moduleMetres: pitch, surfaceY: 0, tileCount: tiles.length };
    group.add(mesh);
    tileCount += tiles.length;
  }
  group.userData = { role: 'ground-visual', tileCount, topY: 0, corridor: { ...path } };
  let disposed=false;
  return { group, dispose() { if(disposed)return;disposed=true;group.traverse(object => {if(object.isInstancedMesh)object.dispose();object.geometry?.dispose();}); for (const material of ownMaterials) material.dispose(); } };
}
