import {changeStart,changeStop,updateAuto,safeConfig,clamp,thermostatDecision} from './thermostat.mjs?v=3.9.0';
import {HeatGenieBLE} from './ble.js?v=3.9.0';
import {AutoEngine} from './auto-engine.mjs?v=3.9.0';
const $=id=>document.getElementById(id);
const keys=['startMinus','startPlus','stopMinus','stopPlus','targetMinus','targetPlus'];
let cfg;
try { cfg=safeConfig(JSON.parse(localStorage.getItem('webasto-v3')||'null')); } catch { cfg=safeConfig(null); }
let mode='none'; // none | demo | ble
let manualArmed=false;let targetTestConfirmed=false;
let heater='unknown';
let demoRoom=19.2;
let actualRoom=null, actualFan=null, actualPump=null, actualGlow=null, actualState=null, actualError=null;
let caseTemp=null;
let voltage=null;
let targetOnDevice=null;
let stopSince=null, lastStoppedAt=null, sent=false, busy=false, error=false;
let lastUpdate=0;
let logs=[];
const log=(msg)=>{logs.push(`[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`);logs=logs.slice(-300);$('logOutput').textContent=logs.join('\n');};
const engine=new AutoEngine();
let targetSyncTries=0,lastTargetSentAt=0,wakeLock=null;
const ble = new HeatGenieBLE(log,
  (willReconnect)=>{
    lastUpdate=0;
    if(willReconnect){heater='unknown';if(cfg.auto){$('autoReason').textContent='Bağlantı koptu, yeniden bağlanılıyor… (otomatik kontrol çalışmıyor)';notify('Bluetooth bağlantısı koptu. Otomatik kontrol çalışmıyor; ısıtıcı kendi ayarıyla çalışır.');}render();return;}
    mode='none';heater='unknown';manualArmed=false;targetTestConfirmed=false;cfg.auto=false;engine.reset();releaseWake();stopSince=null;save();render();},
  status=>{
    actualRoom=status.roomTemp;
    caseTemp=status.caseTemp;
    voltage=status.voltage;
    targetOnDevice=status.target;
    actualFan=status.fan;
    actualPump=status.pump;
    actualGlow=status.glow;
    actualState=status.stateCode;
    actualError=status.errorFlags;
    lastUpdate=Date.now();
    render();
    autoStep(status);
  });
