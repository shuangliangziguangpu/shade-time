import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../server/ai-client.js';

const response = value => new Response(JSON.stringify(value), {status:200,headers:{'Content-Type':'application/json'}});
const models=()=>response({data:[{id:'deepseek-flash'}]});
test('B1C missing dedicated key blocks the real request before transport',async()=>{
  let calls=0;const client=createAiClient({apiKey:'',fetchImpl:async()=>{calls++;throw Error('must not run');}});
  await assert.rejects(client.complete('system','user'),{code:'AI_UNAVAILABLE'});assert.equal(calls,0);
});
test('B1C business client uses only configured endpoint/model and parses strict JSON (MOCK transport)',async()=>{
  const calls=[];const client=createAiClient({apiKey:'test-only-secret',fetchImpl:async(url,init)=>{calls.push({url,init});return url.endsWith('/models')?models():response({model:'deepseek-flash',choices:[{message:{content:'{"summary":"已理解"}'}}]});}});
  const result=await client.complete('system','user');assert.deepEqual(result.value,{summary:'已理解'});
  assert.deepEqual(calls.map(x=>x.url),['https://api.deepseek.com/models','https://api.deepseek.com/chat/completions']);
  assert.equal(JSON.parse(calls[1].init.body).model,'deepseek-flash');assert.equal(calls[1].init.redirect,'error');
  assert.ok(!JSON.stringify(result).includes('test-only-secret'));
});
test('B1C unavailable model and authentication failures do not fall back or expose bodies (MOCK)',async()=>{
  for(const mode of ['model','auth']){let calls=0;const c=createAiClient({apiKey:'test-only-secret',fetchImpl:async()=>{calls++;return mode==='model'?response({data:[{id:'other'}]}):new Response('test-only-secret private provider details',{status:401});}});await assert.rejects(c.complete('s','u'),error=>error.code==='AI_UNAVAILABLE'&&!error.message.includes('secret'));assert.equal(calls,1);}
});
test('B1C empty/malformed/object-free/secret-bearing content is rejected safely (MOCK)',async()=>{
  for(const content of ['', 'not json','[]','null','{"summary":"test-only-secret"}']){const c=createAiClient({apiKey:'test-only-secret',fetchImpl:async url=>url.endsWith('/models')?models():response({choices:[{message:{content}}]})});await assert.rejects(c.complete('s','u'),{code:'INVALID_AI_RESPONSE'});}
});
test('B1C timeout and external cancellation abort network work with safe statuses (MOCK)',async()=>{
  const slow=async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  const timer=setTimeout(()=>{},100);
  try{await assert.rejects(createAiClient({apiKey:'test',fetchImpl:slow,timeoutMs:10}).complete('s','u'),{code:'AI_TIMEOUT'});
    const controller=new AbortController();const promise=createAiClient({apiKey:'test',fetchImpl:slow}).complete('s','u',{signal:controller.signal});controller.abort();await assert.rejects(promise,{code:'AI_CANCELLED'});
  }finally{clearTimeout(timer);}
});
