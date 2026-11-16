import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeSceneFile, parseSceneFile } from '../src/domain/scene-file.js';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';
import { createAiWorkflow } from '../src/view/ai-workflow.js';

const initial={selection:{regionId:'R3',canopyId:'R3'},period:{date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15,timeZone:'Asia/Shanghai'},height:1.5,constraints:{regionMovable:true,canopyMovable:false,minimumShade:.8}};
const snapshot=()=>{const s=createDecisionSession(initial);s.acceptAnalysis(analyzePeriod(initial.selection,initial.period));return s.snapshot();};
const document=()=>JSON.parse(serializeSceneFile(snapshot()));

test('B1D export includes only confirmed task inputs and explicit supported versions, never cached facts or credentials',()=>{
  const input={...snapshot(),rate:.99,candidates:[{rank:1}],hit:{id:'fake'},sessionId:'private-session',apiKey:'sensitive-placeholder',previewSelection:{regionId:'R1',canopyId:'R3'}};
  const data=JSON.parse(serializeSceneFile(input));
  assert.equal(data.project,'ShadeTime');assert.equal(data.schemaVersion,1);assert.equal(data.sceneGeometryVersion,'courtyard-v1');
  assert.deepEqual(data.task.selection,{regionId:'R3',canopyId:'R3'});assert.equal(data.task.height,1.5);assert.equal(data.task.period.timeZone,'Asia/Shanghai');assert.equal(data.task.constraints.minimumShade,.8);
  const output=JSON.stringify(data);for(const word of ['rate','candidates','hit','sessionId','analysisId','contextVersion','apiKey','private-session','sensitive-placeholder','previewSelection'])assert.ok(!output.includes(word),word);
});
test('B1D save and reopen in a new decision session reproduces both true period results',()=>{
  const task=parseSceneFile(serializeSceneFile(snapshot()));const reopened=createDecisionSession(task);const result=analyzePeriod(task.selection,task.period);reopened.acceptAnalysis(result);
  assert.deepEqual(task.selection,initial.selection);assert.equal(task.period.durationMinutes,60);assert.equal(task.height,1.5);
  assert.ok(Math.abs(result.elevated.average-.7625)<1e-12);assert.equal(result.elevated.minimum,.6);assert.ok(Math.abs(result.ground.average-.05)<1e-12);assert.equal(result.ground.minimum,0);
});
test('B1D tampered cached rates, ranking, rays and capabilities are rejected at every schema boundary',()=>{
  for(const key of ['rate','ground','analysisId','sessionId','candidateId','apiKey','__proto__']){const data=document();Object.defineProperty(data,key,{value:'forged',enumerable:true});assert.throws(()=>parseSceneFile(JSON.stringify(data)),{code:'INVALID_FILE'});}
  for(const patch of [{taskKey:'rate',value:1},{taskKey:'evidenceRefs',value:['forged']}]){const data=document();data.task[patch.taskKey]=patch.value;assert.throws(()=>parseSceneFile(JSON.stringify(data)),{code:'INVALID_FILE'});}
  const data=document();data.task.selection.x=4;assert.throws(()=>parseSceneFile(JSON.stringify(data)));
});
test('B1D old or unknown schema, geometry, algorithm and sampling versions require an explicit unsupported-version error',()=>{
  for(const patch of [{schemaVersion:0},{schemaVersion:2},{sceneGeometryVersion:'courtyard-v0'},{algorithmVersion:'unknown'},{samplingVersion:'unknown'}])assert.throws(()=>parseSceneFile(JSON.stringify({...document(),...patch})),{code:'UNSUPPORTED_VERSION'});
});
test('B1D corrupted JSON, oversized files, missing fields and foreign project files are safely rejected',()=>{
  for(const input of ['', '{oops','[]','null','"text"'])assert.throws(()=>parseSceneFile(input));
  assert.throws(()=>parseSceneFile(' '.repeat(17000)),{code:'FILE_TOO_LARGE'});
  const missing=document();delete missing.task.height;assert.throws(()=>parseSceneFile(JSON.stringify(missing)),{code:'INVALID_FILE'});
  assert.throws(()=>parseSceneFile(JSON.stringify({...document(),project:'AnotherProject'})),{code:'INVALID_FILE'});
});
test('B1D unknown IDs, corridor regions, arbitrary coordinates and illegal task settings cannot be restored',()=>{
  for(const selection of [{regionId:'R2',canopyId:'R3'},{regionId:'R5',canopyId:'R3'},{regionId:'made-up',canopyId:'R3'},{regionId:'R1',canopyId:'R2'}]){const data=document();data.task.selection=selection;assert.throws(()=>parseSceneFile(JSON.stringify(data)));}
  for(const patch of [{height:2},{height:'1.5'},{constraints:{regionMovable:'yes',canopyMovable:false,minimumShade:.8}},{constraints:{regionMovable:true,canopyMovable:false,minimumShade:1.01}}]){const data=document();Object.assign(data.task,patch);assert.throws(()=>parseSceneFile(JSON.stringify(data)));}
});
test('B1D invalid dates, crossing midnight, timezone and steps cannot bypass the frozen period rules',()=>{
  for(const patch of [{date:'2026-02-29'},{startTime:'23:30',endTime:'00:30'},{timeZone:'UTC'},{startTime:'15:01'},{intervalMinutes:7},{endTime:'17:05'}]){const data=document();Object.assign(data.task.period,patch);assert.throws(()=>parseSceneFile(JSON.stringify(data)));}
});
test('B1D legal night tasks and the ground reference restore as N/A, never fabricated normal rates',()=>{
  const data=document();data.task.period.startTime='00:00';data.task.period.endTime='00:30';data.task.height=0;
  const task=parseSceneFile(JSON.stringify(data));const result=analyzePeriod(task.selection,task.period);assert.equal(task.height,0);assert.equal(result.status,'invalid-samples');assert.equal(result.ground.average,null);assert.equal(result.elevated.minimum,null);
});
test('B1D export validates its canonical input and parsing creates an independent, normalized task',()=>{
  assert.throws(()=>serializeSceneFile({...snapshot(),selection:{regionId:'R2',canopyId:'R3'}}));
  const text=serializeSceneFile(snapshot());const restored=parseSceneFile(text);assert.deepEqual(JSON.parse(serializeSceneFile(restored)),JSON.parse(text));
  const second=parseSceneFile(text);assert.notEqual(second,restored);assert.notEqual(second.selection,restored.selection);
});
test('B1D reset forgets all AI draft/session capabilities even when task inputs remain identical',async()=>{
  const sent=[];let calls=0;
  const workflow=createAiWorkflow({getContext:()=>({snapshot:snapshot(),sampleIndex:0,pointIndex:null,evidenceRefs:[],previewId:null}),send:async(action,body)=>{sent.push({action,body});if(action==='context')return {status:'SUCCESS',data:{sessionId:`session-${++calls}`,contextId:`context-${calls}`}};if(action==='invalidate')return {status:'SUCCESS'};return {status:'SUCCESS',data:{draftId:'old-draft',draft:{summary:'草案'}}};},applyDraft:()=>{},preview:()=>{},apply:()=>{},restore:()=>{}});
  await workflow.parse('活动需求');assert.equal(workflow.state().status,'WAITING_DRAFT_CONFIRMATION');workflow.reset();assert.equal(workflow.state().status,'IDLE');assert.equal(workflow.state().draft,null);assert.equal(workflow.state().approved,false);
  await workflow.parse('重新解析');const contexts=sent.filter(x=>x.action==='context');assert.equal(contexts.length,2);assert.equal(contexts[1].body.sessionId,null);assert.ok(sent.some(x=>x.action==='invalidate'&&x.body.sessionId==='session-1'));
});
test('B1D import reset discards late AI replies even if transport ignores cancellation',async()=>{
  let release,entered;const started=new Promise(resolve=>entered=resolve);
  const state=snapshot();
  const workflow=createAiWorkflow({getContext:()=>({snapshot:state,sampleIndex:0,pointIndex:null,evidenceRefs:[],previewId:null}),send:async action=>{
    if(action==='context')return {status:'SUCCESS',data:{sessionId:'before-import',contextId:'old-context'}};
    if(action==='invalidate')return {status:'SUCCESS'};
    entered();await new Promise(resolve=>release=resolve);return {status:'SUCCESS',data:{draftId:'late-draft',draft:{summary:'不得恢复'}}};
  },applyDraft:()=>assert.fail('No old draft may be applied'),preview:()=>{},apply:()=>{},restore:()=>{}});
  const request=workflow.parse('导入之前的请求');await started;workflow.reset();release();await request;
  assert.equal(workflow.state().status,'IDLE');assert.equal(workflow.state().draft,null);assert.equal(workflow.state().requestId,null);
});
