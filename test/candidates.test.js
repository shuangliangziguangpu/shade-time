import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateCandidates, comparePeriods, comparisonKey, rankCandidates } from '../src/domain/candidates.js';
import { analyzePeriod } from '../src/domain/period.js';

const settings={date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15};
const base={regionId:'R3',canopyId:'R3'};

test('B1B region-only comparison keeps canopy, rejects corridor and ranks genuine interval results',()=>{
  const result=enumerateCandidates(base,settings,1.5,{regionMovable:true,canopyMovable:false,minimumShade:.8});
  assert.equal(result.status,'improved');assert.equal(result.examined,6);assert.equal(result.rejected.length,2);
  assert.equal(result.candidates.length,4);assert.equal(result.candidates[0].selection.regionId,'R1');
  assert.ok(result.candidates.every(item=>item.selection.canopyId==='R3'));
  assert.equal(result.candidates[0].metrics.minimum,1);assert.equal(result.current.elevated.minimum,.6);
  assert.equal(result.candidates[0].movedCount,1);assert.equal(result.candidates[0].qualified,true);
  assert.deepEqual(result.candidates[0].changes,[{object:'region',from:'R3',to:'R1'}]);
});
test('B1B canopy-only and both-movable modes honor finite IDs and current baseline',()=>{
  const only=enumerateCandidates(base,settings,1.5,{regionMovable:false,canopyMovable:true,minimumShade:0});
  assert.equal(only.examined,4);assert.ok(only.candidates.every(item=>item.selection.regionId==='R3'));
  const both=enumerateCandidates(base,settings,1.5,{regionMovable:true,canopyMovable:true,minimumShade:0});
  assert.equal(both.examined,24);assert.equal(both.rejected.length,8);assert.equal(both.candidates.length,16);
  assert.equal(new Set(both.candidates.map(item=>item.id)).size,16);
  for(const item of both.candidates)assert.ok(item.movedCount<=2);
});
test('B1B unavailable required times stop all normal rankings and infeasible constraints are explicit',()=>{
  const invalid=enumerateCandidates(base,{...settings,startTime:'04:45',endTime:'05:30'},1.5,{regionMovable:true,canopyMovable:true,minimumShade:.8});
  assert.equal(invalid.status,'unavailable');assert.equal(invalid.candidates.length,0);
  const noGoal=enumerateCandidates(base,settings,1.5,{regionMovable:false,canopyMovable:true,minimumShade:1});
  assert.equal(noGoal.status,'no-qualified-candidate');
  const locked=enumerateCandidates(base,settings,1.5,{regionMovable:false,canopyMovable:false,minimumShade:0});
  assert.equal(locked.status,'no-improvement');assert.equal(locked.candidates.length,1);
});
test('B1B sort uses unrounded minimum, average, moved count then fixed ID order',()=>{
  const make=(id,min,avg,moves)=>({id,selection:{regionId:id.slice(0,2),canopyId:id.slice(3)},metrics:{minimum:min,average:avg},movedCount:moves});
  const rows=[make('R4/R3',.8,.9,1),make('R1/R3',.8,.9,1),make('R3/R3',.8,.9,0),make('R6/R3',.800000001,.8,2),make('R3/R1',.8,.90000001,2)];
  assert.deepEqual(rankCandidates(rows).map(x=>x.id),['R6/R3','R3/R1','R3/R3','R1/R3','R4/R3']);
  assert.equal(rows[0].id,'R4/R3','sort must not mutate its input');
});
test('B1B A/B rejects every mismatch in reference height, date, period, sampling or model versions',()=>{
  const a=analyzePeriod(base,settings),b=analyzePeriod({regionId:'R1',canopyId:'R3'},settings);
  const pair=comparePeriods(a,b,1.5,1.5);
  assert.equal(pair.minimumDelta,.4);assert.ok(Math.abs(pair.averageDelta-.2375)<1e-14);
  assert.equal(comparisonKey(a,1.5),comparisonKey(b,1.5));
  assert.throws(()=>comparePeriods(a,b,0,1.5),/条件/);
  for(const patch of [{date:'2026-06-22'},{endTime:'15:45'},{intervalMinutes:30},{sceneGeometryVersion:'unknown'},{algorithmVersion:'changed'},{samplingVersion:'changed'},{timeZone:'UTC'},{latitude:0}]){
    const forged={...b,conditions:{...b.conditions,...patch}};
    assert.throws(()=>comparePeriods(a,forged,1.5,1.5),/条件/);
  }
  const night=analyzePeriod(base,{...settings,startTime:'00:00',endTime:'00:30'});
  assert.throws(()=>comparePeriods(night,night,1.5,1.5),/有效/);
});
test('B1B candidate entry rejects arbitrary geometry, unknown constraints and invalid target values',()=>{
  for(const constraints of [{regionMovable:true,canopyMovable:false,minimumShade:1.1},{regionMovable:'true',canopyMovable:false},{regionMovable:true,canopyMovable:false,x:1}])assert.throws(()=>enumerateCandidates(base,settings,1.5,constraints));
  assert.throws(()=>enumerateCandidates({...base,x:1},settings,1.5));
  assert.throws(()=>enumerateCandidates(base,settings,1));
});
