import { comparePeriods } from '../domain/candidates.js';
import { percentage } from './period-panel.js';

export function renderCandidatePanel(comparison, preview, height, shown = 'A', durationMs = null) {
  const $ = id => document.getElementById(id);
  const body = $('candidate-rows');
  body.replaceChildren();
  const buttonState = !preview;
  for (const id of ['show-a', 'show-b', 'apply-candidate', 'reject-candidate']) $(id).disabled = buttonState;
  $('apply-candidate').disabled = !preview || !preview.qualified;
  $('show-a').setAttribute('aria-pressed', String(shown === 'A'));
  $('show-b').setAttribute('aria-pressed', String(shown === 'B'));
  $('comparison-delta').textContent = '';
  $('ab-status').textContent = 'A · 当前已确认布局';
  if (!comparison) {
    $('candidate-status').textContent = '调整移动权限和目标，再比较当前有限候选。条件变化会使旧预览失效。';
    return;
  }
  const names = { unavailable: '必要采样无效，整段排名不可用', 'no-qualified-candidate': '当前有限候选中没有达到目标的方案',
    'no-improvement': '存在合法候选，但没有更好的达标结果', improved: '找到可验证的改善方案', tradeoff: '找到有取舍的改善，需核对两个指标' };
  $('candidate-status').textContent = `${names[comparison.status]}。检查${comparison.examined}组，合法${comparison.candidates.length}组，拒绝${comparison.rejected.length}组。参考高度${height}米${durationMs === null ? '' : `，本次计算${durationMs.toFixed(1)}ms`}。`;
  for (const [index, candidate] of comparison.candidates.entries()) {
    const row = document.createElement('tr');
    const changes = candidate.changes.map(change => `${change.object === 'region' ? '区域' : '棚'} ${change.from}→${change.to}`).join('；') || '原位置';
    for (const text of [String(index + 1), `${candidate.selection.regionId} / ${candidate.selection.canopyId}`,
      percentage(candidate.metrics.minimum), percentage(candidate.metrics.average), `${candidate.movedCount}个 · ${changes}`, candidate.qualified ? '达标' : '未达标']) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    const cell = document.createElement('td'), button = document.createElement('button');
    button.type = 'button'; button.dataset.candidateId = candidate.candidateId ?? candidate.id; button.textContent = '预览';
    button.setAttribute('aria-label', `预览 ${candidate.selection.regionId} / ${candidate.selection.canopyId}`);
    cell.append(button); row.append(cell); body.append(row);
  }
  if (preview) {
    const pair = comparePeriods(comparison.current, preview.result, height);
    const points = value => `${value > 0 ? '+' : ''}${Number((value * 100).toFixed(2))}个百分点`;
    $('ab-status').textContent = shown === 'B' ? `B · 预览 ${preview.selection.regionId} / ${preview.selection.canopyId}，尚未应用`
      : `A · 当前 ${comparison.current.selection.regionId} / ${comparison.current.selection.canopyId}，B预览已保留`;
    $('comparison-delta').textContent = `同条件A/B：最低 ${percentage(pair.before.minimum)}→${percentage(pair.after.minimum)}（${points(pair.minimumDelta)}）；平均 ${percentage(pair.before.average)}→${percentage(pair.after.average)}（${points(pair.averageDelta)}）。绿色为当前视图，金色为对照。`;
  }
}
