import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHeatGenieStatus, crc16CcittZero} from '../protocol.mjs';
const packets = [
'AA09 FFF4 0000 00F2 2205 7F00 2003 E400 7104 1200 0000 B10C F87F F87F 0000 0440 742D 9CFA 0000 0000 0117 01FF 0000 0000 3694 4CC8',
'AA09 FF24 0000 00F2 2205 7F00 2003 E400 7004 1200 0000 BA0C F87F F87F 0000 0440 742D 9CFA 0000 0000 0117 01FF 0000 0000 B8FD D0B4',
'AA09 FF54 0000 00F2 2205 7F00 2003 E400 7004 1200 0000 BA0C F87F F87F 0000 0440 742D 9CFA 0000 0000 0117 01FF 0000 0000 B8FD 8EF0',
];
const bytes = s => Uint8Array.from(s.replaceAll(' ','').match(/../g).map(x => parseInt(x,16)));
test('three RE5011 screenshots are valid HeatGenie F2 frames with CRC', () => {
  const results = packets.map(x => parseHeatGenieStatus(bytes(x)));
  assert.deepEqual(results.map(x => x.caseTemp),[113.7,113.6,113.6]);
  for (const s of results) {
    assert.equal(s.roomTemp,22.8); assert.equal(s.voltage,12.7); assert.equal(s.target,23);
    assert.equal(s.setLevel,1); assert.equal(s.stateCode,0x22); assert.equal(s.flags,5);
    assert.equal(s.fan,true); assert.equal(s.pump,true); assert.equal(s.glow,false);
    assert.equal(s.intakeTemp,null); assert.equal(s.outletTemp,null);
    assert.equal(s.errorFlags,0);assert.equal(s.crcOk,true);
  }
});
test('tampered packet cannot be displayed as trusted status',()=>{
  const p=bytes(packets[0]);p[14]^=1;
  assert.throws(()=>parseHeatGenieStatus(p),/CRC16/);
});
test('unknown header and short messages are rejected',()=>{
  const p=bytes(packets[0]);p[7]=0xF1;
  assert.throws(()=>parseHeatGenieStatus(p),/durum paketi/);
  assert.throws(()=>parseHeatGenieStatus(new Uint8Array(4)),/uzunluğu/);
});
test('CRC-CCITT with zero initial value is stable',()=>{
  const p=bytes(packets[1]);
  assert.equal(crc16CcittZero(p.subarray(0,50)),0xD0B4);
});
