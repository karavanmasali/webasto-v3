/**
 * HeatGenie/Boygu command format based on diesel-heater-ble 0.3.8,
 * ProtocolHeatGenie.build_command() under MIT license.
 * SOURCE CONFIRMED. Physical RE5011 acceptance is NOT confirmed.
 * Copyright (c) 2024 Spettacolo83 (original Python library).
 */
import {crc16CcittZero} from './protocol.mjs';
export const commandProfile = Object.freeze({
  source: 'diesel-heater-ble 0.3.8 ProtocolHeatGenie',
  hardwareVerified: false,
  targetMin: 8,
  targetMax: 36,
});
export const hexBytes = bytes => [...bytes].map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
export function buildHeatGenieFrame(command, first, second, third) {
  for (const n of [command, first, second, third]) if (!Number.isInteger(n) || n<0 || n>255) throw new RangeError('Komut baytları 0-255 aralığında olmalı.');
  const out = Uint8Array.from([0xAA,0x00,command,first,second,third,0,0]);
  const crc = crc16CcittZero(out.subarray(0,6));
  out[6] = crc >> 8; out[7] = crc & 255;
  return out;
}
export function guardedBuild(operation, target) {
  switch (operation) {
    case 'start': return buildHeatGenieFrame(0x61,0x01,0xff,0);
    case 'stop': return buildHeatGenieFrame(0x61,0x02,0xff,0);
    case 'target':
      if(!Number.isInteger(target) || target<8 || target>36) throw new RangeError('Hedef sıcaklık 8–36 °C arasında olmalı.');
      return buildHeatGenieFrame(0x66,0x01,0x00,target);
    default: throw new Error('Bilinmeyen veya desteklenmeyen işlem.');
  }
}
