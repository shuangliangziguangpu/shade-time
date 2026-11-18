import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';
import { pointEvidence } from '../src/domain/point-evidence.js';
import { createAiClient } from '../server/ai-client.js';
import { createAiService } from '../server/ai-service.js';
import { createShadeServer } from '../server/app.js';
import { createAiWorkflow } from '../src/view/ai-workflow.js';

const period={date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15};
const A={regionId:'R3',canopyId:'R3'},B={regionId:'R1',canopyId:'R3'};
function scenario(){
 const session=createDecisionSession({selection:A,period,height:1.5,constraints:{regionMovable:true,canopyMovable:false,minimumShade:.8}});
 const a=analyzePeriod(A,period),b=analyzePeriod(B,period);session.acceptAnalysis(a);
 return {session,a,b};
}
function mockService(){
 let completions=0;
 const service=createAiService({client:createAiClient({apiKey:'MOCK-NOT-A-REAL-KEY',fetchImpl:async(url,init)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
  completions++;const data=JSON.parse(JSON.parse(init.body).messages[1].content);
  return Response.json({choices:[{message:{content:JSON.stringify({summary:'请对照两条射线。',explanation:'程序事实卡记录各参考面的命中状态。',pattern:data.facts.pattern,evidenceRefs:data.evidenceRefs,limitations:['这是单点记录，不代表区域。']})}}]});
 }})});
 return {service,get completions(){return completions;}};
}
const refs=e=>[e.ground.evidenceId,e.elevated.evidenceId];

test('B01 exact P56 counterexample uses distinct references for different actual layouts',()=>{
 const {session,a,b}=scenario();const ae=pointEvidence(a,0,55,session.context()),be=pointEvidence(b,0,55,session.context());
 assert.equal(ae.ground.status,'direct');assert.equal(ae.elevated.blockerId,'C_ROOF');
 assert.equal(be.ground.blockerId,'B1');assert.equal(be.elevated.blockerId,'B1');
 assert.notEqual(ae.contextKey,be.contextKey);assert.notEqual(ae.ground.evidenceId,be.ground.evidenceId);assert.notEqual(ae.elevated.evidenceId,be.elevated.evidenceId);
 const movedCanopy=pointEvidence(analyzePeriod({regionId:'R3',canopyId:'R1'},period),0,55,session.context());assert.notEqual(ae.ground.evidenceId,movedCanopy.ground.evidenceId);
});
test('B01 HTTP rejects B evidence against confirmed A before any supplier call (MOCK transport)',async t=>{
 const {session,b}=scenario(),fixture=mockService(),server=createShadeServer({aiService:fixture.service});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const post=async(action,data)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/ai/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {http:r.status,value:await r.json()};};
 const synced=await post('context',{revision:1,snapshot:session.snapshot(),sampleIndex:0,pointIndex:55});assert.equal(synced.value.status,'SUCCESS');const {sessionId,contextId}=synced.value.data;
 const result=await post('explain',{sessionId,contextId,requestId:'ai-1',text:'解释当前点',evidenceRefs:refs(pointEvidence(b,0,55,session.context()))});
 assert.equal(result.http,409);assert.equal(result.value.status,'STALE_CONTEXT');assert.equal(fixture.completions,0);
});
test('B01 legacy unbound references are rejected instead of being silently upgraded (MOCK transport)',async()=>{
 const {session}=scenario(),fixture=mockService();const synced=await fixture.service.handle('context',{revision:1,snapshot:session.snapshot(),sampleIndex:0,pointIndex:55});const {sessionId,contextId}=synced.data,c=session.context();
 const result=await fixture.service.handle('explain',{sessionId,contextId,requestId:'ai-1',text:'解释',evidenceRefs:[`${c.analysisId}:${c.contextVersion}:0:55:ground`,`${c.analysisId}:${c.contextVersion}:0:55:elevated`]});assert.equal(result.status,'STALE_CONTEXT');assert.equal(fixture.completions,0);
});
test('B01 confirmed A and later confirmed B are both explainable with freshly bound facts (MOCK transport)',async()=>{
 const {session,a,b}=scenario(),fixture=mockService();let ctx=await fixture.service.handle('context',{revision:1,snapshot:session.snapshot(),sampleIndex:0,pointIndex:55});
 const first=await fixture.service.handle('explain',{sessionId:ctx.data.sessionId,contextId:ctx.data.contextId,requestId:'ai-1',text:'解释A',evidenceRefs:refs(pointEvidence(a,0,55,session.context()))});assert.equal(first.status,'SUCCESS');assert.equal(first.data.facts.ground.status,'direct');assert.equal(first.data.facts.elevated.blockerId,'C_ROOF');
 session.update({selection:B});session.acceptAnalysis(b);ctx=await fixture.service.handle('context',{sessionId:ctx.data.sessionId,revision:2,snapshot:session.snapshot(),sampleIndex:0,pointIndex:55});
 const second=await fixture.service.handle('explain',{sessionId:ctx.data.sessionId,contextId:ctx.data.contextId,requestId:'ai-2',text:'解释已确认B',evidenceRefs:refs(pointEvidence(b,0,55,session.context()))});assert.equal(second.status,'SUCCESS');assert.deepEqual(second.data.facts.selection,B);assert.equal(second.data.facts.ground.blockerId,'B1');assert.equal(second.data.facts.elevated.blockerId,'B1');assert.equal(fixture.completions,2);
});
for(const mode of ['manual','ai-recommendation'])test(`B01 ${mode} B preview cannot issue an explain request or erase local rays`,async()=>{
 const {session,b}=scenario();const evidence=pointEvidence(b,0,55,session.context());const context={snapshot:session.snapshot(),shown:'B',sampleIndex:0,pointIndex:55,evidenceRefs:refs(evidence),previewId:mode+'-candidate'};let calls=0,restores=0;
 const workflow=createAiWorkflow({getContext:()=>context,send:async()=>{calls++;return {status:'AI_UNAVAILABLE'};},applyDraft:()=>{},preview:()=>{},apply:()=>{},restore:()=>{restores++;}});
 await workflow.explain('解释预览');assert.equal(calls,0);assert.equal(restores,0);assert.equal(workflow.state().status,'PREVIEW_EXPLANATION_UNAVAILABLE');assert.equal(workflow.state().explanation,null);assert.deepEqual(context.evidenceRefs,refs(evidence));assert.equal(evidence.ground.blockerId,'B1');assert.equal(evidence.elevated.blockerId,'B1');
});
test('B01 switching back to A restores explain workflow without requiring preview application',async()=>{
 const {session,a,b}=scenario();let context={snapshot:session.snapshot(),shown:'B',sampleIndex:0,pointIndex:55,evidenceRefs:refs(pointEvidence(b,0,55,session.context())),previewId:'candidate'};const actions=[];
 const workflow=createAiWorkflow({getContext:()=>context,send:async(action)=>{actions.push(action);return action==='context'?{status:'SUCCESS',data:{sessionId:'mock-session',contextId:'mock-context'}}:{status:'SUCCESS',data:{facts:{selection:A},ai:{summary:'mock'}}};},applyDraft:()=>{},preview:()=>{},apply:()=>{},restore:()=>{}});
 await workflow.explain('预览');assert.equal(actions.length,0);session.observe();context={...context,shown:'A',snapshot:session.snapshot(),evidenceRefs:refs(pointEvidence(a,0,55,session.context()))};workflow.contextChanged();await workflow.explain('正式A');assert.deepEqual(actions,['context','explain']);assert.equal(workflow.state().status,'EXPLANATION_VALIDATED');
});
