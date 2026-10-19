import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ble = readFileSync(new URL('../ble.js',import.meta.url),'utf8');
const app = readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('START tests MODE1 (not MODE2) and requires explicit MOD0 before transition',()=>{
 assert.match(ble, /async start\(\)\{return this\.startWithMode1\(\);\}/);
 assert.match(ble, /if\(this\.runMode!==0\)throw/);
 assert.match(ble,/await this\.writeMode\(1\)/);
 assert.match(ble,/const result=await this\.sendCommand\('start'\)/);
 assert.doesNotMatch(ble,/async start\(\)\{return this\.startWithMode2\(\);\}/);
});
test('start write is single-attempt locked per connection and old mode returns',()=>{
 assert.match(ble,/if\(this\.startTried\)throw/);
 assert.match(ble,/this\.startTried=true/);
 assert.match(ble,/async restoreTemperatureMode\(\)/);
 assert.match(ble,/return this\.writeMode\(0\)/);
});
test('UI START guard requires MODE 0 and supports MOD 2 restore after V3.5 test',()=>{
 assert.match(app,/ble\.runMode!==0 \|\| ble\.startTried/);
 assert.match(app,/ble\.runMode===0/);
});
