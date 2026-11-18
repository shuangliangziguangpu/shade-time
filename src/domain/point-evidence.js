import { comparisonKey } from './candidates.js';

function validateContext(context) {
  if (!context || !['sceneVersion', 'analysisVersion', 'contextVersion'].every(key => Number.isSafeInteger(context[key]) && context[key] > 0) ||
      typeof context.analysisId !== 'string' || !context.analysisId) throw new TypeError('证据必须绑定有效场景、分析和观察版本');
}

function fingerprint(result, sampleIndex, context) {
  validateContext(context);
  const sample = result.samples[sampleIndex];
  if (!Number.isInteger(sampleIndex) || !sample) throw new RangeError('未知采样时刻');
  return JSON.stringify([context.sceneVersion, context.analysisVersion, context.analysisId, context.contextVersion,
    result.selection.regionId, result.selection.canopyId, comparisonKey(result, 1.5), sample.timestamp]);
}

export function pointEvidence(result, sampleIndex, pointIndex, context) {
  const contextKey = fingerprint(result, sampleIndex, context);
  const sample = result.samples[sampleIndex];
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= 100) throw new RangeError('采样点须为已定义的1–100号网格中心');
  if (sample.status !== 'valid' || !sample.analysis.ground || !sample.analysis.elevated) throw new RangeError('当前时刻没有有效双高度证据');
  const record = (reference, layer) => {
    const point = reference.samples[pointIndex];
    // A and B can share analysis/observation versions; the actual layout must distinguish their references.
    return Object.freeze({ evidenceId: `${context.analysisId}:${context.contextVersion}:${result.selection.regionId}/${result.selection.canopyId}:${sampleIndex}:${pointIndex}:${layer}`,
      origin: Object.freeze(point.point.toArray()), direction: Object.freeze(sample.analysis.sun.direction.toArray()),
      status: point.status, blockerId: point.blockerId ?? null,
      hit: point.hit ? Object.freeze(point.hit.toArray()) : null });
  };
  return Object.freeze({ pointNumber: pointIndex + 1, pointIndex, timestamp: sample.timestamp, sampleIndex,
    contextKey, selection: Object.freeze({ ...result.selection }),
    ground: record(sample.analysis.ground, 'ground'), elevated: record(sample.analysis.elevated, 'elevated') });
}

export function assertEvidenceCurrent(evidence, result, sampleIndex, context) {
  if (!evidence || evidence.contextKey !== fingerprint(result, sampleIndex, context)) throw new RangeError('空间证据已过期，请在当前上下文重新选择采样点');
  return true;
}
