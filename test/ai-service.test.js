import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiService } from '../server/ai-service.js';
import { createAiClient } from '../server/ai-client.js';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';
import { pointEvidence } from '../src/domain/point-evidence.js';

const settings={date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15};
const selection={regionId:'R3',canopyId:'R3'};
const draft={selection,date:'2026-06-21',startTime:'15:00',endTime:'16:00',timeZone:'Asia/Shanghai',intervalMinutes:15,height:1.5,movementMode:'region',minimumShade:.8,needsClarification:false,clarificationQuestions:[],summary:'棚保持现位，仅调整活动区域，检查时段内采样最低目标。'};
function fixture({change=()=>{},initialSelection=selection,period=settings}={}){
  let providerCalls=0;
  const client=createAiClient({apiKey:'mock-transport-key-not-real',fetchImpl:async(url,init)=>{
    if(url.endsWith('/models'))return Response.json({data:[{id:'deepseek-flash'}]});
    providerCalls++;const messages=JSON.parse(init.body).messages;const data=JSON.parse(messages[1].content);let value;
    if(messages[0].content.includes('TASK:PARSE'))value=structuredClone(draft);
    else if(messages[0].content.includes('TASK:RECOMMEND'))value={candidateId:data.candidates[0].candidateId,summary:'建议采用满足目标的合法布置。',reasonCodes:['meets_target'],explanation:'保持不可移动对象，选择已计算且满足目标的候选。',limitations:['结论仅适用于当前有限候选和采样条件。']};
    else value={summary:'同一水平点在不同高度的遮挡状态可以不同。',explanation:'请对照两条参考射线与程序记录的命中状态理解高度差异。',pattern:data.facts.pattern,evidenceRefs:data.evidenceRefs,limitations:['单点证据不能代替区域结论。']};
    change(value,messages[0].content,data);
    return Response.json({model:'deepseek-flash',choices:[{message:{content:JSON.stringify(value)}}]});
  }});
  const svc=createAiService({client});const session=createDecisionSession({selection:initialSelection,period,height:1.5,constraints:{regionMovable:true,canopyMovable:false,minimumShade:.8}});
  const result=analyzePeriod(initialSelection,period);session.acceptAnalysis(result);
  let serial=0,revision=0,serverContext;
  const sync=async(pointIndex=null,sampleIndex=0)=>{const r=await svc.handle('context',{sessionId:serverContext?.sessionId,revision:++revision,snapshot:session.snapshot(),sampleIndex,pointIndex});assert.equal(r.status,'SUCCESS');serverContext=r.data;return r;};
  const call=(action,extra={})=>svc.handle(action,{sessionId:serverContext.sessionId,contextId:serverContext.contextId,requestId:`ai-${++serial}`,...extra});
  return {svc,session,result,sync,call,get context(){return serverContext;},get calls(){return providerCalls;}};
}
async function approved(f){await f.sync();const parsed=await f.call('parse',{text:'完整测试需求'});assert.equal(parsed.status,'SUCCESS');const confirmed=await f.call('confirm-draft',{draftId:parsed.data.draftId,confirmed:true});assert.equal(confirmed.status,'SUCCESS');return parsed;}

