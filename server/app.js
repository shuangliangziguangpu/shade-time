import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { AI_CONFIG } from './ai-connectivity.js';

const files = new Map([
  ['/', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/courtyard', ['../public/courtyard.html', 'text/html; charset=utf-8']],
  ['/courtyard.css', ['../public/courtyard.css', 'text/css; charset=utf-8']],
  ['/src/courtyard.js', ['../src/courtyard.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/scene-config.js', ['../src/domain/scene-config.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/scene.js', ['../src/domain/scene.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/clearance.js', ['../src/domain/clearance.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/layout.js', ['../src/domain/layout.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/analysis.js', ['../src/domain/analysis.js', 'text/javascript; charset=utf-8']],
  ['/src/domain/period.js', ['../src/domain/period.js', 'text/javascript; charset=utf-8']],
  ['/src/view/period-panel.js', ['../src/view/period-panel.js', 'text/javascript; charset=utf-8']],
  ['/src/view/courtyard-model.js', ['../src/view/courtyard-model.js', 'text/javascript; charset=utf-8']],
  ['/src/view/visual-config.js', ['../src/view/visual-config.js', 'text/javascript; charset=utf-8']],
  ['/src/view/visual-materials.js', ['../src/view/visual-materials.js', 'text/javascript; charset=utf-8']],
  ['/src/view/shadow-proxies.js', ['../src/view/shadow-proxies.js', 'text/javascript; charset=utf-8']],
  ['/src/view/visual-scene.js', ['../src/view/visual-scene.js', 'text/javascript; charset=utf-8']],
  ['/src/view/render-pipeline.js', ['../src/view/render-pipeline.js', 'text/javascript; charset=utf-8']],
  ['/src/view/camera-rig.js', ['../src/view/camera-rig.js', 'text/javascript; charset=utf-8']],
  ['/src/view/box-parts.js', ['../src/view/box-parts.js', 'text/javascript; charset=utf-8']],
  ['/src/view/building-visuals.js', ['../src/view/building-visuals.js', 'text/javascript; charset=utf-8']],
  ['/src/view/ground-visuals.js', ['../src/view/ground-visuals.js', 'text/javascript; charset=utf-8']],
  ['/src/view/canopy-visuals.js', ['../src/view/canopy-visuals.js', 'text/javascript; charset=utf-8']],
  ['/vendor/BufferGeometryUtils.js', ['../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['../public/styles.css', 'text/css; charset=utf-8']],
  ['/src/main.js', ['../src/main.js', 'text/javascript; charset=utf-8']],
  ['/src/core/sun.js', ['../src/core/sun.js', 'text/javascript; charset=utf-8']],
  ['/src/core/geometry.js', ['../src/core/geometry.js', 'text/javascript; charset=utf-8']],
  ['/src/probe/fixture.js', ['../src/probe/fixture.js', 'text/javascript; charset=utf-8']],
  ['/src/view/lighting.js', ['../src/view/lighting.js', 'text/javascript; charset=utf-8']],
  ['/vendor/suncalc-adapter.js', ['../public/suncalc-adapter.js', 'text/javascript; charset=utf-8']],
  ['/vendor/suncalc.js', ['../node_modules/suncalc/suncalc.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three.module.js', ['../node_modules/three/build/three.module.js', 'text/javascript; charset=utf-8']],
  ['/vendor/OrbitControls.js', ['../node_modules/three/examples/jsm/controls/OrbitControls.js', 'text/javascript; charset=utf-8']],
]);

export function createShadeServer() {
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    // Match exact public paths only. No filesystem joins with user-controlled paths.
    const path = request.url?.split('?')[0];
    if (path === '/api/health') {
      const body = JSON.stringify({
        status: 'ok', phase: 0, three: '0.160.0', suncalc: '1.9.0',
        ai: { status: process.env.SHADETIME_AI_API_KEY?.trim() ? 'CONFIGURED' : 'BLOCKED', provider: AI_CONFIG.provider, model: AI_CONFIG.model },
      });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const asset = files.get(path);
    if (!asset) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    try {
      const content = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] }).end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : 'Resource unavailable; run npm ci first.');
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  return server;
}
