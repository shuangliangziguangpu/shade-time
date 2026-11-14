import SunCalc from 'suncalc';
import { Vector3 } from 'three';

export const DEG = Math.PI / 180;
export const LOCATION = Object.freeze({ latitude: 38.914, longitude: 121.614, timeZone: 'Asia/Shanghai' });
export const MIN_ALTITUDE = 5 * DEG;

// Never parse a timezone-free string with the host's local timezone.
export function parseShanghaiDateTime(date, time) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      Number(time.slice(3)) % 5 !== 0) {
    throw new RangeError('日期须为YYYY-MM-DD，时间须为HH:mm且以5分钟为步长');
  }
  const instant = new Date(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(instant.getTime()) ||
      new Date(instant.getTime() + 8 * 3600_000).toISOString().slice(0, 16) !== `${date}T${time}`) {
    throw new RangeError('无效的日期或时间');
  }
  return instant;
}

function validateAltitude(altitude) {
  if (!Number.isFinite(altitude) || altitude < -Math.PI / 2 || altitude > Math.PI / 2) {
    throw new RangeError('太阳高度角必须是[-π/2,π/2]内的有限弧度');
  }
}

export function altitudeStatus(altitude) {
  validateAltitude(altitude);
  if (altitude <= 0) return 'below-horizon';
  if (altitude < MIN_ALTITUDE) return 'low-altitude';
  return 'valid';
}

export function sunDirection(altitude, azimuth) {
  validateAltitude(altitude);
  if (!Number.isFinite(azimuth)) throw new RangeError('方位角必须是有限弧度');
  return new Vector3(
    -Math.cos(altitude) * Math.sin(azimuth),
    Math.sin(altitude),
    Math.cos(altitude) * Math.cos(azimuth),
  );
}

export function getSunPosition(instant, location = LOCATION) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new TypeError('必须提供有效的Date时间点');
  }
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError('经纬度必须是合法的度数');
  }
  const { altitude, azimuth } = SunCalc.getPosition(instant, latitude, longitude);
  return {
    altitude,
    azimuth,
    direction: sunDirection(altitude, azimuth),
    status: altitudeStatus(altitude),
  };
}
