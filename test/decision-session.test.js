import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';
import { enumerateCandidates } from '../src/domain/candidates.js';

const selection={regionId:'R3',canopyId:'R3'};
const period={date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15};
const constraints={regionMovable:true,canopyMovable:false,minimumShade:.8};
const make=()=>{const session=createDecisionSession({selection,period,height:1.5,constraints});session.acceptAnalysis(analyzePeriod(selection,period));return session;};

test('B1B session snapshots are immutable and versions cannot regress after A-to-B-to-A',()=>{
  const session=make();const start=session.snapshot();
  assert.throws(()=>{start.selection.regionId='R1';},TypeError);
  session.update({selection:{regionId:'R1',canopyId:'R3'}});const middle=session.snapshot();
  session.update({selection});const end=session.snapshot();
  assert.ok(middle.sceneVersion>start.sceneVersion);assert.ok(end.sceneVersion>middle.sceneVersion);
  assert.equal(end.analysisId,null);assert.equal(end.selection.regionId,'R3');
  assert.throws(()=>session.update({selection:{...selection,x:1}}));assert.equal(session.snapshot().sceneVersion,end.sceneVersion);
});
test('B1B latest-request gate rejects reverse returns, forged tokens and stale scene/analysis/observation',()=>{
  const session=make();const older=session.beginRequest('candidates'),latest=session.beginRequest('candidates');
  assert.equal(session.isCurrent(older),false);assert.equal(session.isCurrent(latest),true);
  assert.equal(session.isCurrent({...latest,requestId:'fake'}),false);
  session.observe();assert.equal(session.isCurrent(latest),false);
  const next=session.beginRequest('explain');session.acceptAnalysis(analyzePeriod(selection,period));
  assert.equal(session.isCurrent(next),false);
});
test('B1B candidate references exist only in the current registered list and application recomputes',()=>{
  const session=make(),request=session.beginRequest('candidates');
  const result=enumerateCandidates(selection,period,1.5,constraints);
  const candidates=session.registerCandidates(request,result);
  assert.equal(candidates.length,4);assert.ok(candidates[0].candidateId.includes(request.requestId));
  assert.equal(session.resolveCandidate(candidates[0].candidateId).selection.regionId,'R1');
  assert.throws(()=>session.resolveCandidate('R2/R3'),/候选/);
  const before=session.snapshot().sceneVersion;
  const applied=session.applyCandidate(candidates[0].candidateId);
  assert.equal(applied.selection.regionId,'R1');assert.equal(applied.elevated.minimum,1);
  assert.ok(session.snapshot().sceneVersion>before);assert.equal(session.snapshot().selection.regionId,'R1');
  assert.throws(()=>session.resolveCandidate(candidates[0].candidateId),/过期|候选/);
});
test('B1B period, height and permission changes invalidate old comparisons and cannot apply a stale preview',()=>{
  for(const patch of [{height:0},{period:{...period,endTime:'15:45'}},{constraints:{...constraints,regionMovable:false,canopyMovable:true}}]){
    const session=make(),request=session.beginRequest('candidates');
    const list=session.registerCandidates(request,enumerateCandidates(selection,period,1.5,constraints));
    session.update(patch);
    assert.equal(session.isCurrent(request),false);assert.throws(()=>session.applyCandidate(list[0].candidateId),/过期|候选/);
  }
});
test('B1B session rejects inconsistent or tampered analysis and candidate envelopes',()=>{
  const session=make();
  const wrong=analyzePeriod({regionId:'R1',canopyId:'R3'},period);
  assert.throws(()=>session.acceptAnalysis(wrong),/条件|布局/);
  const request=session.beginRequest('candidates'),result=enumerateCandidates(selection,period,1.5,constraints);
  assert.throws(()=>session.registerCandidates(request,{...result,height:0}),/条件/);
  assert.throws(()=>session.registerCandidates(request,{...result,candidates:[{...result.candidates[0],selection:{regionId:'R2',canopyId:'R3'}}]}),/候选|布局/);
  assert.throws(()=>session.update({height:1}),RangeError);
});
test('B1B observation invalidates explanations but leaves numeric analysis and registered layout choices intact',()=>{
  const session=make(),request=session.beginRequest('candidates');
  const list=session.registerCandidates(request,enumerateCandidates(selection,period,1.5,constraints));
  const explanation=session.beginRequest('explain'),before=session.snapshot();
  session.observe();const after=session.snapshot();
  assert.equal(after.sceneVersion,before.sceneVersion);assert.equal(after.analysisVersion,before.analysisVersion);
  assert.equal(after.analysisId,before.analysisId);assert.ok(after.contextVersion>before.contextVersion);
  assert.equal(session.isCurrent(explanation),false);assert.equal(session.resolveCandidate(list[0].candidateId).selection.regionId,'R1');
});
test('B1B unqualified candidates can be inspected but cannot be confirmed under the active goal',()=>{
  const session=make(),request=session.beginRequest('candidates');
  const list=session.registerCandidates(request,enumerateCandidates(selection,period,1.5,constraints));
  const under=list.find(item=>!item.qualified);
  assert.ok(session.resolveCandidate(under.candidateId));
  assert.throws(()=>session.applyCandidate(under.candidateId),/目标/);
  assert.deepEqual(session.snapshot().selection,selection);
});
