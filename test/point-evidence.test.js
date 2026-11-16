import test from 'node:test';
import assert from 'node:assert/strict';
import { pointEvidence, assertEvidenceCurrent } from '../src/domain/point-evidence.js';
import { analyzePeriod } from '../src/domain/period.js';

const period=analyzePeriod({regionId:'R1',canopyId:'R3'},{date:'2026-06-21',startTime:'14:00',endTime:'14:15',intervalMinutes:15});
const context={sceneVersion:1,analysisVersion:1,analysisId:'analysis-1',contextVersion:1};
test('B1B paired evidence uses one horizontal sample at two exact heights and actual hits',()=>{
  const pair=pointEvidence(period,0,55,context);
  assert.deepEqual(pair.ground.origin.slice(0,1),pair.elevated.origin.slice(0,1));
  assert.equal(pair.ground.origin[2],pair.elevated.origin[2]);
  assert.equal(pair.ground.origin[1],0);assert.equal(pair.elevated.origin[1],1.5);
  assert.equal(pair.ground.status,'blocked');assert.equal(pair.ground.blockerId,'B1');
  assert.equal(pair.elevated.status,'direct');assert.equal(pair.elevated.blockerId,null);
  assert.equal(pair.elevated.hit,null);assert.ok(pair.ground.hit.every(Number.isFinite));
  assert.equal(pair.pointNumber,56);assert.equal(pair.timestamp,period.samples[0].timestamp);
  assert.ok(pair.ground.evidenceId!==pair.elevated.evidenceId);
});
test('B1B evidence rejects unknown point/sample indexes and unavailable analysis',()=>{
  for(const index of [-1,100,1.5,'55'])assert.throws(()=>pointEvidence(period,0,index,context));
  for(const index of [-1,2,0.5])assert.throws(()=>pointEvidence(period,index,55,context));
  const night=analyzePeriod({regionId:'R1',canopyId:'R3'},{date:'2026-06-21',startTime:'00:00',endTime:'00:30'});
  assert.throws(()=>pointEvidence(night,0,55,context));
});
test('B1B references expire after layout/time/analysis/observation change and A-to-B-to-A cannot revive them',()=>{
  const pair=pointEvidence(period,0,55,context);
  assert.equal(assertEvidenceCurrent(pair,period,0,context),true);
  for(const patch of [{sceneVersion:2},{analysisVersion:2},{analysisId:'analysis-2'},{contextVersion:2}])assert.throws(()=>assertEvidenceCurrent(pair,period,0,{...context,...patch}),/过期/);
  assert.throws(()=>assertEvidenceCurrent(pair,period,1,context),/过期/);
  const moved=analyzePeriod({regionId:'R4',canopyId:'R3'},period.period);
  assert.throws(()=>assertEvidenceCurrent(pair,moved,0,context),/过期/);
  assert.throws(()=>assertEvidenceCurrent(pair,period,0,{...context,sceneVersion:3}),/过期/);
});
