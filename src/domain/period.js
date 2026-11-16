import { analyzeCourtyard } from './analysis.js';
import { LOCATION, parseShanghaiDateTime } from '../core/sun.js';
import { SCENE_CONFIG, validateSelection } from './scene-config.js';

export const ANALYSIS_ALGORITHM_VERSION = 'ray-box-period-v1';
export const SAMPLING_VERSION = 'grid10-center-eps1e-4-v1';
export const SAMPLE_INTERVALS = Object.freeze([5, 10, 15, 30]);
const allowedFields = ['date', 'startTime', 'endTime', 'intervalMinutes', 'timeZone', 'durationMinutes'];

export function normalizePeriod(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).some(key => !allowedFields.includes(key))) throw new TypeError('时段只接受日期、同日开始/结束时间、采样间隔和时区');
  const { date, startTime, endTime, intervalMinutes = 15, timeZone = LOCATION.timeZone } = input;
  if (timeZone !== LOCATION.timeZone) throw new RangeError('时区必须为Asia/Shanghai');
  if (!SAMPLE_INTERVALS.includes(intervalMinutes)) throw new RangeError('采样间隔须为5、10、15或30分钟');
  const start = parseShanghaiDateTime(date, startTime).getTime();
  const end = parseShanghaiDateTime(date, endTime).getTime();
  const durationMinutes = (end - start) / 60_000;
  if (durationMinutes < 15 || durationMinutes > 120) throw new RangeError('活动须为同一日期内15–120分钟，结束晚于开始');
  if (Object.hasOwn(input, 'durationMinutes') && input.durationMinutes !== durationMinutes) throw new RangeError('时段长度与起止时间不一致');
  return Object.freeze({ date, startTime, endTime, intervalMinutes, timeZone, durationMinutes });
}

export function buildSampleTimes(input) {
  const period = normalizePeriod(input);
  const start = parseShanghaiDateTime(period.date, period.startTime).getTime();
  const end = parseShanghaiDateTime(period.date, period.endTime).getTime();
  const values = [];
  for (let time = start; time < end; time += period.intervalMinutes * 60_000) values.push(time);
  values.push(end);
  return values.map(epochMs => Object.freeze({
    epochMs,
    timestamp: new Date(epochMs).toISOString(),
    clock: new Date(epochMs + 8 * 3600_000).toISOString().slice(11, 16),
  }));
}

export function summarizeSeries(samples) {
  if (!Array.isArray(samples) || samples.length < 2) throw new RangeError('至少需要两个必要采样时刻');
  let previous = -Infinity;
  const times = samples.map(sample => {
    const time = Date.parse(sample.timestamp);
    if (typeof sample.timestamp !== 'string' || !sample.timestamp.endsWith('Z') || !Number.isFinite(time) || time <= previous) throw new RangeError('采样时间戳须显式UTC且严格递增');
    previous = time;
    if (sample.status === 'valid' && (!Number.isFinite(sample.rate) || sample.rate < 0 || sample.rate > 1)) throw new RangeError('有效遮阴率须为[0,1]有限值');
    return time;
  });
  const invalidTimes = samples.filter(sample => sample.status !== 'valid' || sample.validCount !== 100).map(sample => sample.timestamp);
  if (invalidTimes.length) return Object.freeze({ status: 'invalid-samples', average: null, minimum: null, minimumTimes: [], invalidTimes, sampleCount: samples.length });
  let area = 0;
  for (let index = 0; index < samples.length - 1; index++) {
    area += (times[index + 1] - times[index]) * (samples[index].rate + samples[index + 1].rate) / 2;
  }
  const minimum = Math.min(...samples.map(sample => sample.rate));
  return Object.freeze({ status: 'valid', average: area / (times.at(-1) - times[0]), minimum,
    minimumTimes: samples.filter(sample => sample.rate === minimum).map(sample => sample.timestamp),
    invalidTimes: [], sampleCount: samples.length });
}

export function analyzePeriod(selectionInput, periodInput) {
  const selection = validateSelection(selectionInput);
  const period = normalizePeriod(periodInput);
  const samples = buildSampleTimes(period).map(time => {
    const analysis = analyzeCourtyard(selection, new Date(time.timestamp));
    const count = reference => reference?.samples.filter(point => point.status === 'blocked' || point.status === 'direct').length ?? 0;
    return Object.freeze({ ...time, status: analysis.status, sunAltitude: analysis.sun.altitude,
      compassAzimuth: ((analysis.sun.azimuth * 180 / Math.PI + 540) % 360),
      groundValidCount: count(analysis.ground), elevatedValidCount: count(analysis.elevated), analysis });
  });
  const aggregate = layer => summarizeSeries(samples.map(sample => ({
    timestamp: sample.timestamp, status: sample.status,
    rate: sample.analysis[layer]?.rate ?? null,
    validCount: layer === 'ground' ? sample.groundValidCount : sample.elevatedValidCount,
  })));
  const ground = aggregate('ground'), elevated = aggregate('elevated');
  const status = samples.some(sample => sample.status === 'invalid-layout') ? 'invalid-layout'
    : ground.status === 'valid' && elevated.status === 'valid' ? 'valid' : 'invalid-samples';
  const conditions = Object.freeze({ ...period, sceneGeometryVersion: SCENE_CONFIG.version,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSION, samplingVersion: SAMPLING_VERSION,
    latitude: LOCATION.latitude, longitude: LOCATION.longitude });
  return Object.freeze({ status, selection, period, conditions, samples: Object.freeze(samples), ground, elevated });
}
