import assert from 'node:assert/strict';
import test from 'node:test';
import {HeatGenieBLE} from '../ble.js';
import {guardedBuild, hexBytes} from '../command-profile.mjs';

function makeBLE(){
 const logs=[]; const actual=[];
 const ble=new HeatGenieBLE(line=>logs.push(line),()=>{},()=>{});
 ble.connected=true;
 ble.lastVerifiedStatus={stateCode:0x55,flags:0,voltage:12.6,roomTemp:24,caseTemp:30,target:23,fan:false,pump:false,glow:false,errorFlags:0,register34:2};
 ble.lastStatusAt=Date.now();
 ble.writeChar={writeValueWithResponse:async bytes=>{actual.push(hexBytes(bytes));}};
 return {ble,actual,logs};
}
test('Mod 2 3A00 ile doğrulanmazsa START gönderilmiyor',async()=>{
 const {ble,actual}=makeBLE();
 ble.waitForStatus=async()=>false; // Simulate no device acceptance, avoid physical waiting in test.
 let called=0;ble.sendCommand=async()=>{called++;};
 const r=await ble.startWithMode2();
 assert.equal(r.modeVerified,false);
 assert.equal(called,0);
 assert.deepEqual(actual,[hexBytes(guardedBuild('start-stop-mode'))]);
});
test('Doğrulanmış mod 2 + tek START; başka komut yok',async()=>{
 const {ble,actual}=makeBLE();
 ble.writeChar.writeValueWithResponse=async bytes=>{
   actual.push(hexBytes(bytes));
   ble.lastVerifiedStatus.flags=0x40; // reports START/STOP mode 2 in fresh 3A00 register
   ble.lastStatusAt=Date.now()+50;
 };
 let called=0;ble.sendCommand=async op=>{assert.equal(op,'start');called++;return {confirmed:false,transportAccepted:true};};
 const r=await ble.startWithMode2();
 assert.equal(r.modeVerified,true);
 assert.equal(called,1);
 assert.equal(actual.length,1);
 assert.equal(ble.runMode,2);
});
test('Çalışan fan/pompa/kızdırma mod değişimini engeller',async()=>{
 const {ble,actual}=makeBLE();ble.lastVerifiedStatus.fan=true;
 await assert.rejects(ble.startWithMode2(),/tamamen kapanıp fan durmadan/);
 assert.equal(actual.length,0);
});
