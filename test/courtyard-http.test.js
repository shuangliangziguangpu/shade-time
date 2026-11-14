import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createShadeServer } from '../server/app.js';

test('P1 courtyard page and complete shared ESM import graph are served without exposing private files', async t => {
  const server = createShadeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const paths = ['/courtyard', '/courtyard.css', '/src/courtyard.js', '/src/domain/scene-config.js', '/src/domain/scene.js',
    '/src/domain/clearance.js', '/src/domain/layout.js', '/src/domain/analysis.js', '/src/view/courtyard-model.js'];
  for (const path of paths) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 100);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  for (const path of ['/.env', '/server/ai-connectivity.js', '/.git/config', '/docs/DEVELOPMENT_LOG.md', '/src/domain/unknown.js']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.phase, 0, 'legacy stage-zero health contract is preserved');
  const legacy = await (await fetch(base + '/')).text();
  assert.match(legacy, /独立盒 G/);
});
