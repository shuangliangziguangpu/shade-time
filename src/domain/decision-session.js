import { analyzePeriod, normalizePeriod, ANALYSIS_ALGORITHM_VERSION, SAMPLING_VERSION } from './period.js';
import { comparisonKey, comparePeriods, normalizeConstraints } from './candidates.js';
import { validateSelection, SCENE_CONFIG } from './scene-config.js';
import { inspectLayout } from './layout.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assertHeight = height => { if (height !== 0 && height !== 1.5) throw new RangeError('参考高度须为0或1.5米'); return height; };

export function createDecisionSession(initial) {
  let selection = validateSelection(initial.selection), period = normalizePeriod(initial.period);
  let height = assertHeight(initial.height), constraints = normalizeConstraints(initial.constraints);
  if (!inspectLayout(selection).validation.valid) throw new RangeError('初始布局非法');
  let sceneVersion = 1, analysisVersion = 0, contextVersion = 1, analysisId = null, analysis = null, requestCounter = 0;
  let registered = new Map(), registeredBase = null;
  const latest = new Map();
  const clearRegistered = () => { registered = new Map(); registeredBase = null; };
  const context = () => Object.freeze({ sceneVersion, analysisVersion, analysisId, contextVersion });
  const snapshot = () => Object.freeze({ ...context(), selection, period, height, constraints,
    sceneGeometryVersion: SCENE_CONFIG.version, algorithmVersion: ANALYSIS_ALGORITHM_VERSION, samplingVersion: SAMPLING_VERSION });
  function invalidate() {
    sceneVersion++; contextVersion++; analysisId = null; analysis = null; latest.clear(); clearRegistered();
  }
  function update(patch) {
    if (!patch || Object.getPrototypeOf(patch) !== Object.prototype || Reflect.ownKeys(patch).some(key => !['selection', 'period', 'height', 'constraints'].includes(key))) throw new TypeError('未知业务状态字段');
    const nextSelection = Object.hasOwn(patch, 'selection') ? validateSelection(patch.selection) : selection;
    const nextPeriod = Object.hasOwn(patch, 'period') ? normalizePeriod(patch.period) : period;
    const nextHeight = Object.hasOwn(patch, 'height') ? assertHeight(patch.height) : height;
    const nextConstraints = Object.hasOwn(patch, 'constraints') ? normalizeConstraints(patch.constraints) : constraints;
    if (!inspectLayout(nextSelection).validation.valid) throw new RangeError('布局非法');
    if (!same(selection, nextSelection) || !same(period, nextPeriod) || height !== nextHeight || !same(constraints, nextConstraints)) {
      selection = nextSelection; period = nextPeriod; height = nextHeight; constraints = nextConstraints; invalidate();
    }
    return snapshot();
  }
  function acceptAnalysis(result) {
    if (!result || !same(result.selection, selection) || !same(result.period, period) ||
        result.conditions.sceneGeometryVersion !== SCENE_CONFIG.version || result.conditions.algorithmVersion !== ANALYSIS_ALGORITHM_VERSION ||
        result.conditions.samplingVersion !== SAMPLING_VERSION) throw new RangeError('分析条件或布局不属于当前状态');
    analysis = result; analysisVersion++; contextVersion++; analysisId = `analysis-${sceneVersion}-${analysisVersion}`;
    latest.clear(); clearRegistered(); return context();
  }
  function beginRequest(purpose) {
    if (!analysisId || typeof purpose !== 'string' || !purpose.trim() || purpose.length > 40) throw new RangeError('请求需要当前分析和有效用途');
    const request = Object.freeze({ requestId: `request-${++requestCounter}`, baseVersion: sceneVersion, ...context(), purpose });
    latest.set(purpose, request); return request;
  }
  function isCurrent(request) {
    const expected = request && latest.get(request.purpose);
    return Boolean(expected && same(expected, request) && request.sceneVersion === sceneVersion && request.baseVersion === sceneVersion &&
      request.analysisVersion === analysisVersion && request.analysisId === analysisId && request.contextVersion === contextVersion);
  }
  function registerCandidates(request, result) {
    if (!isCurrent(request) || request.purpose !== 'candidates') throw new RangeError('候选请求已过期或逆序');
    if (!analysis || !same(result.current.selection, selection) || result.key !== comparisonKey(analysis, height) || result.height !== height ||
        !same(result.constraints, constraints)) throw new RangeError('候选条件与当前分析不一致');
    const next = new Map(), returned = [];
    for (const row of result.candidates) {
      const chosen = validateSelection(row.selection);
      if (row.id !== `${chosen.regionId}/${chosen.canopyId}` || !same(row.result.selection, chosen) ||
          !inspectLayout(chosen).validation.valid || !constraints.regionMovable && chosen.regionId !== selection.regionId ||
          !constraints.canopyMovable && chosen.canopyId !== selection.canopyId) throw new RangeError('候选布局、权限或ID无效');
      comparePeriods(analysis, row.result, height);
      const candidateId = `${request.requestId}:${row.id}`;
      if (next.has(candidateId)) throw new RangeError('重复候选ID');
      const stored = Object.freeze({ ...row, selection: chosen, candidateId });
      next.set(candidateId, stored); returned.push(stored);
    }
    registered = next;
    registeredBase = Object.freeze({ sceneVersion, analysisVersion, analysisId, key: result.key });
    return Object.freeze(returned);
  }
  function resolveCandidate(candidateId) {
    const row = registered.get(candidateId);
    if (!row || !registeredBase || registeredBase.sceneVersion !== sceneVersion || registeredBase.analysisVersion !== analysisVersion ||
        registeredBase.analysisId !== analysisId || !analysis || registeredBase.key !== comparisonKey(analysis, height)) throw new RangeError('未知候选或候选已过期，请重新比较');
    return row;
  }
  function applyCandidate(candidateId) {
    const row = resolveCandidate(candidateId);
    const verified = analyzePeriod(row.selection, period);
    comparePeriods(analysis, verified, height);
    const layer = height === 0 ? 'ground' : 'elevated';
    if (verified[layer].minimum < constraints.minimumShade) throw new RangeError('此候选未达到当前最低目标，不能确认为达标方案');
    update({ selection: row.selection }); acceptAnalysis(verified); return verified;
  }
  return Object.freeze({ snapshot, context, update, invalidate, acceptAnalysis, beginRequest, isCurrent, registerCandidates, resolveCandidate, applyCandidate,
    observe() { contextVersion++; return context(); } });
}
