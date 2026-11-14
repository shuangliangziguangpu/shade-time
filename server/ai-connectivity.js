export const AI_CONFIG = Object.freeze({
  provider: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  timeoutMs: 20_000,
});

// A server-only diagnostic, not one of the three product AI chains.
// Injecting transport is solely for deterministic offline error-path tests.
export async function checkAiConnectivity({ apiKey, fetchImpl = fetch, timeoutMs = AI_CONFIG.timeoutMs } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return { status: 'BLOCKED', reason: 'MISSING_SHADETIME_AI_API_KEY', model: AI_CONFIG.model };
  }
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' };
  try {
    const modelsResponse = await fetchImpl(`${AI_CONFIG.baseUrl}/models`, { headers, signal, redirect: 'error' });
    if (!modelsResponse.ok) return { status: 'FAIL', reason: 'MODELS_HTTP_ERROR', httpStatus: modelsResponse.status };
    const models = await modelsResponse.json();
    if (!Array.isArray(models.data) || !models.data.some(model => model.id === AI_CONFIG.model)) {
      return { status: 'FAIL', reason: 'CONFIGURED_MODEL_NOT_LISTED', model: AI_CONFIG.model };
    }
    const response = await fetchImpl(`${AI_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST', headers, signal, redirect: 'error',
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: 'system', content: 'Return exactly this JSON object: {"status":"ok"}. No other text or fields.' },
          { role: 'user', content: 'ShadeTime connectivity check. Return the required JSON.' },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 64,
        stream: false,
      }),
    });
    if (!response.ok) return { status: 'FAIL', reason: 'CHAT_HTTP_ERROR', httpStatus: response.status };
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 1024) {
      return { status: 'FAIL', reason: 'INVALID_CONTENT' };
    }
    const parsed = JSON.parse(content);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object' ||
        Object.keys(parsed).length !== 1 || parsed.status !== 'ok') {
      return { status: 'FAIL', reason: 'INVALID_JSON_CONTRACT' };
    }
    return { status: 'PASS', provider: AI_CONFIG.provider, model: AI_CONFIG.model, modelsChecked: true, completionChecked: true };
  } catch {
    // Do not log provider response bodies, URLs with tokens, or raw fetch errors.
    return { status: 'FAIL', reason: signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_JSON_ERROR' };
  }
}
