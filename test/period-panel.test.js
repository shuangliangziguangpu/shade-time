import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSeries } from '../src/view/period-panel.js';
import { analyzePeriod } from '../src/domain/period.js';

const settings={date:'2026-06-21',startTime:'15:00',endTime:'15:20',intervalMinutes:15};
test('B1B curve uses real elapsed time so the final5min segment is one quarter of the full width',()=>{
  const result=analyzePeriod({regionId:'R3',canopyId:'R3'},settings);
  const series=chartSeries(result,1.5);
  assert.deepEqual(series.map(point=>point.x),[0,.75,1]);
  assert.equal(series[0].rate,.9);assert.equal(series.at(-1).timestamp,result.samples.at(-1).timestamp);
});
test('B1B invalid chart points remain explicit gaps rather than fabricated zero percentages',()=>{
  const result=analyzePeriod({regionId:'R3',canopyId:'R3'},{...settings,startTime:'04:45',endTime:'05:30'});
  const series=chartSeries(result,0);
  assert.equal(series.length,4);assert.equal(series[0].rate,null);assert.notEqual(series.at(-1).rate,null);
  assert.throws(()=>chartSeries(result,1),RangeError);
});
