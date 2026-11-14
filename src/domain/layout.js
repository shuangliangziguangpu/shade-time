import { createCourtyardScene } from './scene.js';
import { assessBoundary, assessSeparation } from './clearance.js';

function assessScene(scene) {
  const checks = [];
  const addBoundary = subject => checks.push({
    kind: 'boundary', subjectId: subject.id, obstacleId: scene.courtyard.id,
    ...assessBoundary(subject.footprint, scene.courtyard.footprint),
  });
  const addSeparation = (subject, obstacle) => checks.push({
    kind: 'separation', subjectId: subject.id, obstacleId: obstacle.id,
    ...assessSeparation(subject.footprint, obstacle.footprint),
  });
  addBoundary(scene.target);
  addBoundary(scene.canopy);
  for (const obstacle of [...scene.buildings, scene.corridor, ...scene.canopy.posts]) addSeparation(scene.target, obstacle);
  for (const obstacle of [...scene.buildings, scene.corridor]) addSeparation(scene.canopy, obstacle);
  // Roof projection is allowed for TARGET; connected canopy components are not separate ground occupants.
  const violations = checks.filter(check => !check.valid);
  return Object.freeze({ valid: violations.length === 0, checks: Object.freeze(checks.map(Object.freeze)), violations: Object.freeze(violations) });
}

// Single public business entry point: rebuild canonical geometry from strictly checked IDs.
export function inspectLayout(selection) {
  const scene = createCourtyardScene(selection);
  return Object.freeze({ scene, validation: assessScene(scene) });
}
