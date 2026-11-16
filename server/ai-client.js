import { AI_CONFIG } from './ai-connectivity.js';

export class AiError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Server only. Transport injection is for offline tests, never browser input.
export function createAiClient({ apiKey = process.env.SHADETIME_AI_API_KEY, fetchImpl = fetch, timeoutMs = AI_CONFIG.timeoutMs } = {}) {
  let modelChecked = false;
  async function complete(system, user, { signal: externalSignal } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new AiError('AI_UNAVAILABLE');
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
    const headers = { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' };
    try {
      signal.throwIfAborted();
      if (!modelChecked) {
        const response = await fetchImpl(`${AI_CONFIG.baseUrl}/models`, { headers, signal, redirect: 'error' });
        if (!response.ok) throw new AiError('AI_UNAVAILABLE');
        const body = await response.json();
        if (!Array.isArray(body.data) || !body.data.some(row => row.id === AI_CONFIG.model)) throw new AiError('AI_UNAVAILABLE');
        modelChecked = true;
      }
      const response = await fetchImpl(`${AI_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST', headers, signal, redirect: 'error',
        body: JSON.stringify({ model: AI_CONFIG.model, messages: [{role:'system',content:system},{role:'user',content:user}],
          response_format: {type:'json_object'}, max_tokens: 1800, stream: false }),
      });
      if (!response.ok) throw new AiError('AI_UNAVAILABLE');
      const body = await response.json();
      signal.throwIfAborted();
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim() || content.length > 16_000 || content.includes(apiKey.trim())) throw new AiError('INVALID_AI_RESPONSE');
      let value;
      try { value = JSON.parse(content); } catch { throw new AiError('INVALID_AI_RESPONSE'); }
      if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new AiError('INVALID_AI_RESPONSE');
      return { value, provider: AI_CONFIG.provider, model: AI_CONFIG.model };
    } catch (error) {
      if (externalSignal?.aborted) throw new AiError('AI_CANCELLED');
      if (timeout.aborted) throw new AiError('AI_TIMEOUT');
      if (error instanceof AiError) throw error;
      // Never return provider bodies, authorization headers or raw network errors.
      throw new AiError('AI_UNAVAILABLE');
    }
  }
  return Object.freeze({ complete });
}
