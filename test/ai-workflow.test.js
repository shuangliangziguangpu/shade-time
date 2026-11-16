import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiWorkflow } from '../src/view/ai-workflow.js';

function harness(override={}){
  let context={snapshot:{selection:{regionId:'R3',canopyId:'R3'},period:{date:'2026-06-21'},height:1.5,constraints:{minimumShade:.8},sceneVersion:1,analysisVersion:1,analysisId:'analysis-1-1',contextVersion:1},sampleIndex:0,pointIndex:null,evidenceRefs:[],previewId:null};
  let applied=0,previewed=0,restored=0,confirmed=0;const sent=[];
  const send=async(action,body)=>{sent.push({action,body});if(action==='context')return {status:'SUCCESS',data:{sessionId:'session',contextId:'context'}};return {status:'SUCCESS',contextId:'context',data:action==='parse'?{draftId:'draft',draft:{summary:'草案'}}:action==='confirm-draft'?{draft:{}}:action==='recommend'?{proposalId:'proposal',selection:{regionId:'R1',canopyId:'R3'},metrics:{minimum:1,average:1}}:{selection:{regionId:'R1',canopyId:'R3'},metrics:{minimum:1,average:1}}};};
  const workflow=createAiWorkflow({getContext:()=>context,send,applyDraft:()=>{confirmed++;},preview:()=>{previewed++;context={...context,previewId:'local-id',snapshot:{...context.snapshot,contextVersion:2}};return 'local-id';},apply:()=>{applied++;},restore:()=>{restored++;},...override});
  return {workflow,sent,change:patch=>{context={...context,snapshot:{...context.snapshot,...patch}};workflow.contextChanged();},get applied(){return applied;},get previewed(){return previewed;},get restored(){return restored;},get confirmed(){return confirmed;}};
}
test('B1C frontend draft never mutates scene; only explicit draft and proposal confirmations invoke bridges',async()=>{
  const h=harness();await h.workflow.parse('需求');assert.equal(h.confirmed,0);assert.equal(h.applied,0);assert.equal(h.workflow.state().status,'WAITING_DRAFT_CONFIRMATION');
  await h.workflow.confirmDraft();assert.equal(h.confirmed,1);await h.workflow.recommend('已确认需求');assert.equal(h.applied,0);assert.equal(h.previewed,0);h.workflow.preview();assert.equal(h.previewed,1);assert.equal(h.applied,0);await h.workflow.apply();assert.equal(h.applied,1);assert.equal(h.workflow.state().status,'APPLIED');
});
test('B1C rejecting an AI preview restores A and never applies it',async()=>{
  const h=harness();await h.workflow.parse('需求');await h.workflow.confirmDraft();await h.workflow.recommend('建议');h.workflow.preview();await h.workflow.reject();assert.equal(h.applied,0);assert.equal(h.restored,1);assert.equal(h.workflow.state().proposal,null);
});
test('B1C an applied layout acknowledgement survives a later observation-only refresh',async()=>{
  const h=harness();await h.workflow.parse('需求');await h.workflow.confirmDraft();await h.workflow.recommend('建议');h.workflow.preview();await h.workflow.apply();
  h.change({contextVersion:3});assert.equal(h.workflow.state().status,'APPLIED');assert.equal(h.applied,1);
  h.change({analysisVersion:2,analysisId:'analysis-1-2'});assert.equal(h.workflow.state().status,'STALE_CONTEXT');
});
test('B1C changing analysis invalidates old AI results and blocks confirmation',async()=>{
  const h=harness();await h.workflow.parse('需求');h.change({analysisVersion:2,analysisId:'analysis-1-2'});await h.workflow.confirmDraft();assert.equal(h.confirmed,0);assert.equal(h.applied,0);assert.equal(h.workflow.state().draft,null);
});
test('B1C AI timeout leaves manual bridges untouched and reports its actual failure status',async()=>{
  const h=harness({send:async action=>action==='context'?{status:'SUCCESS',data:{sessionId:'s',contextId:'c'}}:{status:'AI_TIMEOUT'}});await h.workflow.parse('需求');assert.equal(h.workflow.state().status,'AI_TIMEOUT');assert.equal(h.confirmed,0);assert.equal(h.applied,0);assert.equal(h.previewed,0);
});
test('B1C late AI response after a local context change is discarded even when transport ignores abort',async()=>{
  let release,entered;const started=new Promise(r=>entered=r);const h=harness({send:async action=>{if(action==='context')return {status:'SUCCESS',data:{sessionId:'s',contextId:'c'}};if(action==='invalidate')return {status:'SUCCESS'};entered();await new Promise(r=>release=r);return {status:'SUCCESS',data:{draftId:'old',draft:{}}};}});
  const pending=h.workflow.parse('需求');await started;h.change({contextVersion:2});release();await pending;assert.equal(h.workflow.state().draft,null);assert.equal(h.workflow.state().status,'STALE_CONTEXT');assert.equal(h.confirmed,0);
});
test('B1C expired server sessions can be recreated only through a fresh request, never reused for application',async()=>{
  let restarted=false;const h=harness({send:async(action,body)=>{if(action==='context'){if(restarted&&body.sessionId)return {status:'STALE_CONTEXT'};return {status:'SUCCESS',data:{sessionId:restarted?'fresh':'old',contextId:'context'}};}return {status:'SUCCESS',data:{draftId:'fresh-draft',draft:{summary:'新草案'}}};}});
  await h.workflow.parse('第一份需求');restarted=true;h.change({analysisVersion:2,analysisId:'analysis-1-2'});await h.workflow.parse('需求');assert.equal(h.workflow.state().status,'STALE_CONTEXT');await h.workflow.parse('重新解析');assert.equal(h.workflow.state().status,'WAITING_DRAFT_CONFIRMATION');assert.equal(h.confirmed,0);assert.equal(h.applied,0);
});