ble.onReconnect=()=>{log('Yeniden bağlandı; telemetri bekleniyor.');render();};
ble.onGiveUp=()=>{mode='none';heater='unknown';manualArmed=false;cfg.auto=false;engine.reset();releaseWake();save();notify('Yeniden bağlanılamadı; otomatik kontrol kapatıldı. Isıtıcıyı kontrol edin.');render();};
const save=()=>{localStorage.setItem('webasto-v3',JSON.stringify(cfg));};
const fresh=()=>mode==='demo' || (mode==='ble' && Date.now()-lastUpdate<20000);
const ready=()=>mode==='demo' || (mode==='ble' && manualArmed && ble.canControl && fresh());
const nameOf = {'unknown':'Durum bilinmiyor','off':'Kapalı','on':'Çalışıyor','starting':'Başlatılıyor','stopping':'Soğutma / CLEAR','fault':'Hata'};
function render(){
 $('startValue').textContent=cfg.start+' °C';$('stopValue').textContent=cfg.stop+' °C';
 $('targetValue').textContent=(mode==='ble'?(targetOnDevice??'—'):cfg.target)+' °C'; $('autoToggle').checked=cfg.auto;
 $('stopDelay').value=cfg.stopDelay;$('restartDelay').value=cfg.restartDelay;
 $('connectionBadge').textContent=mode==='demo'?'DEMO':mode==='ble'?'Bluetooth bağlı':'Bağlı değil';
 $('connectionBadge').className='pill '+(mode==='demo'?'test':mode==='ble'?'on':'offline');
 $('heaterStatus').textContent=mode==='ble' && actualState !== null ? (actualError?'Hata bayrağı var':(actualFan||actualPump?'Aktivite algılandı':'Durum kodu alındı')):nameOf[heater];
 $('heaterSubstatus').textContent=mode==='demo'?'Simüle edilen ısıtıcı':mode==='ble'?(actualState===null?'Doğrulanmış 3A00 paketi bekleniyor':`Durum adımı: ${(actualState&0x0f)} · Mod ${ble.runMode??'—'} · CRC doğrulandı · Manuel test ${manualArmed?'açık':'kapalı'}`):'Cihaz verisi bekleniyor';
 $('deviceName').textContent=mode==='demo'?'Simülasyon':mode==='ble'?(ble.device?.name||'Bağlı cihaz'):'Cihaz seçilmedi';
 $('roomTemp').textContent=mode==='demo'?demoRoom.toFixed(1):mode==='ble' && actualRoom!==null?actualRoom.toFixed(1):'—';
 $('physicalTarget').textContent=(mode==='demo'||mode==='ble')?(targetOnDevice??'—'):'—';
 $('caseTemp').textContent=caseTemp===null?'—':caseTemp.toFixed(1);
 $('voltage').textContent=voltage===null?'—':voltage.toFixed(1);
 $('fan').textContent=mode==='demo'?(heater==='on'?'3':'Kapalı'):mode==='ble' && actualFan!==null?(actualFan?'Açık':'Kapalı'):'—';
 $('pump').textContent=mode==='demo'?(heater==='on'?'Açık':'Kapalı'):mode==='ble' && actualPump!==null?`${actualPump?'Açık':'Kapalı'} / ${actualGlow?'Açık':'Kapalı'}`:'—';
 $('connectBtn').disabled=mode==='ble'||busy;
 $('disconnectBtn').disabled=mode!=='ble';
 $('demoBtn').textContent=mode==='demo'?'Demoyu kapat':'Demo aç';
 $('startBtn').disabled=!ready() || busy || (mode==='ble' && (!targetTestConfirmed || ![0,5].includes((actualState??255)&0x0f) || ble.runMode!==0 || (Date.now()-ble.lastStartAt<60000))) || (mode==='demo' && heater==='on');
 $('restoreModeBtn').disabled=!ready() || busy || mode!=='ble' || ble.runMode===0 || (actualState!==null && ![0,5].includes(actualState&0x0f)) || Boolean(actualFan||actualPump||actualGlow);
 $('stopBtn').disabled=mode==='ble' ? (!ble.canStop || (actualState!==null && [0,5].includes(actualState&0x0f) && Date.now()-ble.lastStartAt>90000)) : (!ready() || busy || mode!=='demo' || heater==='off'); // STOP gerçek cihazda hedef testi, hata bayrağı veya telemetri tazeliğine bağlı değildir
 $('targetMinus').disabled=!ready() || busy || cfg.auto || (mode==='ble' && (targetOnDevice===null || targetOnDevice<=10));
 $('targetPlus').disabled=!ready() || busy || cfg.auto || (mode==='ble' && (targetOnDevice===null || targetOnDevice>=40));
 $('leaveBtn').disabled=mode!=='demo' || busy; // Karavandan ayrıldım otomatik komutu bu test sürümünde gerçek cihazda KAPALI
 $('manualTestArm').checked=manualArmed;
 $('manualTestArm').disabled=mode!=='ble' || busy;
 $('manualTestStatus').textContent= mode==='ble' ? (manualArmed ? (targetTestConfirmed?'Hedef testi onaylandı. START/STOP tek seferlik manuel testlere açık.':'Önce hedef sıcaklığı +1/−1 deneyip cihazdan geri okumayı doğrula.'):'Gerçek kontrol kilitli. Onay kutusunu işaretle.') : 'Yalnızca Bluetooth bağlantısı kurulduktan sonra manuel test açılabilir.';
 $('readBtn').disabled=mode!=='ble';
 $('modeNotice').innerHTML=mode==='demo'?'<strong>DEMO MODU.</strong> Ekrandaki komutlar sanaldır.':mode==='ble'?'<strong>V3.9 OTOMATİK TERMOSTAT.</strong> Gerçek cihazda otomatik START/STOP test edilebilir (onay kutusu + açık onay gerekir). Sayfa ve bilgisayar açık, Chrome ekranı uyumasın.':'<strong>Gerçek cihaza bağlı değil.</strong> Demo veya Bluetooth tanılama kullan.';
 $('freshness').textContent=mode==='demo'?'Demo verisi':mode==='ble'?(lastUpdate?('Gerçek veri · '+(fresh()?'güncel':'eski')):'Paket bekleniyor'):'Veri yok';
 if(mode==='ble') {$('autoToggle').disabled=!manualArmed||busy||!(ble.connected||ble.reconnecting);if(!cfg.auto)$('autoReason').textContent=manualArmed?'Otomatik mod kapalı.':'Otomatik mod için önce manuel test onay kutusunu işaretle.';}
 else {$('autoToggle').disabled=(mode!=='demo'); if(!cfg.auto) $('autoReason').textContent='Otomatik mod kapalı.';}
}
async function command(what,arg,automatic=false){
 const stopLive=(what==='stop'&&mode==='ble');
 if(stopLive?!ble.canStop:(!ready() || busy)) {log('Komut reddedildi: Gerçek kontrol hazır değil.');return;}
 busy=true;render();
 try {
   if(mode==='demo') {
     if(what==='start'){heater='starting';log((automatic?'OTOMATİK ':'')+'Demo START'); await new Promise(r=>setTimeout(r,650));heater='on';}
     if(what==='stop'){heater='stopping';log((automatic?'OTOMATİK ':'')+'Demo STOP / CLEAR');await new Promise(r=>setTimeout(r,650));heater='off';lastStoppedAt=Date.now();stopSince=null;}
     if(what==='target') {targetOnDevice=arg;log('Demo hedef gönderildi: '+arg+' °C');}
     lastUpdate=Date.now();
   } else {
     const confirmation = what==='restore-mode' ? 'Cihaz tamamen durmuşken eski Otomatik/Sıcaklık modu (0) seçilecek. Onaylıyor musun?' : what==='start' ? `V3.9 Dizi C START: MOD 0 korunacak, cihazın güncel hedefi ${targetOnDevice} °C B4 alanında gönderilecek (CRC otomatik). Yalnızca TEK komut. Cihaz durmuş, havalandırma ve CO alarmı hazır, sen yanında mısın?` : what==='stop' ? 'Bu gerçek STOP/CLEAR denemesidir. Isıtıcının normal soğutmasını gözlemlemelisin. Devam?' : `Gerçek ısıtıcı hedefi ${arg} °C yapılmaya çalışılacak. Onaylıyor musun?`;
     if(!window.confirm(confirmation)){log('Kullanıcı gerçek komutu iptal etti.');return;}
     let result;
     if(what==='start') result=await ble.start();
     else if(what==='restore-mode'){const restored=await ble.restoreTemperatureMode();result={transportAccepted:true,confirmed:restored,kind:'mode'};}
     else if(what==='stop') result=await ble.stop();
     else if(what==='target') result=await ble.target(arg);
     if(result?.confirmed && what==='target'){targetTestConfirmed=true;cfg.target=arg;save();}
     log(result?.modeVerified===false ? 'SONUÇ START: Ön koşullar doğrulanmadı, START gönderilmedi.' : result?.confirmed ? `SONUÇ ${what}: ${what==='target'?'Cihaz ayarı geri okundu':'Durum değişimi algılandı (tam işlem doğrulanmadı)'}.` : `SONUÇ ${what}: 3A01 yazma başarılı, ancak cihaz etkisi DOĞRULANMADI.`);
     $('lastTestResult').textContent=result?.modeVerified===false?'Başlatma ön koşulu doğrulanmadı; START gönderilmedi.':result?.confirmed ? `${what.toUpperCase()}: ${what==='target'?'Hedef cihazdan geri okundu':'Cihaz durum değişikliği görüldü'}` : `${what.toUpperCase()}: GATT yazıldı ama cihazda sonuç görülmedi.`;
   }
 } catch(e) { log('Komut başarısız: '+e.message);$('autoReason').textContent=e.message; }
 finally {busy=false;render();}
}
const changeSettings=(update)=>{cfg=update(cfg);save();stopSince=null;render();};
$('startMinus').onclick=()=>changeSettings(c=>changeStart(c,-1));
$('startPlus').onclick=()=>changeSettings(c=>changeStart(c,1));
$('stopMinus').onclick=()=>{changeSettings(c=>changeStop(c,-1));if(cfg.auto){if(mode==='demo')command('target',cfg.target);else targetSyncTries=0;}};
$('stopPlus').onclick=()=>{changeSettings(c=>changeStop(c,1));if(cfg.auto){if(mode==='demo')command('target',cfg.target);else targetSyncTries=0;}};
$('targetMinus').onclick=()=>{const next=clamp((mode==='ble'?targetOnDevice:cfg.target)-1,10,40);if(mode==='demo'){cfg.target=next;save();}render();command('target',next);};
$('targetPlus').onclick=()=>{const next=clamp((mode==='ble'?targetOnDevice:cfg.target)+1,10,40);if(mode==='demo'){cfg.target=next;save();}render();command('target',next);};
$('stopDelay').onchange=e=>changeSettings(c=>({...c,stopDelay:Number(e.target.value)}));
$('restartDelay').onchange=e=>changeSettings(c=>({...c,restartDelay:Number(e.target.value)}));
$('autoToggle').onchange=async e=>{
 if(mode==='ble'){
  if(e.target.checked){
   if(!manualArmed){e.target.checked=false;log('Önce manuel test onay kutusunu işaretle.');return;}
   if(!window.confirm(`OTOMATİK KONTROL: Oda ≥ ${cfg.stop} °C olunca STOP, ≤ ${cfg.start} °C olunca START gönderilecek. Isıtıcı sen yokken kendiliğinden açılıp kapanabilir. Çalışan CO alarmı, havalandırma ve cihaz güvenliği sende olmalı. Etkinleştirilsin mi?`)){e.target.checked=false;return;}
   requestNotify();await requestWake();
   cfg=updateAuto(cfg,true);engine.reset();targetSyncTries=0;save();log('Otomatik termostat AÇILDI (gerçek cihaz).');
  } else {cfg=updateAuto(cfg,false);engine.reset();releaseWake();save();log('Otomatik termostat KAPATILDI.');}
  render();return;
 }
 if(mode!=='demo') {e.target.checked=false;return;}
 changeSettings(c=>updateAuto(c,e.target.checked));
 if(cfg.auto)command('target',cfg.stop); // STOP ile HeatGenie hedefini eşitle.
};
$('startBtn').onclick=()=>{if(cfg.auto){cfg.auto=false;save();}command('start');};
$('restoreModeBtn').onclick=()=>command('restore-mode');
$('stopBtn').onclick=()=>{if(cfg.auto){cfg.auto=false;save();}command('stop');};
$('leaveBtn').onclick=async()=>{cfg.auto=false;save();stopSince=null;render();await command('stop');};
$('manualTestArm').onchange=e=>{manualArmed=Boolean(e.target.checked) && mode==='ble';if(!manualArmed)targetTestConfirmed=false;log('Manuel komut testi '+(manualArmed?'onaylandı':'kilitlendi'));render();};
$('demoBtn').onclick=()=>{
 manualArmed=false;targetTestConfirmed=false;
 if(mode==='ble')ble.disconnect();
 cfg.auto=false;save();stopSince=null;lastStoppedAt=null;busy=false;error=false;
 if(mode==='demo'){mode='none';heater='unknown';caseTemp=null;voltage=null;targetOnDevice=null;log('Demo kapatıldı.');}
 else {mode='demo';heater='off';demoRoom=19.2;targetOnDevice=cfg.target;caseTemp=28;voltage=13.2;lastUpdate=Date.now();log('Demo başlatıldı.');}
 render();
};
$('connectBtn').onclick=async()=>{
 if(mode==='demo'){$('demoBtn').click();}
 cfg.auto=false;save();manualArmed=false;targetTestConfirmed=false;busy=true;render();
 try {const name=await ble.connect();mode='ble';heater='unknown';log('Bağlantı tamamlandı: '+name+'. 3A00 telemetri açık; manuel komut için açık kullanıcı onayı gerekir.');}
 catch(e){mode='none';log('Bağlantı hatası: '+e.message);alert('Bluetooth bağlantısı kurulamadı: '+e.message);}
 busy=false;render();
};
$('disconnectBtn').onclick=()=>{manualArmed=false;targetTestConfirmed=false;cfg.auto=false;engine.reset();releaseWake();save();ble.disconnect();mode='none';heater='unknown';render();};
$('readBtn').onclick=()=>ble.read();
$('exportBtn').onclick=()=>{
 const blob=new Blob([logs.join('\n')],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='webasto-v3-tani.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
/* ---------- V3.9 gerçek cihaz otomatik termostat ---------- */
function notify(msg){
  log('UYARI: '+msg);
  document.title='⚠ '+msg.slice(0,40);
  try{if('Notification' in window && Notification.permission==='granted')new Notification('Webasto',{body:msg});}catch{}
}
function requestNotify(){try{if('Notification' in window && Notification.permission==='default')Notification.requestPermission();}catch{}}
async function requestWake(){try{if(navigator.wakeLock&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});log('Ekran uyku kilidi alındı (bilgisayar ekranı uyumaz).');}}catch(e){log('Ekran uyku kilidi alınamadı: '+e.message);}}
function releaseWake(){try{wakeLock?.release();}catch{}wakeLock=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cfg.auto&&mode==='ble')requestWake();});

