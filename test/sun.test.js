import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REVISION, DirectionalLight, Vector3 } from 'three';
import { DEG, altitudeStatus, getSunPosition, parseShanghaiDateTime, sunDirection } from '../src/core/sun.js';
import { positionSunLight } from '../src/view/lighting.js';

function near(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('P0 locked packages are Three r160 and SunCalc 1.9.0', () => {
  assert.equal(REVISION, '160');
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.equal(lock.packages['node_modules/three'].version, '0.160.0');
  assert.equal(lock.packages['node_modules/suncalc'].version, '1.9.0');
});

test('S1 four artificial azimuths preserve east/up/south coordinates and unit length', () => {
  for (const [azimuth, x, z] of [[0, 0, 1], [-Math.PI / 2, 1, 0], [Math.PI / 2, -1, 0], [Math.PI, 0, -1]]) {
    const direction = sunDirection(30 * DEG, azimuth);
    near(direction.x, x * Math.cos(30 * DEG));
    near(direction.y, 0.5);
    near(direction.z, z * Math.cos(30 * DEG));
    near(direction.length(), 1);
  }
});

test('S2-S4 Dalian summer morning east, noon south, afternoon west', () => {
  const positions = ['08:00', '12:00', '16:00'].map(time => getSunPosition(parseShanghaiDateTime('2026-06-21', time)));
  assert.ok(positions[0].direction.x > 0);
  assert.ok(positions[1].direction.z > 0);
  assert.ok(Math.abs(positions[1].direction.x) < 0.1);
  assert.ok(positions[2].direction.x < 0);
  assert.ok(positions.every(position => position.status === 'valid'));
});

test('S5-S6 midnight below horizon and winter noon lower than summer noon', () => {
  assert.equal(getSunPosition(parseShanghaiDateTime('2026-06-21', '00:00')).status, 'below-horizon');
  const summer = getSunPosition(parseShanghaiDateTime('2026-06-21', '12:00'));
  const winter = getSunPosition(parseShanghaiDateTime('2026-12-21', '12:00'));
  assert.ok(winter.altitude < summer.altitude);
});

test('S7 +08:00 and UTC equivalent instants match exactly', () => {
  assert.deepEqual(getSunPosition(new Date('2026-06-21T12:00:00+08:00')), getSunPosition(new Date('2026-06-21T04:00:00Z')));
});

test('S8 explicit Shanghai input is invariant across process timezones', () => {
  const moduleUrl = new URL('../src/core/sun.js', import.meta.url).href;
  const code = `import {getSunPosition,parseShanghaiDateTime} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(getSunPosition(parseShanghaiDateTime('2026-06-21','12:00'))));`;
  const outputs = ['UTC', 'Asia/Shanghai', 'America/Los_Angeles'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[1], outputs[2]);
});

test('S9 0, 2, 5 degrees and threshold neighbours are handled without rounding', () => {
  assert.equal(altitudeStatus(0), 'below-horizon');
  assert.equal(altitudeStatus(2 * DEG), 'low-altitude');
  assert.equal(altitudeStatus(5 * DEG), 'valid');
  assert.equal(altitudeStatus(5 * DEG - 1e-12), 'low-altitude');
});

test('S10 reject invalid dates, ambiguous inputs, invalid latitude and off-step time', () => {
  for (const [date, time] of [['2026-02-29', '12:00'], ['2026-02-30', '12:00'], ['2026-13-01', '12:00'], ['2026-01-01', '24:00'], ['2026-01-01', '12:01'], ['', '12:00']]) {
    assert.throws(() => parseShanghaiDateTime(date, time), RangeError);
  }
  assert.equal(parseShanghaiDateTime('2024-02-29', '12:00').toISOString(), '2024-02-29T04:00:00.000Z');
  assert.throws(() => getSunPosition(new Date(NaN)), TypeError);
  assert.throws(() => getSunPosition('2026-06-21'), TypeError);
  assert.throws(() => getSunPosition(new Date(), { latitude: 91, longitude: 0 }), RangeError);
  assert.throws(() => sunDirection(NaN, 0), RangeError);
});

test('SunCalc 1.9.0 upstream published-commit position regression', () => {
  // Upstream gitHead 6bc2757074c1e5eaa2389aa2ab36806f04c6d2a0, root test.js.
  const position = getSunPosition(new Date('2013-03-05T00:00:00Z'), { latitude: 50.5, longitude: 30.5 });
  near(position.azimuth, -2.5003175907168385, 1e-15);
  near(position.altitude, -0.7000406838781611, 1e-15);
});

test('P0 DirectionalLight sits toward sun and propagates opposite to sun vector', () => {
  const direction = sunDirection(45 * DEG, -Math.PI / 2);
  const light = new DirectionalLight();
  const center = new Vector3(3, 2, -4);
  positionSunLight(light, direction, center, 20);
  near(light.position.distanceTo(center), 20);
  near(light.position.clone().sub(center).normalize().dot(direction), 1);
  near(light.target.position.clone().sub(light.position).normalize().dot(direction), -1);
});
