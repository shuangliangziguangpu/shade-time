import { checkAiConnectivity } from '../server/ai-connectivity.js';

const result = await checkAiConnectivity({ apiKey: process.env.SHADETIME_AI_API_KEY });
console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 2 : 1;
