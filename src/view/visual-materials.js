import * as THREE from 'three';
import { VISUAL_CONFIG } from './visual-config.js';

function hash(x, y, seed) {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + 19, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function proceduralSurface(kind, size = VISUAL_CONFIG.textureSize, seed = VISUAL_CONFIG.seed) {
  const colors = { concrete: [185, 183, 173], plaster: [221, 218, 205], stone: [186, 181, 166], roof: [188, 192, 183], metal: [90, 99, 99] };
  if (!colors[kind]) throw new RangeError('Unknown procedural surface');
  const color = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x;
    const fine = hash(x, y, seed);
    const broad = hash(Math.floor(x / 24), Math.floor(y / 24), seed + 17);
    const vein = Math.sin(x * 0.081 + Math.sin(y * 0.037) * 2);
    const change = kind === 'stone' ? (fine - 0.5) * 14 + (broad - 0.5) * 5 + vein * 1.2 : (fine - 0.5) * 5 + (broad - 0.5) * 2;
    for (let axis = 0; axis < 3; axis++) color[index * 4 + axis] = Math.max(0, Math.min(255, colors[kind][axis] + change));
    color[index * 4 + 3] = 255;
    const rough = (kind === 'roof' || kind === 'metal' ? 111 : kind === 'plaster' ? 198 : 184) + (fine - 0.5) * 26;
    roughness.set([rough, rough, rough, 255], index * 4);
    heights[index] = (fine - 0.5) * (kind === 'stone' ? 0.00035 : 0.00010);
    if (kind === 'roof') {
      // Subtle grooves in a repeatable 1.5m panel sample, no geometric displacement.
      const groove = Math.min(x % (size / 2), size / 2 - x % (size / 2));
      if (groove < 1.5) {
        heights[index] -= 0.0008;
        for (let axis = 0; axis < 3; axis++) color[index * 4 + axis] *= 0.89;
      }
    }
  }
  const metres = kind === 'roof' ? 1.5 : kind === 'stone' ? VISUAL_CONFIG.pavingModule : 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sample = (u, v) => heights[((v + size) % size) * size + ((u + size) % size)];
    const dx = (sample(x + 1, y) - sample(x - 1, y)) / (2 * metres / size);
    const dy = (sample(x, y + 1) - sample(x, y - 1)) / (2 * metres / size);
    const length = Math.hypot(dx, dy, 1);
    normal.set([(-dx / length * 0.5 + 0.5) * 255, (-dy / length * 0.5 + 0.5) * 255, (1 / length * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
  }
  return { color, roughness, normal, size, metres };
}

export function createVisualMaterials() {
  const textures = new Set();
  const materials = new Map();
  const makeTexture = (data, size, isColor) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    textures.add(texture);
    return texture;
  };
  for (const kind of ['concrete', 'plaster', 'stone', 'roof', 'metal']) {
    const surface = proceduralSurface(kind);
    const material = new THREE.MeshStandardMaterial({
      map: makeTexture(surface.color, surface.size, true),
      roughnessMap: makeTexture(surface.roughness, surface.size, false),
      normalMap: makeTexture(surface.normal, surface.size, false),
      metalness: 0, roughness: 1,
    });
    material.name = kind;
    material.userData.metresPerRepeat = surface.metres;
    materials.set(kind, material);
  }
  const constants = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x25444b, roughness: 0.17, metalness: 0, transmission: 0, ior: 1.5, clearcoat: 0.15 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3e4948, roughness: 0.34, metalness: 0 }),
    sill: new THREE.MeshStandardMaterial({ color: 0xc9c6b7, roughness: 0.65 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x747b73, roughness: 0.95 }),
  };
  for (const [name, material] of Object.entries(constants)) { material.name = name; materials.set(name, material); }
  let disposed = false;
  return {
    get(name) { if (disposed || !materials.has(name)) throw new Error('Material unavailable'); return materials.get(name); },
    materials, textures,
    setEnvironmentIntensity(value) { for (const material of materials.values()) material.envMapIntensity = value; },
    setAnisotropy(maximum) { for (const texture of textures) texture.anisotropy = Math.min(8, maximum); },
    dispose() { if (disposed) return; disposed = true; for (const texture of textures) texture.dispose(); for (const material of materials.values()) material.dispose(); },
  };
}
