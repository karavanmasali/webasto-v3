import {changeStart,changeStop,updateAuto,safeConfig,clamp,thermostatDecision} from './thermostat.mjs';
import {HeatGenieBLE} from './ble.js';
const $=id=>document.getElementById(id);
const keys=['startMinus','startPlus','stopMinus','stopPlus','targetMinus','targetPlus'];
let cfg;
try { cfg=safeConfig(JSON.parse(localStorage.getItem('webasto-v3')||'null')); } catch { cfg=safeConfig(null); }
let mode='none'; // none | demo | ble
let heater='unknown';
let demoRoom=19.2;
let caseTemp=null;
let voltage=null;
let targetOnDevice=null;
let stopSince=null, lastStoppedAt=null, sent=false, busy=false, error=false;
let lastUpdate=0;
let logs=[];
const log=(msg)=>{logs.push(`[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`);logs=logs.slice(-300);$('logOutput').textContent=logs.join('\n');};
const ble = new HeatGenieBLE(log,()=>{mode='none';heater='unknown';cfg.auto=false;stopSince=null;lastUpdate=0;save();render();});
const save=()=>{localStorage.setItem('webasto-v3',JSON.stringify(cfg));};
const fresh=()=>mode==='demo' || (mode==='ble' && Date.now()-lastUpdate<20000);
const ready=()=>mode==='demo' || (mode==='ble' && ble.canControl && fresh());
const nameOf = {'unknown':'Durum bilinmiyor','off':'Kapalı','on':'Çalışıyor','starting':'Başlatılıyor','stopping':'Soğutma / CLEAR','fault':'Hata'};
function render(){
 $('startValue').textContent=cfg.start+' °C';$('stopValue').textContent=cfg.stop+' °C';
 $('targetValue').textContent=cfg.target+' °C'; $('autoToggle').checked=cfg.auto;
 $('stopDelay').value=cfg.stopDelay;$('restartDelay').value=cfg.restartDelay;
 $('connectionBadge').textContent=mode==='demo'?'DEMO':mode==='ble'?'Bluetooth bağlı':'Bağlı değil';
 $('connectionBadge').className='pill '+(mode==='demo'?'test':mode==='ble'?'on':'offline');
 $('heaterStatus').textContent=nameOf[heater];
 $('heaterSubstatus').textContent=mode==='demo'?'Simüle edilen ısıtıcı':mode==='ble'?'Ham BLE veri okunuyor; kontrol protokolü doğrulanmadı':'Cihaz verisi bekleniyor';
 $('deviceName').textContent=mode==='demo'?'Simülasyon':mode==='ble'?(ble.device?.name||'Bağlı cihaz'):'Cihaz seçilmedi';
 $('roomTemp').textContent=mode==='demo'?demoRoom.toFixed(1):'—';
 $('physicalTarget').textContent=mode==='demo'?targetOnDevice??'—':'—';
 $('caseTemp').textContent=caseTemp===null?'—':caseTemp.toFixed(0);
 $('voltage').textContent=voltage===null?'—':voltage.toFixed(1);
 $('fan').textContent=mode==='demo'?(heater==='on'?'3':'Kapalı'):'—';
 $('pump').textContent=mode==='demo'?(heater==='on'?'Açık':'Kapalı'):'—';
 $('connectBtn').disabled=mode==='ble'||busy;
 $('disconnectBtn').disabled=mode!=='ble';
 $('demoBtn').textContent=mode==='demo'?'Demoyu kapat':'Demo aç';
 $('startBtn').disabled=!ready() || busy || heater==='on';
 $('stopBtn').disabled=!ready() || busy || heater==='off';
 $('targetMinus').disabled=!ready() || busy || cfg.auto;
 $('targetPlus').disabled=!ready() || busy || cfg.auto;
 $('leaveBtn').disabled=!ready() || busy;
 $('readBtn').disabled=mode!=='ble';
 $('modeNotice').innerHTML=mode==='demo'?'<strong>DEMO MODU.</strong> Ekrandaki komutlar yalnızca sanal ısıtıcıyı yönetir; gerçek cihaza hiçbir veri gönderilmez.':mode==='ble'?'<strong>Bluetooth bağlı; yalnızca tanılama.</strong> Doğrulanmış HeatGenie komut paketleri olmadan gerçek kontrol ve otomatik mod engellenir.':'<strong>Gerçek cihaza bağlı değil.</strong> Demo modu veya Bluetooth tanılama kullanabilirsin.';
 $('freshness').textContent=mode==='demo'?'Demo verisi':mode==='ble'?'Ham veri; çözümlenmedi':'Veri yok';
 if(mode==='ble') {$('autoToggle').disabled=true;$('autoReason').textContent='Gerçek ısıtıcı için protokol doğrulaması yapılmadı; otomatik kontrol kapalı.';}
 else {$('autoToggle').disabled=(mode!=='demo'); if(!cfg.auto) $('autoReason').textContent='Otomatik mod kapalı.';}
}
async function command(what,arg,automatic=false){
 if(!ready() || busy) {log('Komut reddedildi: Gerçek kontrol hazır değil.');return;}
 busy=true;render();
 try {
   if(mode==='demo') {
     if(what==='start'){heater='starting';log((automatic?'OTOMATİK ':'')+'Demo START'); await new Promise(r=>setTimeout(r,650));heater='on';}
     if(what==='stop'){heater='stopping';log((automatic?'OTOMATİK ':'')+'Demo STOP / CLEAR');await new Promise(r=>setTimeout(r,650));heater='off';lastStoppedAt=Date.now();stopSince=null;}
     if(what==='target') {targetOnDevice=arg;log('Demo hedef gönderildi: '+arg+' °C');}
     lastUpdate=Date.now();
   } else {
     if(what==='start') await ble.start();
     else if(what==='stop') await ble.stop();
     else if(what==='target') await ble.target(arg);
     log('Komut gönderildi: '+what);
   }
 } catch(e) { log('Komut başarısız: '+e.message);$('autoReason').textContent=e.message; }
 finally {busy=false;render();}
}
const changeSettings=(update)=>{cfg=update(cfg);save();stopSince=null;render();};
$('startMinus').onclick=()=>changeSettings(c=>changeStart(c,-1));
$('startPlus').onclick=()=>changeSettings(c=>changeStart(c,1));
$('stopMinus').onclick=()=>{changeSettings(c=>changeStop(c,-1));if(cfg.auto) command('target',cfg.target);};
$('stopPlus').onclick=()=>{changeSettings(c=>changeStop(c,1));if(cfg.auto) command('target',cfg.target);};
$('targetMinus').onclick=()=>{cfg.target=clamp(cfg.target-1,8,36);save();render();command('target',cfg.target);};
$('targetPlus').onclick=()=>{cfg.target=clamp(cfg.target+1,8,36);save();render();command('target',cfg.target);};
$('stopDelay').onchange=e=>changeSettings(c=>({...c,stopDelay:Number(e.target.value)}));
$('restartDelay').onchange=e=>changeSettings(c=>({...c,restartDelay:Number(e.target.value)}));
$('autoToggle').onchange=e=>{
 if(mode!=='demo') {e.target.checked=false;return;}
 changeSettings(c=>updateAuto(c,e.target.checked));
 if(cfg.auto)command('target',cfg.stop); // STOP ile HeatGenie hedefini eşitle.
};
$('startBtn').onclick=()=>{if(cfg.auto){cfg.auto=false;save();}command('start');};
$('stopBtn').onclick=()=>{if(cfg.auto){cfg.auto=false;save();}command('stop');};
$('leaveBtn').onclick=async()=>{cfg.auto=false;save();stopSince=null;render();await command('stop');};
$('demoBtn').onclick=()=>{
 if(mode==='ble')ble.disconnect();
 cfg.auto=false;save();stopSince=null;lastStoppedAt=null;busy=false;error=false;
 if(mode==='demo'){mode='none';heater='unknown';caseTemp=null;voltage=null;targetOnDevice=null;log('Demo kapatıldı.');}
 else {mode='demo';heater='off';demoRoom=19.2;targetOnDevice=cfg.target;caseTemp=28;voltage=13.2;lastUpdate=Date.now();log('Demo başlatıldı.');}
 render();
};
$('connectBtn').onclick=async()=>{
 if(mode==='demo'){$('demoBtn').click();}
 cfg.auto=false;save();busy=true;render();
 try {const name=await ble.connect();mode='ble';heater='unknown';lastUpdate=0;log('Bağlantı tamamlandı: '+name+'. Sadece GATT tanılama açık.');}
 catch(e){mode='none';log('Bağlantı hatası: '+e.message);alert('Bluetooth bağlantısı kurulamadı: '+e.message);}
 busy=false;render();
};
$('disconnectBtn').onclick=()=>{cfg.auto=false;save();ble.disconnect();mode='none';heater='unknown';render();};
$('readBtn').onclick=()=>ble.read();
$('exportBtn').onclick=()=>{
 const blob=new Blob([logs.join('\n')],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='webasto-v3-tani.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
setInterval(()=>{
 if(mode!=='demo')return;
 // Demo yalnızca görünüş ve algoritma testi içindir.
 demoRoom=clamp(demoRoom+(heater==='on'?.13:-.035),4,45);
 caseTemp=heater==='on'?clamp(caseTemp+.8,28,78):clamp(caseTemp-.25,25,78);
 lastUpdate=Date.now();
 const d=thermostatDecision({cfg, now:Date.now(),running:heater,room:demoRoom,isFresh:fresh(),stopSince,lastStoppedAt,error});
 stopSince=d.stopSince;
 $('autoReason').textContent=d.reason;
 if(d.command && !busy)command(d.command,undefined,true);
 render();
 $('autoReason').textContent=d.reason;
},1000);
window.addEventListener('pagehide',()=>{ // Kapandığında otomatik komut garantisi yok; güç kesme uygulanmaz.
 cfg.auto=false;save();
});
log('V3 açıldı. Gerçek protokol doğrulanmadığı için hiçbir BLE kontrol komutu gönderilmez.');
render();
