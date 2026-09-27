// Parsing of raw MQTT payloads from the ESP32 firmware. Pure functions — see test/payload.test.js.
// Anything that does not parse is rejected (null) and never treated as a safe state.

/**
 * Helmet state: the firmware publishes one ASCII character, '1' = worn, '0' = removed
 * (the tool ESP32 reads payload[0] the same way). Surrounding whitespace is tolerated.
 * @param {Buffer} buf
 * @returns {'WORN'|'REMOVED'|null}
 */
export function parseHelmet(buf) {
  const s = buf.toString('utf8').trim();
  if (s === '1') return 'WORN';
  if (s === '0') return 'REMOVED';
  return null;
}

/**
 * Relay state from the tool ESP32: '1' = relay on (tool enabled), '0' = off.
 * @param {Buffer} buf
 * @returns {'ENABLED'|'DISABLED'|null}
 */
export function parseRelay(buf) {
  const s = buf.toString('utf8').trim();
  if (s === '1') return 'ENABLED';
  if (s === '0') return 'DISABLED';
  return null;
}

/**
 * Forehead skin temperature as text, e.g. "34.6". Values outside a plausible
 * sensor range are rejected (MLX90614 misreads, disconnected sensor).
 * @param {Buffer} buf
 * @returns {number|null}
 */
export function parseTemperature(buf) {
  const s = buf.toString('utf8').trim();
  if (!/^-?\d{1,3}(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  if (v < 0 || v > 60) return null;
  return Math.round(v * 10) / 10;
}