test('B1C parsed constraints stay a draft until an explicit confirmation (MOCK transport, real domain)',async()=>{
  const f=fixture();await f.sync();const before=f.session.snapshot();const parsed=await f.call('parse',{text:'棚不动，只移区域'});assert.equal(parsed.status,'SUCCESS');assert.deepEqual(parsed.data.draft.selection,selection);assert.deepEqual(f.session.snapshot(),before);
  assert.equal((await f.call('recommend',{text:'建议布置'})).status,'VALIDATION_REJECTED');
  assert.equal((await f.call('confirm-draft',{draftId:parsed.data.draftId,confirmed:false})).status,'VALIDATION_REJECTED');
  assert.equal((await f.call('confirm-draft',{draftId:parsed.data.draftId,confirmed:true})).status,'SUCCESS');
});
test('B1C AI draft rejects invalid fields and mathematical constraints rather than accepting coordinates or rates (MOCK)',async()=>{
  for(const patch of [{height:2},{minimumShade:1.2},{date:'2026-02-29'},{startTime:'15:01'},{movementMode:'fly'},{selection:{regionId:'R2',canopyId:'R3'}},{x:5},{rate:.99}]){
    const f=fixture({change:(v,task)=>{if(task.includes('TASK:PARSE'))Object.assign(v,patch);}});await f.sync();assert.ok(['VALIDATION_REJECTED','INVALID_AI_RESPONSE'].includes((await f.call('parse',{text:'输入'})).status),JSON.stringify(patch));
  }
});
test('B1C unsupported conditions produce clarification and cannot be confirmed (MOCK)',async()=>{
  const f=fixture({change:(v,task)=>{if(task.includes('TASK:PARSE')){for(const k of ['selection','date','startTime','endTime','timeZone','intervalMinutes','height','movementMode','minimumShade'])v[k]=null;v.needsClarification=true;v.clarificationQuestions=['入口没有定义，请改为已有区域或允许移动范围。'];}}});await f.sync();const r=await f.call('parse',{text:'靠近入口并舒服一些'});assert.equal(r.status,'NEEDS_CLARIFICATION');assert.equal(r.data.draftId,null);
});
test('B1C candidate recommendation uses genuine server metrics and confirmation revalidates the legal layout (MOCK)',async()=>{
  const f=fixture();await approved(f);const r=await f.call('recommend',{text:'推荐'});assert.equal(r.status,'SUCCESS');assert.deepEqual(r.data.selection,{regionId:'R1',canopyId:'R3'});assert.equal(r.data.metrics.minimum,1);assert.equal(r.data.baseline.minimum,.6);assert.equal(r.data.examined,6);
  assert.equal((await f.call('apply',{proposalId:r.data.proposalId,confirmed:false})).status,'VALIDATION_REJECTED');
  const applied=await f.call('apply',{proposalId:r.data.proposalId,confirmed:true});assert.equal(applied.status,'SUCCESS');assert.equal(applied.data.recomputed,true);assert.equal(applied.data.metrics.minimum,1);assert.deepEqual(f.session.snapshot().selection,selection);
  assert.equal((await f.call('apply',{proposalId:r.data.proposalId,confirmed:true})).status,'STALE_CONTEXT');
});
test('B1C forged candidate IDs, claimed percentages and unknown reply fields are rejected (MOCK)',async()=>{
  for(const patch of [{candidateId:'R2/arbitrary'},{minimum:1},{x:4},{summary:'保证全程达到99%'}]){const f=fixture({change:(v,t)=>{if(t.includes('TASK:RECOMMEND'))Object.assign(v,patch);}});await approved(f);assert.equal((await f.call('recommend',{text:'推荐'})).status,'INVALID_AI_RESPONSE');}
});
test('B1C infeasible frozen movement and target return explicit no-candidate without lowering the target',async()=>{
  const f=fixture({change:(v,t)=>{if(t.includes('TASK:PARSE'))v.movementMode='none';}});await f.sync();const p=await f.call('parse',{text:'两者都不能动，目标不降低'});await f.call('confirm-draft',{draftId:p.data.draftId,confirmed:true});
  f.session.update({constraints:{regionMovable:false,canopyMovable:false,minimumShade:.8}});f.session.acceptAnalysis(f.result);await f.sync();const before=f.calls;const r=await f.call('recommend',{text:'建议'});assert.equal(r.status,'NO_FEASIBLE_CANDIDATE');assert.equal(r.data.minimumShade,.8);assert.equal(f.calls,before);
});
test('B1C requests reject stale versions, reversed sequences, unknown inputs and forged geometry before AI calls',async()=>{
  const f=fixture();await f.sync();const old={...f.context};const before=f.calls;
  for(const patch of [{rate:1},{coordinates:[1,2,3]}])assert.equal((await f.call('parse',{text:'test',...patch})).status,'INVALID_INPUT');
  const bad={...f.session.snapshot(),sceneGeometryVersion:'forged'};assert.equal((await f.svc.handle('context',{sessionId:old.sessionId,revision:2,snapshot:bad,sampleIndex:0,pointIndex:null})).status,'INVALID_INPUT');
  await f.svc.handle('invalidate',{sessionId:old.sessionId,revision:3});
  assert.equal((await f.svc.handle('parse',{sessionId:old.sessionId,contextId:old.contextId,requestId:'ai-99',text:'test'})).status,'STALE_CONTEXT');assert.equal(f.calls,before);
});
test('B1C a recommendation cannot apply after a new analysis, changed permissions, or explicit rejection',async()=>{
  for(const mode of ['analysis','permission','reject']){const f=fixture();await approved(f);const r=await f.call('recommend',{text:'推荐'});assert.equal(r.status,'SUCCESS');
    if(mode==='reject'){assert.equal((await f.call('reject',{proposalId:r.data.proposalId})).status,'SUCCESS');}
    else {if(mode==='permission')f.session.update({constraints:{regionMovable:false,canopyMovable:true,minimumShade:.8}});f.session.acceptAnalysis(f.result);await f.sync();}
    assert.ok(['STALE_CONTEXT','VALIDATION_REJECTED'].includes((await f.call('apply',{proposalId:r.data.proposalId,confirmed:true})).status));
  }
});
test('B1C changed business inputs without increasing scene and analysis versions are rejected',async()=>{
  const f=fixture();await f.sync();const state={...f.session.snapshot(),height:0};
  const r=await f.svc.handle('context',{sessionId:f.context.sessionId,revision:2,snapshot:state,sampleIndex:0,pointIndex:null});assert.equal(r.status,'STALE_CONTEXT');
});
test('B1C server regenerates paired evidence and rejects forged, old, or contradictory references (MOCK)',async()=>{
  const period={...settings,startTime:'14:00',endTime:'14:15'};const f=fixture({initialSelection:{regionId:'R1',canopyId:'R3'},period});await f.sync(55);
  const e=pointEvidence(f.result,0,55,f.session.context());const refs=[e.ground.evidenceId,e.elevated.evidenceId];const r=await f.call('explain',{text:'为什么高度不同',evidenceRefs:refs});assert.equal(r.status,'SUCCESS');assert.equal(r.data.facts.ground.blockerId,'B1');assert.equal(r.data.facts.elevated.status,'direct');assert.deepEqual(r.data.ai.evidenceRefs,refs);
  assert.equal((await f.call('explain',{text:'test',evidenceRefs:['fake',refs[1]]})).status,'VALIDATION_REJECTED');f.session.observe();await f.sync(55);assert.equal((await f.call('explain',{text:'test',evidenceRefs:refs})).status,'STALE_CONTEXT');
  const bad=fixture({initialSelection:{regionId:'R1',canopyId:'R3'},period,change:(v,t)=>{if(t.includes('TASK:EXPLAIN'))v.evidenceRefs=['invented'];}});await bad.sync(55);const be=pointEvidence(bad.result,0,55,bad.session.context());assert.equal((await bad.call('explain',{text:'test',evidenceRefs:[be.ground.evidenceId,be.elevated.evidenceId]})).status,'INVALID_AI_RESPONSE');
});
test('B1C changing context while real transport is pending cannot return an applicable response (MOCK)',async()=>{
  let release,entered;const started=new Promise(r=>entered=r);
  const client={complete:async()=>{entered();await new Promise(r=>release=r);return {value:draft};}};
  const svc=createAiService({client});const f=fixture();const r=await svc.handle('context',{revision:1,snapshot:f.session.snapshot(),sampleIndex:0,pointIndex:null});const {sessionId,contextId}=r.data;
  const pending=svc.handle('parse',{sessionId,contextId,requestId:'ai-1',text:'输入'});await started;await svc.handle('invalidate',{sessionId,revision:2});release();assert.equal((await pending).status,'STALE_CONTEXT');
});
