import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createShadeServer } from '../server/app.js';

test('HTTP serves browser modules, supports HEAD, rejects private paths and writes', async t => {
  const server = createShadeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const healthResponse = await fetch(`${base}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.phase, 0);
  assert.equal(health.three, '0.160.0');
  assert.ok(['BLOCKED', 'CONFIGURED'].includes(health.ai.status));
  assert.equal(JSON.stringify(health).includes('SHADETIME_AI_API_KEY'), false);
  for (const path of ['/', '/styles.css', '/src/main.js', '/src/core/sun.js', '/src/core/geometry.js', '/src/probe/fixture.js', '/src/view/lighting.js', '/vendor/suncalc-adapter.js', '/vendor/suncalc.js', '/vendor/three.module.js', '/vendor/OrbitControls.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).length > 50);
  }
  for (const path of ['/.env', '/.git/config', '/package.json', '/server/ai-connectivity.js', '/%2e%2e/.env', '/node_modules/suncalc/package.json']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base, { method: 'POST', body: '{}' })).status, 405);
});
