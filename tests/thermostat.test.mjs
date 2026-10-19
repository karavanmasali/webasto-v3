import test from 'node:test';
import assert from 'node:assert/strict';
import {changeStart,changeStop,updateAuto,safeConfig,thermostatDecision} from '../thermostat.mjs';
test('minimum 2 °C fark',()=>{
 let c=safeConfig(null);c=changeStart(c,8);assert.equal(c.start,23);c=changeStop(c,-20);assert.equal(c.stop,25);
});
test('STOP değişince otomatik hedef eşitlenir',()=>{
 let c=updateAuto(safeConfig(null),true);c=changeStop(c,3);assert.equal(c.stop,28);assert.equal(c.target,28);
});
test('yeniden yüklemede otomatik kapalı',()=>{
 assert.equal(safeConfig({start:19,stop:21,auto:true}).auto,false);
});
test('STOP 20 saniye korunmalı',()=>{
 const cfg=updateAuto(safeConfig(null),true), now=100000;
 let x=thermostatDecision({cfg,now,running:'on',room:26,isFresh:true,stopSince:null,lastStoppedAt:null,error:false});
 assert.equal(x.command,null);
 let y=thermostatDecision({cfg,now:now+20000,running:'on',room:26,isFresh:true,stopSince:x.stopSince,lastStoppedAt:null,error:false});
 assert.equal(y.command,'stop');
});
test('120 sn yeniden başlatma beklemesi',()=>{
 const cfg=updateAuto(safeConfig(null),true);
 let d=thermostatDecision({cfg,now:110000,running:'off',room:18,isFresh:true,stopSince:null,lastStoppedAt:100000,error:false});
 assert.equal(d.command,null);d=thermostatDecision({cfg,now:220000,running:'off',room:18,isFresh:true,stopSince:null,lastStoppedAt:100000,error:false});assert.equal(d.command,'start');
});
test('kaybolan bağlantı/arıza komut oluşturmaz',()=>{
 const cfg=updateAuto(safeConfig(null),true);
 assert.equal(thermostatDecision({cfg,now:1000,running:'off',room:15,isFresh:false,stopSince:null,lastStoppedAt:null,error:false}).command,null);
 assert.equal(thermostatDecision({cfg,now:1000,running:'off',room:15,isFresh:true,stopSince:null,lastStoppedAt:null,error:true}).command,null);
});


test('10–40°C hedef aralığı; START-STOP arası 2°C korundu',()=>{
  const c=safeConfig({start:38,stop:40,target:40});
  assert.equal(c.start,38);assert.equal(c.stop,40);assert.equal(c.target,40);
  const low=safeConfig({start:2,stop:5,target:2});
  assert.equal(low.start,10);assert.equal(low.stop,12);assert.equal(low.target,10);
});
