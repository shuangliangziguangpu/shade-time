import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { normalizePeriod, buildSampleTimes, summarizeSeries, analyzePeriod } from '../src/domain/period.js';
import { analyzeCourtyard } from '../src/domain/analysis.js';
import { parseShanghaiDateTime } from '../src/core/sun.js';

const settings = {date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15};
const selection = {regionId:'R3',canopyId:'R3'};
const series = (minutes,rates) => minutes.map((minute,index)=>({timestamp:new Date(Date.UTC(2026,5,21,7,minute)).toISOString(),status:'valid',rate:rates[index],validCount:100}));

test('B1B period sequence includes start and end at explicit Shanghai instants',()=>{
  const samples=buildSampleTimes(settings);
  assert.deepEqual(samples.map(sample=>sample.clock),['15:00','15:15','15:30','15:45','16:00']);
  assert.equal(samples[0].timestamp,'2026-06-21T07:00:00.000Z');
  assert.equal(samples.at(-1).timestamp,'2026-06-21T08:00:00.000Z');
});
test('B1B partial final segments and different sampling intervals include endpoint exactly once',()=>{
  assert.deepEqual(buildSampleTimes({...settings,endTime:'15:20'}).map(x=>x.clock),['15:00','15:15','15:20']);
  assert.deepEqual(buildSampleTimes({...settings,endTime:'15:20',intervalMinutes:10}).map(x=>x.clock),['15:00','15:10','15:20']);
  assert.equal(buildSampleTimes({...settings,intervalMinutes:5}).length,13);
  assert.deepEqual(buildSampleTimes({...settings,intervalMinutes:30}).map(x=>x.clock),['15:00','15:30','16:00']);
});
test('B1B frozen five-value trapezoid regression yields 76.25%, minimum60% at16:00',()=>{
  const result=summarizeSeries(series([0,15,30,45,60],[.9,.8,.8,.7,.6]));
  assert.ok(Math.abs(result.average-.7625)<1e-14);
  assert.equal(result.minimum,.6);
  assert.deepEqual(result.minimumTimes,['2026-06-21T08:00:00.000Z']);
});
test('B1B trapezoid weights the 5-minute final segment and handles zero/full/tied minimum',()=>{
  assert.equal(summarizeSeries(series([0,15,20],[0,1,1])).average,.625);
  for(const rate of [0,.6,1]){
    const result=summarizeSeries(series([0,15,20],[rate,rate,rate]));
    assert.ok(Math.abs(result.average-rate)<1e-14);assert.equal(result.minimum,rate);assert.equal(result.minimumTimes.length,3);
  }
});
test('B1B one invalid necessary sample makes full-period metrics unavailable without shrinking samples',()=>{
  const input=series([0,15,30],[.5,.6,.7]);input[1]={...input[1],status:'low-altitude',rate:null,validCount:0};
  const result=summarizeSeries(input);
  assert.equal(result.status,'invalid-samples');assert.equal(result.average,null);assert.equal(result.minimum,null);assert.equal(result.sampleCount,3);
  const incomplete=series([0,15],[.5,.6]);incomplete[0].validCount=99;
  assert.equal(summarizeSeries(incomplete).status,'invalid-samples');
});
test('B1B series rejects nonmonotone timestamps, malformed rates and insufficient points',()=>{
  assert.throws(()=>summarizeSeries([]));assert.throws(()=>summarizeSeries(series([0],[.5])));
  assert.throws(()=>summarizeSeries(series([0,0],[.5,.6])));
  assert.throws(()=>summarizeSeries(series([15,0],[.5,.6])));
  for(const rate of [-.1,1.1,NaN])assert.throws(()=>summarizeSeries(series([0,15],[rate,.5])));
});
test('B1B period rejects crossing dates, invalid dates/steps/timezone and outside15–120min',()=>{
  for(const patch of [{startTime:'23:30',endTime:'00:30'},{startTime:'15:00',endTime:'15:00'},{endTime:'15:10'},{endTime:'17:05'},{date:'2026-02-29'},{startTime:'15:01'},{timeZone:'UTC'},{intervalMinutes:0},{intervalMinutes:7},{endDate:'2026-06-22'}])assert.throws(()=>normalizePeriod({...settings,...patch}),JSON.stringify(patch));
  assert.equal(normalizePeriod({...settings,endTime:'17:00'}).durationMinutes,120);
  assert.equal(buildSampleTimes({...settings,date:'2024-02-29',startTime:'00:00',endTime:'00:15'})[0].timestamp,'2024-02-28T16:00:00.000Z');
});
test('B1B actual period preserves every single-time result and both reference layers',()=>{
  const result=analyzePeriod(selection,settings);
  assert.equal(result.status,'valid');assert.equal(result.samples.length,5);
  assert.deepEqual(result.samples.map(x=>x.analysis.elevated.rate),[.9,.8,.8,.7,.6]);
  assert.ok(Math.abs(result.elevated.average-.7625)<1e-14);assert.equal(result.elevated.minimum,.6);
  assert.notEqual(result.ground.average,result.elevated.average);
  for(const sample of result.samples){
    const expected=analyzeCourtyard(selection,new Date(sample.timestamp));
    assert.equal(sample.status,expected.status);assert.equal(sample.sunAltitude,expected.sun.altitude);
    assert.equal(sample.analysis.ground.rate,expected.ground.rate);assert.equal(sample.analysis.elevated.rate,expected.elevated.rate);
    assert.equal(sample.groundValidCount,100);assert.equal(sample.elevatedValidCount,100);
    assert.equal(sample.analysis.ground.samples.length,100);assert.equal(sample.analysis.elevated.samples.length,100);
  }
});
test('B1B night, mixed-validity dawn and invalid layout keep all samples but suppress aggregates',()=>{
  for(const period of [{...settings,startTime:'00:00',endTime:'00:30'},{...settings,startTime:'04:45',endTime:'05:30'}]){
    const result=analyzePeriod(selection,period);
    assert.notEqual(result.status,'valid');assert.equal(result.ground.average,null);assert.equal(result.elevated.minimum,null);
    assert.equal(result.samples.length,buildSampleTimes(period).length);
  }
  const bad=analyzePeriod({regionId:'R2',canopyId:'R3'},settings);
  assert.equal(bad.status,'invalid-layout');assert.equal(bad.ground.average,null);
});
test('B1B period is independent of the host timezone',()=>{
  const moduleUrl=new URL('../src/domain/period.js',import.meta.url).href;
  const code=`import {buildSampleTimes} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(buildSampleTimes(${JSON.stringify(settings)})));`;
  const outputs=['UTC','Asia/Shanghai','America/Los_Angeles'].map(TZ=>execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8'}));
  assert.equal(outputs[0],outputs[1]);assert.equal(outputs[1],outputs[2]);
});
