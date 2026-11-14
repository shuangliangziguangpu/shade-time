import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createShadeServer } from '../server/app.js';

test('B1A all visual modules and local addon dependencies load through explicit static routes', async t => {
  const server=createShadeServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['visual-config','visual-materials','shadow-proxies','visual-scene','render-pipeline','camera-rig','box-parts','building-visuals','ground-visuals','canopy-visuals']) {
    const response=await fetch(`${base}/src/view/${path}.js`);
    assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/javascript/);assert.ok((await response.text()).length>100);
  }
  assert.equal((await fetch(`${base}/vendor/BufferGeometryUtils.js`)).status,200);
  for(const path of ['/.env','/server/ai-connectivity.js','/node_modules/three/package.json'])assert.equal((await fetch(base+path)).status,404);
});
