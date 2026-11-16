import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadeServer } from '../server/app.js';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';

test('B1C HTTP accepts bounded same-origin AI JSON, rejects foreign writes and never serves secrets',async t=>{
  const server=createShadeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const s=createDecisionSession({selection:{regionId:'R3',canopyId:'R3'},period:{date:'2026-06-21',startTime:'15:00',endTime:'16:00'},height:1.5,constraints:{}});s.acceptAnalysis(analyzePeriod(s.snapshot().selection,s.snapshot().period));
  const body={revision:1,snapshot:s.snapshot(),sampleIndex:0,pointIndex:null};
  const post=(data,headers={})=>fetch(base+'/api/ai/context',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof data==='string'?data:JSON.stringify(data)});
  let response=await post(body,{Origin:base});assert.equal(response.status,200);const context=await response.json();assert.equal(context.status,'SUCCESS');assert.ok(context.data.contextId);
  response=await post(body,{Origin:'https://untrusted.example'});assert.equal(response.status,403);
  response=await post(body,{'Content-Type':'text/plain'});assert.equal(response.status,415);
  response=await post('{broken');assert.equal(response.status,400);
  response=await post('x'.repeat(17000));assert.equal(response.status,413);
  response=await fetch(base+'/api/ai/parse');assert.equal(response.status,405);
  for(const path of ['/.env','/server/ai-client.js','/server/ai-service.js'])assert.equal((await fetch(base+path)).status,404);
  response=await fetch(base+'/api/ai/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:context.data.sessionId,contextId:context.data.contextId,requestId:'ai-1',text:'测试',apiKey:'not-accepted'})});assert.equal((await response.json()).status,'INVALID_INPUT');
});
