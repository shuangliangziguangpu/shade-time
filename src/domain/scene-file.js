import { SCENE_CONFIG, validateSelection } from './scene-config.js';
import { inspectLayout } from './layout.js';
import { normalizePeriod, ANALYSIS_ALGORITHM_VERSION, SAMPLING_VERSION } from './period.js';
import { normalizeConstraints } from './candidates.js';

export const SCENE_FILE_LIMIT = 16_384;
export class SceneFileError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== keys.length || keys.some(key=>!Object.hasOwn(value,key))) {
    throw new SceneFileError('INVALID_FILE','场景文件字段不完整或含未允许的历史数据；当前场景未改变。');
  }
}
function taskSettings(input) {
  try {
    const selection=validateSelection(input.selection);
    if(!inspectLayout(selection).validation.valid)throw new SceneFileError('INVALID_LAYOUT','保存文件中的区域与棚布置不合法。');
    const period=normalizePeriod(input.period),constraints=normalizeConstraints(input.constraints);
    if(input.height!==0&&input.height!==1.5)throw new RangeError('只支持0米和1.5米参考面');
    return Object.freeze({selection,period,height:input.height,constraints});
  } catch(error) {
    if(error instanceof SceneFileError)throw error;
    throw new SceneFileError('INVALID_TASK','场景任务参数无效，请检查合法ID、日期、时段、时区、间隔、参考高度和移动约束。');
  }
}
export function serializeSceneFile(confirmed) {
  // Deliberately select task parameters: never serialize sessions, previews or results.
  const task=taskSettings(confirmed);
  const {date,startTime,endTime,intervalMinutes,timeZone}=task.period;
  return JSON.stringify({
    project:'ShadeTime',format:'shadetime-scene',schemaVersion:1,
    sceneGeometryVersion:SCENE_CONFIG.version,algorithmVersion:ANALYSIS_ALGORITHM_VERSION,samplingVersion:SAMPLING_VERSION,
    task:{selection:task.selection,period:{date,startTime,endTime,intervalMinutes,timeZone},height:task.height,constraints:task.constraints},
  },null,2)+'\n';
}
export function parseSceneFile(text) {
  if(typeof text!=='string')throw new SceneFileError('INVALID_JSON','请选择有效的场景JSON文件。');
  if(new TextEncoder().encode(text).length>SCENE_FILE_LIMIT)throw new SceneFileError('FILE_TOO_LARGE','场景JSON文件不能超过16KiB。');
  let data;
  try {data=JSON.parse(text);}catch{throw new SceneFileError('INVALID_JSON','场景JSON已损坏或不是有效JSON；当前场景未改变。');}
  exact(data,['project','format','schemaVersion','sceneGeometryVersion','algorithmVersion','samplingVersion','task']);
  if(data.project!=='ShadeTime'||data.format!=='shadetime-scene')throw new SceneFileError('INVALID_FILE','这不是ShadeTime场景文件。');
  if(data.schemaVersion!==1||data.sceneGeometryVersion!==SCENE_CONFIG.version||data.algorithmVersion!==ANALYSIS_ALGORITHM_VERSION||data.samplingVersion!==SAMPLING_VERSION) {
    throw new SceneFileError('UNSUPPORTED_VERSION','不支持此保存版本或几何/算法/采样版本；请使用本版本导出的文件，不自动迁移。');
  }
  exact(data.task,['selection','period','height','constraints']);
  exact(data.task.period,['date','startTime','endTime','intervalMinutes','timeZone']);
  exact(data.task.constraints,['regionMovable','canopyMovable','minimumShade']);
  return taskSettings(data.task);
}
