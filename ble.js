/** HeatGenie RE5011 BLE — supervised/manual diagnostics ONLY. */
import {HEATGENIE_SERVICE, HEATGENIE_READ_CHAR, HEATGENIE_WRITE_CHAR, parseHeatGenieStatus} from './protocol.mjs?v=3.3.0';
import {guardedBuild,hexBytes} from './command-profile.mjs?v=3.3.0';
const bufferHex = data => hexBytes(new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? undefined));
export const runningStep = status => status.stateCode & 0x0f;
export const isOffStep = status => [0,5].includes(runningStep(status));
export class HeatGenieBLE {
  constructor(onLog, onDisconnect, onStatus=()=>{}) {
    this.onLog=onLog;this.onDisconnect=onDisconnect;this.onStatus=onStatus;
    this.device=null;this.server=null;this.chars=[];this.writeChar=null;
    this.lastVerifiedStatus=null;this.lastStatusAt=0;
    this.connected=false;this.writePending=false;this.waiter=null;
  }
  process(data, source) {
    this.onLog(`${source}: ${bufferHex(data)}`);
    try {
      const status=parseHeatGenieStatus(data);
      this.lastVerifiedStatus=status;this.lastStatusAt=Date.now();
      this.onLog(`CRC OK | Oda ${status.roomTemp.toFixed(1)} °C | Kasa ${status.caseTemp.toFixed(1)} °C | Akü ${status.voltage.toFixed(1)} V | Hedef ${status.target} °C | Adım ${runningStep(status)} | Kayıt34=0x${status.register34.toString(16).padStart(2,'0')} (anlamı belirsiz) | Hata 0x${status.errorFlags.toString(16)}`);
      this.onStatus(status);
      if(this.waiter && this.waiter.predicate(status)) this.completeWaiter(true);
    }catch(e){this.onLog(`Paket atlandı: ${e.message}`);}
  }
  completeWaiter(confirmed) {
    if(!this.waiter)return;
    const w=this.waiter;this.waiter=null;clearTimeout(w.timer);w.resolve(confirmed);
  }
  onLost() {
    this.connected=false;this.chars=[];this.writeChar=null;this.lastVerifiedStatus=null;this.lastStatusAt=0;
    this.completeWaiter(false);this.onLog('Bluetooth bağlantısı kesildi. Manuel test durduruldu.');this.onDisconnect();
  }
  async connect() {
    if(!navigator.bluetooth)throw new Error('Web Bluetooth için Windows Chrome/Edge kullan.');
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[HEATGENIE_SERVICE]});
    this.device=device;
    device.addEventListener('gattserverdisconnected',()=>this.onLost());
    this.server=await device.gatt.connect();this.connected=true;
    try {
      const svc=await this.server.getPrimaryService(HEATGENIE_SERVICE);
      const chars=await svc.getCharacteristics();this.chars=chars;
      this.writeChar=chars.find(ch=>ch.uuid.toLowerCase()===HEATGENIE_WRITE_CHAR && ch.properties.write)??null;
      for(const ch of chars){
        const p=ch.properties;
        this.onLog(`Karakteristik ${ch.uuid}; read=${p.read}, notify=${p.notify}, write=${p.write}, writeNoResp=${p.writeWithoutResponse}`);
        if(ch.uuid.toLowerCase()===HEATGENIE_READ_CHAR){
          if(p.notify){
            ch.addEventListener('characteristicvaluechanged',e=>this.process(e.target.value,`BİLDİRİM ${ch.uuid}`));
            await ch.startNotifications();this.onLog('3A00 bildirimleri başlatıldı.');
          }
          if(p.read){try{this.process(await ch.readValue(),`OKUMA ${ch.uuid}`);}catch(e){this.onLog(`İlk okuma alınamadı: ${e.message}`);}}
        }
      }
      if(!this.writeChar)this.onLog('UYARI: 3A01 yazma karakteristiği yok; manuel test kilitli.');
      return device.name||'Bluetooth cihazı';
    }catch(e){this.disconnect();throw e;}
  }
  async read(){
    const ch=this.chars.find(x=>x.uuid.toLowerCase()===HEATGENIE_READ_CHAR && x.properties.read);
    if(ch){try{this.process(await ch.readValue(),`OKUMA ${ch.uuid}`);}catch(e){this.onLog(`Okuma hatası: ${e.message}`);}}
  }
  disconnect(){
    if(this.device?.gatt?.connected)this.device.gatt.disconnect();
    this.connected=false;this.chars=[];this.writeChar=null;this.lastVerifiedStatus=null;this.lastStatusAt=0;this.completeWaiter(false);
  }
  get canControl() {
    return this.connected && !!this.writeChar && !!this.lastVerifiedStatus &&
      Date.now()-this.lastStatusAt < 6000 && !this.writePending;
  }
  async sendCommand(operation,value){
    if(!this.canControl)throw new Error('Güncel ve doğrulanmış telemetri veya 3A01 bağlantısı yok.');
    if(this.writePending)throw new Error('Önceki komut henüz tamamlanmadı.');
    if(this.lastVerifiedStatus.errorFlags)throw new Error('Cihazda hata bayrağı var. Orijinal kontrol panelinden kontrol edin.');
    if(operation==='target' && (this.lastVerifiedStatus.flags & 0x10))throw new Error('Cihaz Fahrenheit modunda; Celsius hedef komutu göndermeyeceğiz.');
    const old=this.lastVerifiedStatus;
    if(operation==='start' && !isOffStep(old))throw new Error('START için cihazın kapalı/bekleme halinde olması gerekiyor.');
    if(operation==='stop' && isOffStep(old))throw new Error('STOP için cihaz zaten kapalı/bekleme durumunda görünüyor.');
    if(operation==='target' && old.target===value)throw new Error(`Cihaz zaten ${value} °C hedefte.`);
    const bytes=guardedBuild(operation,value);
    this.writePending=true;
    try {
      this.onLog(`3A01 YAZMA İSTEĞİ (${operation}${operation==='target'?' '+value+'°C':''}): ${hexBytes(bytes)} | Önceki durum adımı: ${runningStep(old)} | Hedef: ${old.target}`);
      // RE5011 reports write=true, writeWithoutResponse=false. Do not force no-response.
      await this.writeChar.writeValueWithResponse(bytes);
      this.onLog(`3A01 GATT yazma yanıtı alındı (${operation}). Bu, ısıtıcının komutu UYGULADIĞINI kanıtlamaz.`);
      let predicate;
      if(operation==='target')predicate=s=>s.target===value;
      else if(operation==='start')predicate=s=>!isOffStep(s) && !s.errorFlags;
      else predicate=s=>isOffStep(s)||runningStep(s)!==runningStep(old);
      const confirmed=await new Promise(resolve=>{
        const timer=setTimeout(()=>this.completeWaiter(false), operation==='target'?6500:16000);
        this.waiter={resolve,predicate,timer};
      });
      if(operation==='start'){
        const now=this.lastVerifiedStatus;
        this.onLog(`START alan karşılaştırması: kayıt34 0x${old.register34.toString(16).padStart(2,'0')} → 0x${(now?.register34 ?? old.register34).toString(16).padStart(2,'0')}; adım ${runningStep(old)} → ${now?runningStep(now):'bilinmiyor'}. Kayıt34 anlamı kesin değil, ateşleme kanıtı değildir.`);
      }
      if(confirmed){
        this.onLog(operation==='target' ? `CİHAZ HEDEF OKUMASI DOĞRULANDI: ${value} °C` : `CİHAZ DURUM DEĞİŞİMİ GÖRÜLDÜ (${operation}); ateşleme/soğutmanın tamamlandığı anlamına gelmez.`);
      }else this.onLog(`CİHAZ ETKİSİ DOĞRULANAMADI (${operation}). Aynı komutu otomatik tekrarlama.`);
      return {transportAccepted:true,confirmed,kind:operation==='target'?'target':'transition'};
    }catch(e){this.onLog(`3A01 komut hatası (${operation}): ${e.message}`);throw e;}
    finally{this.writePending=false;}
  }
  /** V3.3 kontrollü START denemesi: aynı mevcut güç komutunu sabit sıcaklık modu tekrar seçildikten sonra gönderir.
   * Kullanıcı tek seferlik onay verir. Bu sıralamanın RE5011 üzerinde işe yaradığı henüz doğrulanmadı.
   * STOP ve hedef yazma yolları değiştirilmemiştir.
   */
  async startWithConstantMode(){
    if(!this.canControl)throw new Error('START: geçerli BLE bağlantısı ve telemetri bekleniyor.');
    const initial=this.lastVerifiedStatus;
    if(initial.errorFlags)throw new Error('Cihaz hata bildiriyor; START testi durduruldu.');
    if(!isOffStep(initial))throw new Error('START testi yalnızca kapalı/bekleme adımında yapılabilir.');
    if(initial.fan || initial.pump || initial.glow)throw new Error('Fan/pompa/kızdırma hâlâ çalışıyor. Soğutma bitmeden START testi yapılmaz.');
    const mode=(initial.flags >> 5) & 0x03;
    if(mode!==0)throw new Error(`Cihazın çalışma modu ${mode}; bu test sabit sıcaklık modunu değiştirmeyecek. Önce orijinal kumandadan Sabit modunu seç.`);
    const frame=guardedBuild('constant-mode');
    this.writePending=true;
    try {
      this.onLog(`V3.3 START öncesi SABİT MOD teyidi: ${hexBytes(frame)} | Adım=${runningStep(initial)}, kasa=${initial.caseTemp.toFixed(1)}°C, kayıt34=0x${initial.register34.toString(16).padStart(2,'0')}`);
      await this.writeChar.writeValueWithResponse(frame);
      this.onLog('Sabit mod GATT yazma onayı alındı; ısıtıcının modu uyguladığını tek başına kanıtlamaz.');
      await new Promise(resolve=>setTimeout(resolve,1300));
      const current=this.lastVerifiedStatus;
      if(!this.connected || !current || Date.now()-this.lastStatusAt>4500)throw new Error('Mod teyidi sonrası güncel durum okunamadı; START gönderilmedi.');
      if(current.errorFlags || !isOffStep(current) || current.fan || current.pump || current.glow)throw new Error('Mod teyidi sonrasında ısıtıcı durumu değişti / hata oluştu; START gönderilmedi.');
      if(((current.flags>>5)&3)!==0)throw new Error('Sabit sıcaklık modu doğrulanamadı; START gönderilmedi.');
    } finally {this.writePending=false;}
    this.onLog('Sabit sıcaklık modu hâlâ seçili. Tek START komutu gönderiliyor (tekrar yok).');
    return this.sendCommand('start');
  }
  async start(){return this.startWithConstantMode();}
  async stop(){return this.sendCommand('stop');}
  async target(degrees){return this.sendCommand('target',degrees);}
}