async function autoCommand(what){
  if(busy){log('Otomatik '+what+' ertelendi: önceki komut sürüyor.');engine.sendFailed(what);return;}
  busy=true;render();
  try{
    const r=what==='start'?await ble.start():await ble.stop();
    log(`OTOMATİK ${what.toUpperCase()}: ${r?.confirmed?'durum değişimi görüldü':'durum değişimi henüz görülmedi'}.`);
    $('lastTestResult').textContent=`OTOMATİK ${what.toUpperCase()}: ${r?.confirmed?'durum değişikliği görüldü':'GATT yazıldı, sonuç doğrulanamadı'}`;
  }catch(e){log('Otomatik '+what+' başarısız: '+e.message);engine.sendFailed(what);}
  finally{busy=false;render();}
}
async function syncTarget(s){
  const wanted=cfg.stop;
  if(s.target===wanted){targetSyncTries=0;return;}
  if(busy||targetSyncTries>=3||Date.now()-lastTargetSentAt<20000||!ble.canControl)return;
  targetSyncTries++;lastTargetSentAt=Date.now();busy=true;render();
  try{const r=await ble.target(wanted);if(r?.confirmed){targetTestConfirmed=true;cfg.target=wanted;save();}}
  catch(e){log('Hedef eşitleme başarısız: '+e.message);}
  finally{busy=false;render();}
}
function autoStep(status){
  if(!cfg.auto||mode!=='ble'||!manualArmed)return;
  engine.cfg={...cfg,maxStartsPerHour:4};
  const d=engine.evaluate(status,Date.now());
  $('autoReason').textContent=d.reason;
  if(d.alert)notify(d.alert);
  if(d.disableAuto){cfg=updateAuto(cfg,false);engine.reset();releaseWake();save();log('Otomatik kontrol kendini kapattı: '+d.reason);render();return;}
  if(d.action==='start'){log('OTOMATİK KARAR: '+d.reason);autoCommand('start');}
  else if(d.action==='stop'){log('OTOMATİK KARAR: '+d.reason);autoCommand('stop');}
  else syncTarget(status);
}
// Telemetri 20 sn gelmezse salt-okunur durum isteği gönder (yalnızca sayfa açıkken).
setInterval(()=>{if(mode==='ble'&&ble.connected&&ble.writeChar&&Date.now()-(ble.lastStatusAt||0)>20000)ble.requestStatus();},15000);

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
log('V3.9 DİZİ C: Kullanıcının RE5011 üzerinde START verdiğini doğruladığı 0x61 / 01 / HEDEF-B4 / 00 biçimi. Hedef canlı 3A00 cihaz verisinden alınır; CRC yeniden hesaplanır. STOP, 10–40°C hedef, Mod 0 korunur. 0x41 ACK ve Adım 5→1 izlenir; otomatik kontrol kapalı.');
render();
