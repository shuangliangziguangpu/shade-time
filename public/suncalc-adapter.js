// Load the exact installed 1.9.0 UMD source; no copied astronomical implementation.
import '/vendor/suncalc.js';

if (typeof globalThis.SunCalc?.getPosition !== 'function') {
  throw new Error('SunCalc 1.9.0 浏览器适配器加载失败');
}
export default globalThis.SunCalc;
