export function chartSeries(result, height) {
  if (height !== 0 && height !== 1.5) throw new RangeError('参考高度须为0或1.5米');
  const start = result.samples[0].epochMs, span = result.samples.at(-1).epochMs - start;
  const layer = height === 0 ? 'ground' : 'elevated';
  return result.samples.map(sample => ({
    timestamp: sample.timestamp, clock: sample.clock, x: (sample.epochMs - start) / span,
    rate: sample.status === 'valid' ? sample.analysis[layer].rate : null,
  }));
}

export const percentage = value => value === null || value === undefined ? 'N/A' : `${Number((value * 100).toFixed(2))}%`;
export const localClock = timestamp => new Date(Date.parse(timestamp) + 8 * 3600_000).toISOString().slice(11, 16);

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

export function renderPeriodPanel(result, height, selectedIndex, alternative = null) {
  const $ = id => document.getElementById(id);
  if (!result) {
    for (const id of ['period-average', 'period-minimum', 'minimum-time']) $(id).textContent = 'N/A';
    $('period-status').textContent = '时段输入无效，旧指标已清除。';
    $('period-chart').replaceChildren(); $('sample-times').replaceChildren(); $('period-table').replaceChildren();
    $('time').replaceChildren();
    return;
  }
  const layer = height === 0 ? 'ground' : 'elevated';
  const metrics = result[layer];
  $('period-average').textContent = percentage(metrics.average);
  $('period-minimum').textContent = percentage(metrics.minimum);
  $('minimum-time').textContent = metrics.minimumTimes.length ? metrics.minimumTimes.map(localClock).join('、') : 'N/A';
  $('period-status').textContent = result.status === 'valid'
    ? `${result.samples.length}个必要采样时刻 · 含结束时刻 · 最低值仅限这些采样时刻`
    : `整段指标不可用：${result.samples.filter(sample => sample.status !== 'valid').map(sample => `${sample.clock} ${sample.status}`).join('；')}。未删除任何必要时刻。`;
  $('time').replaceChildren(...result.samples.map((sample, index) => {
    const option = element('option', sample.clock, { value: sample.clock }); option.selected = index === selectedIndex; return option;
  }));
  $('sample-times').replaceChildren(...result.samples.map((sample, index) => element('button', sample.clock, {
    type: 'button', 'data-sample-index': index, 'aria-pressed': index === selectedIndex,
    'aria-label': `选择采样时刻 ${sample.clock}`,
  })));
  $('period-table').replaceChildren(...result.samples.map(sample => {
    const row = element('tr', null);
    for (const text of [sample.clock, percentage(sample.analysis.ground?.rate), percentage(sample.analysis.elevated?.rate),
      `${sample.groundValidCount}/100 · ${sample.elevatedValidCount}/100`, sample.status]) row.append(element('td', text));
    return row;
  }));
  const svg = $('period-chart'), namespace = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const add = (tag, attributes, text) => {
    const node = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    svg.append(node); return node;
  };
  const x = value => 38 + value * 340, y = rate => 126 - rate * 100;
  for (const rate of [0, .5, 1]) {
    add('line', { x1: 38, x2: 378, y1: y(rate), y2: y(rate), class: 'chart-grid' });
    add('text', { x: 30, y: y(rate) + 4, 'text-anchor': 'end' }, `${rate * 100}%`);
  }
  const draw = (data, className) => {
    let points = [];
    const flush = () => { if (points.length > 1) add('polyline', { points: points.join(' '), class: className, fill: 'none' }); points = []; };
    for (const point of data) {
      if (point.rate === null) { flush(); continue; }
      points.push(`${x(point.x)},${y(point.rate)}`);
      add('circle', { cx: x(point.x), cy: y(point.rate), r: 3.3, class: className });
    }
    flush();
  };
  draw(chartSeries(result, height), 'chart-current');
  if (alternative) draw(chartSeries(alternative, height), 'chart-alternative');
  const data = chartSeries(result, height), selected = data[selectedIndex];
  add('line', { x1: x(selected.x), x2: x(selected.x), y1: 20, y2: 132, class: 'chart-cursor' });
  add('text', { x: 38, y: 150 }, data[0].clock);
  add('text', { x: 378, y: 150, 'text-anchor': 'end' }, data.at(-1).clock);
}
