export const VISUAL_VERSION = 'batch1a-v1';
export const VISUAL_CONFIG = Object.freeze({
  seed: 13871,
  textureSize: 512,
  pavingModule: 0.6,
  pavingJoint: 0.004,
  pavingDepth: 0.045,
  facadeBays: 6,
  facadeStoreys: 2,
  maxDpr: 1.5,
  exposure: 1,
  shadowSize: 2048,
  normalBias: 0.0015,
  shadowBias: -0.00004,
});

// Continuous art-directed daylight, not an irradiance/weather measurement.
export function daylightAppearance(altitude) {
  const value = Math.max(0, Math.sin(altitude));
  const smooth = value * value * (3 - 2 * value);
  const dawn = Math.min(1, value / Math.sin(12 * Math.PI / 180));
  return { sun: 3.1 * Math.sqrt(value), hemisphere: 0.12 + 0.42 * smooth,
    environment: 0.08 + 0.82 * Math.sqrt(value), daylight: value > 0,
    sunColor: [1, 0.70 + 0.25 * dawn, 0.44 + 0.45 * dawn],
    backgroundMix: smooth };
}
