import { analyzePeriod, normalizePeriod } from './period.js';
import { SCENE_CONFIG, validateSelection } from './scene-config.js';
import { inspectLayout } from './layout.js';

export function normalizeConstraints(input = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).some(key => !['regionMovable', 'canopyMovable', 'minimumShade'].includes(key))) throw new TypeError('约束仅接受区域/棚是否可动及最低采样遮阴目标');
  const { regionMovable = true, canopyMovable = true, minimumShade = 0 } = input;
  if (typeof regionMovable !== 'boolean' || typeof canopyMovable !== 'boolean' || !Number.isFinite(minimumShade) || minimumShade < 0 || minimumShade > 1) throw new RangeError('移动权限须为布尔值，最低目标须为0–100%');
  return Object.freeze({ regionMovable, canopyMovable, minimumShade });
}

const conditionFields = ['date', 'startTime', 'endTime', 'intervalMinutes', 'timeZone', 'durationMinutes',
  'sceneGeometryVersion', 'algorithmVersion', 'samplingVersion', 'latitude', 'longitude'];

export function comparisonKey(result, height) {
  if (height !== 0 && height !== 1.5) throw new RangeError('参考高度须为0或1.5米');
  return JSON.stringify([...conditionFields.map(field => result.conditions[field]), height]);
}

export function comparePeriods(a, b, aHeight, bHeight = aHeight) {
  if (comparisonKey(a, aHeight) !== comparisonKey(b, bHeight)) throw new RangeError('A/B条件不一致，禁止直接比较');
  if (a.status !== 'valid' || b.status !== 'valid') throw new RangeError('A/B必须均为完整有效时段');
  const layer = aHeight === 0 ? 'ground' : 'elevated';
  return Object.freeze({ before: a[layer], after: b[layer], minimumDelta: b[layer].minimum - a[layer].minimum,
    averageDelta: b[layer].average - a[layer].average, key: comparisonKey(a, aHeight) });
}

function order(a, b) {
  return b.metrics.minimum - a.metrics.minimum || b.metrics.average - a.metrics.average || a.movedCount - b.movedCount ||
    SCENE_CONFIG.positions.findIndex(item => item.id === a.selection.regionId) - SCENE_CONFIG.positions.findIndex(item => item.id === b.selection.regionId) ||
    SCENE_CONFIG.canopyPositionIds.indexOf(a.selection.canopyId) - SCENE_CONFIG.canopyPositionIds.indexOf(b.selection.canopyId);
}

export function rankCandidates(candidates) {
  return [...candidates].sort(order);
}

export function enumerateCandidates(baseInput, periodInput, height = 1.5, constraintInput = {}) {
  const base = validateSelection(baseInput), period = normalizePeriod(periodInput), constraints = normalizeConstraints(constraintInput);
  const current = analyzePeriod(base, period);
  const key = comparisonKey(current, height);
  const layer = height === 0 ? 'ground' : 'elevated';
  if (current.status !== 'valid') return Object.freeze({ status: 'unavailable', current, key, constraints, height, candidates: [], rejected: [], examined: 0 });
  const regions = constraints.regionMovable ? SCENE_CONFIG.positions.map(item => item.id) : [base.regionId];
  const canopies = constraints.canopyMovable ? SCENE_CONFIG.canopyPositionIds : [base.canopyId];
  const candidates = [], rejected = [];
  for (const regionId of regions) for (const canopyId of canopies) {
    const selection = Object.freeze({ regionId, canopyId });
    const { validation } = inspectLayout(selection);
    if (!validation.valid) { rejected.push({ selection, reasons: validation.violations }); continue; }
    const result = regionId === base.regionId && canopyId === base.canopyId ? current : analyzePeriod(selection, period);
    if (result.status !== 'valid') return Object.freeze({ status: 'unavailable', current, key, constraints, height, candidates: [], rejected, examined: regions.length * canopies.length });
    const changes = [];
    if (regionId !== base.regionId) changes.push({ object: 'region', from: base.regionId, to: regionId });
    if (canopyId !== base.canopyId) changes.push({ object: 'canopy', from: base.canopyId, to: canopyId });
    candidates.push(Object.freeze({ id: `${regionId}/${canopyId}`, selection, result, metrics: result[layer],
      movedCount: changes.length, changes: Object.freeze(changes), qualified: result[layer].minimum >= constraints.minimumShade }));
  }
  const ranked = rankCandidates(candidates);
  const best = ranked.find(candidate => candidate.qualified);
  let status = 'no-qualified-candidate';
  if (best) {
    const delta = comparePeriods(current, best.result, height);
    status = delta.minimumDelta > 0 || delta.minimumDelta === 0 && delta.averageDelta > 0 ? 'improved' : 'no-improvement';
    if (delta.minimumDelta > 0 && delta.averageDelta < 0) status = 'tradeoff';
  }
  return Object.freeze({ status, current, key, constraints, height, candidates: Object.freeze(ranked),
    rejected: Object.freeze(rejected), examined: regions.length * canopies.length });
}
