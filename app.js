import {changeStart,changeStop,updateAuto,safeConfig,clamp,thermostatDecision} from './thermostat.mjs?v=3.3.0';
import {HeatGenieBLE} from './ble.js?v=3.3.0';
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
const ble = new HeatGenieBLE(log,
  ()=>{mode='none';heater='unknown';manualArmed=false;targetTestConfirmed=false;cfg.auto=false;stopSince=null;lastUpdate=0;save();render();},
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
  });
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
 $('heaterSubstatus').textContent=mode==='demo'?'Simüle edilen ısıtıcı':mode==='ble'?(actualState===null?'Doğrulanmış 3A00 paketi bekleniyor':`Durum adımı: ${(actualState&0x0f)} · CRC doğrulandı · Manuel test ${manualArmed?'açık':'kapalı'}`):'Cihaz verisi bekleniyor';
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
 $('startBtn').disabled=!ready() || busy || (mode==='ble' && (!targetTestConfirmed || ![0,5].includes((actualState??255)&0x0f))) || (mode==='demo' && heater==='on');
 $('stopBtn').disabled=!ready() || busy || (mode==='ble' && (!targetTestConfirmed || [0,5].includes((actualState??255)&0x0f))) || (mode==='demo' && heater==='off');
 $('targetMinus').disabled=!ready() || busy || cfg.auto || (mode==='ble' && (targetOnDevice===null || targetOnDevice<=10));
 $('targetPlus').disabled=!ready() || busy || cfg.auto || (mode==='ble' && (targetOnDevice===null || targetOnDevice>=40));
 $('leaveBtn').disabled=mode!=='demo' || busy; // Karavandan ayrıldım otomatik komutu bu test sürümünde gerçek cihazda KAPALI
 $('manualTestArm').checked=manualArmed;
 $('manualTestArm').disabled=mode!=='ble' || busy;
 $('manualTestStatus').textContent= mode==='ble' ? (manualArmed ? (targetTestConfirmed?'Hedef testi onaylandı. START/STOP tek seferlik manuel testlere açık.':'Önce hedef sıcaklığı +1/−1 deneyip cihazdan geri okumayı doğrula.'):'Gerçek kontrol kilitli. Onay kutusunu işaretle.') : 'Yalnızca Bluetooth bağlantısı kurulduktan sonra manuel test açılabilir.';
 $('readBtn').disabled=mode!=='ble';
 $('modeNotice').innerHTML=mode==='demo'?'<strong>DEMO MODU.</strong> Ekrandaki komutlar sanaldır.':mode==='ble'?'<strong>V3.3 Manuel Komut Testi.</strong> 3A00 gerçek telemetri. Kaynak koddan alınan 3A01 komutları sadece açık onayla gönderilir; otomatik termostat kapalıdır.':'<strong>Gerçek cihaza bağlı değil.</strong> Demo veya Bluetooth tanılama kullan.';
 $('freshness').textContent=mode==='demo'?'Demo verisi':mode==='ble'?(lastUpdate?('Gerçek veri · '+(fresh()?'güncel':'eski')):'Paket bekleniyor'):'Veri yok';
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
     const confirmation = what==='start' ? 'V3.3 START testi: Önce SABİT SICAKLIK modu bir kez doğrulanacak, ardından tek START komutu gönderilecek. Ateşleme başlayabilir. Soğutma tamamen bitmiş mi, orijinal kumanda ve CO alarmı yanında mı?' : what==='stop' ? 'Bu gerçek STOP/CLEAR denemesidir. Isıtıcının normal soğutmasını gözlemlemelisin. Devam?' : `Gerçek ısıtıcı hedefi ${arg} °C yapılmaya çalışılacak. Onaylıyor musun?`;
     if(!window.confirm(confirmation)){log('Kullanıcı gerçek komutu iptal etti.');return;}
     let result;
     if(what==='start') result=await ble.start();
     else if(what==='stop') result=await ble.stop();
     else if(what==='target') result=await ble.target(arg);
     if(result?.confirmed && what==='target'){targetTestConfirmed=true;cfg.target=arg;save();}
     log(result?.confirmed ? `SONUÇ ${what}: ${what==='target'?'Cihaz ayarı geri okundu':'Durum değişimi algılandı (tam işlem doğrulanmadı)'}.` : `SONUÇ ${what}: 3A01 yazma başarılı, ancak cihaz etkisi DOĞRULANMADI.`);
     $('lastTestResult').textContent=result?.confirmed ? `${what.toUpperCase()}: ${what==='target'?'Hedef cihazdan geri okundu':'Cihaz durum değişikliği görüldü'}` : `${what.toUpperCase()}: GATT yazıldı ama cihazda sonuç görülmedi.`;
   }
 } catch(e) { log('Komut başarısız: '+e.message);$('autoReason').textContent=e.message; }
 finally {busy=false;render();}
}
const changeSettings=(update)=>{cfg=update(cfg);save();stopSince=null;render();};
$('startMinus').onclick=()=>changeSettings(c=>changeStart(c,-1));
$('startPlus').onclick=()=>changeSettings(c=>changeStart(c,1));
$('stopMinus').onclick=()=>{changeSettings(c=>changeStop(c,-1));if(cfg.auto) command('target',cfg.target);};
$('stopPlus').onclick=()=>{changeSettings(c=>changeStop(c,1));if(cfg.auto) command('target',cfg.target);};
$('targetMinus').onclick=()=>{const next=clamp((mode==='ble'?targetOnDevice:cfg.target)-1,10,40);if(mode==='demo'){cfg.target=next;save();}render();command('target',next);};
$('targetPlus').onclick=()=>{const next=clamp((mode==='ble'?targetOnDevice:cfg.target)+1,10,40);if(mode==='demo'){cfg.target=next;save();}render();command('target',next);};
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
$('disconnectBtn').onclick=()=>{manualArmed=false;targetTestConfirmed=false;cfg.auto=false;save();ble.disconnect();mode='none';heater='unknown';render();};
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
log('V3.3 test: HeatGenie komutları diesel-heater-ble 0.3.8 kaynak koduna göre hazır. RE5011 cihaz etkisi henüz doğrulanmadı. Manuel onay gerekir, otomatik kontrol kapalı.');
render();
