import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_CONFIG, checkAiConnectivity } from '../server/ai-connectivity.js';

const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const models = () => json({ data: [{ id: 'deepseek-flash' }] });

test('AI diagnostic without dedicated key is BLOCKED and sends zero requests', async () => {
  let calls = 0;
  const result = await checkAiConnectivity({ apiKey: '', fetchImpl: () => { calls++; } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(calls, 0);
});

test('AI diagnostic checks configured model before sending a completion (MOCK transport)', async () => {
  const calls = [];
  const result = await checkAiConnectivity({ apiKey: 'test-only-key', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? models() : json({ choices: [{ message: { content: '{"status":"ok"}' } }] });
  } });
  assert.equal(result.status, 'PASS');
  assert.equal(calls[0].url, 'https://api.deepseek.com/models');
  assert.equal(calls[1].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(JSON.parse(calls[1].options.body).model, 'deepseek-flash');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('test-only-key'), false);
});

test('AI diagnostic rejects unavailable model without substituting another (MOCK)', async () => {
  let calls = 0;
  const result = await checkAiConnectivity({ apiKey: 'test-only-key', fetchImpl: async () => { calls++; return json({ data: [{ id: 'another-model' }] }); } });
  assert.equal(result.reason, 'CONFIGURED_MODEL_NOT_LISTED');
  assert.equal(calls, 1);
});

test('AI diagnostic handles HTTP authentication failure without exposing body (MOCK)', async () => {
  const result = await checkAiConnectivity({ apiKey: 'test-only-key', fetchImpl: async () => new Response('private-provider-message', { status: 401 }) });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.httpStatus, 401);
  assert.equal(JSON.stringify(result).includes('private-provider-message'), false);
});

test('AI diagnostic rejects empty, invalid JSON and unknown fields (MOCK)', async () => {
  for (const content of ['', 'not json', 'null', '{"status":"ok","extra":1}', '{"status":"wrong"}']) {
    let calls = 0;
    const result = await checkAiConnectivity({ apiKey: 'test-only-key', fetchImpl: async () => ++calls === 1 ? models() : json({ choices: [{ message: { content } }] }) });
    assert.equal(result.status, 'FAIL', content);
  }
});

test('AI diagnostic aborts; production timeout is 20 seconds (MOCK uses 20ms)', async () => {
  assert.equal(AI_CONFIG.timeoutMs, 20_000);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await checkAiConnectivity({ apiKey: 'test-only-key', timeoutMs: 20, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
    assert.equal(result.reason, 'TIMEOUT');
  } finally { clearTimeout(keepAlive); }
});
