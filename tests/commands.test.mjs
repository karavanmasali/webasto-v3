import assert from 'node:assert/strict';
import test from 'node:test';
import {guardedBuild,buildHeatGenieFrame,hexBytes,commandProfile} from '../command-profile.mjs';
import {crc16CcittZero} from '../protocol.mjs';
const fixtures=[
 ['start',undefined,'AA 00 61 01 FF 00 7C 83'],
 ['constant-mode',undefined,'AA 00 66 00 00 00 19 61'],
 ['auto-update',undefined,'AA 00 65 02 14 1E D0 95'],
 ['target',10,'AA 00 66 01 00 0A 8F 1B'],
 ['target',40,'AA 00 66 01 00 28 8B 3B'],
 ['stop',undefined,'AA 00 61 02 FF 00 25 D3'],
 ['target',22,'AA 00 66 01 00 16 5C A6'],
 ['target',23,'AA 00 66 01 00 17 4C 87'],
];
for (const [op,target,expected] of fixtures) test(`ProtocolHeatGenie 0.3.8 eşleşmesi: ${op} ${target??''}`,()=>{
 const bytes=guardedBuild(op,target);
 assert.equal(hexBytes(bytes),expected);
 assert.equal(crc16CcittZero(bytes),0);
});
test('Dış sınırlara dikkat',()=>{
 for(const arg of [9,41,-1,NaN,22.5])assert.throws(()=>guardedBuild('target',arg));
 assert.throws(()=>guardedBuild('reset',22),/Bilinmeyen/);
});
test('Protokol kaynaklı komutlar cihaz üzerinde fiziksel doğrulanmış diye işaretlenmez',()=>{
 assert.equal(commandProfile.hardwareVerified,false);
});
test('CRC hesaplaması tüm 10-40 derece aralığı için geçerli',()=>{
 for(let target=10;target<=40;target++)assert.equal(crc16CcittZero(guardedBuild('target',target)),0);
});
