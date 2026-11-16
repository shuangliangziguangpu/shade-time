import * as THREE from 'three';

export function createPointEvidenceView() {
  const group = new THREE.Group();
  group.name = 'dual-height-evidence';
  group.visible = false;
  const pointGeometry = new THREE.SphereGeometry(0.08, 10, 6);
  const lines = [], dots = [], materials = [];
  for (const color of [0x287caa, 0xc18b29]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false });
    const dotMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
    const line = new THREE.Line(geometry, material), dot = new THREE.Mesh(pointGeometry, dotMaterial);
    line.renderOrder = dot.renderOrder = 8;
    line.frustumCulled = false;
    group.add(line, dot); lines.push(line); dots.push(dot); materials.push(material, dotMaterial);
  }
  return { group,
    update(pair) {
      group.visible = Boolean(pair);
      if (!pair) return;
      for (const [index, record] of [pair.ground, pair.elevated].entries()) {
        const origin = new THREE.Vector3(...record.origin);
        const end = record.hit ? new THREE.Vector3(...record.hit) : origin.clone().addScaledVector(new THREE.Vector3(...record.direction), 6);
        const positions = lines[index].geometry.attributes.position;
        positions.setXYZ(0, ...origin.toArray()); positions.setXYZ(1, ...end.toArray()); positions.needsUpdate = true;
        dots[index].position.copy(origin);
      }
    },
    dispose() { pointGeometry.dispose(); for (const line of lines) line.geometry.dispose(); for (const material of materials) material.dispose(); },
  };
}
