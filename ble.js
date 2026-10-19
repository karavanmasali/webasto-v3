/** HeatGenie RE5011 BLE — supervised/manual diagnostics ONLY. */
import {HEATGENIE_SERVICE, HEATGENIE_READ_CHAR, HEATGENIE_WRITE_CHAR, parseHeatGenieStatus, crc16CcittZero} from './protocol.mjs?v=3.5.0';
import {guardedBuild,hexBytes} from './command-profile.mjs?v=3.5.0';
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
      // HeatGenie also sends valid 8-byte *command replies* on 3A00.
      // Keep them in diagnostic traces rather than labelling them bad telemetry.
      const raw = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? undefined);
      if(raw.length===8 && raw[0]===0xAA){
        if(crc16CcittZero(raw)!==0){this.onLog('KISA YANIT: CRC HATALI — geçersiz.');return;}
        const op='0x'+raw[2].toString(16).padStart(2,'0').toUpperCase();
        const arg=hexBytes(raw.subarray(3,6));
        this.onLog(`KISA YANIT CRC OK | opcode ${op} | alanlar ${arg} | Bu yanıt tek başına START başarısı değildir.`);
        return;
      }
      if(raw.length===0){return;} // Bazı cihaz sürümleri ilk subscribe/read anında boş DataView verir.
      const status=parseHeatGenieStatus(data);
      this.lastVerifiedStatus=status;this.lastStatusAt=Date.now();
      this.onLog(`CRC OK | Oda ${status.roomTemp.toFixed(1)} °C | Kasa ${status.caseTemp.toFixed(1)} °C | Akü ${status.voltage.toFixed(1)} V | Hedef ${status.target} °C | Mod ${((status.flags>>5)&3)} | Adım ${runningStep(status)} | Kayıt34=0x${status.register34.toString(16).padStart(2,'0')} (anlamı belirsiz) | Hata 0x${status.errorFlags.toString(16)}`);
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
  /** Controller reports HeatGenie run mode in high bits of flags register. */
  get runMode(){
    return this.lastVerifiedStatus ? ((this.lastVerifiedStatus.flags >> 5) & 3) : null;
  }
  async waitForStatus(predicate, durationMs){
    if(this.lastVerifiedStatus && predicate(this.lastVerifiedStatus))return true;
    return new Promise(resolve=>{
      const timer=setTimeout(()=>this.completeWaiter(false),durationMs);
      this.waiter={resolve,predicate,timer};
    });
  }
  async writeMode(value){
    if(!this.canControl)throw new Error('Mod işlemi için BLE telemetrisi güncel değil.');
    if(this.lastVerifiedStatus.errorFlags)throw new Error('Cihaz hata bildiriyor. Mod değiştirilmedi.');
    if(!isOffStep(this.lastVerifiedStatus) || this.lastVerifiedStatus.fan || this.lastVerifiedStatus.pump || this.lastVerifiedStatus.glow)
      throw new Error('Mod değişikliği yalnızca tamamen durmuş ısıtıcıda denenir.');
    const oldMode=this.runMode;
    if(oldMode===value){this.onLog('Mod zaten '+value+'. Yazma gerekmedi.');return true;}
    const beforeAt=this.lastStatusAt;
    const bytes=guardedBuild(value===2?'start-stop-mode':'constant-mode');
    this.onLog(`MOD ${oldMode} → ${value} yazılıyor (0x66): ${hexBytes(bytes)} | Adım=${runningStep(this.lastVerifiedStatus)}`);
    this.writePending=true;
    try {
      await this.writeChar.writeValueWithResponse(bytes);
      this.onLog('MOD GATT yazma yanıtı geldi. Cihazın yeni modunu bekliyorum.');
      // A response can arrive during the await; only a NEW status confirms it.
      const current=this.lastVerifiedStatus;
      const already=this.lastStatusAt>beforeAt && current && (((current.flags>>5)&3)===value);
      const confirmed=already || await this.waitForStatus(s=>((s.flags>>5)&3)===value,9000);
      this.onLog(`MOD ${value} SONUÇ: ${confirmed?'3A00 cihaz kaydından doğrulandı.':'DOĞRULANMADI. START GÖNDERİLMEYECEK.'}`);
      return confirmed;
    } finally {this.writePending=false;}
  }
  /** Experimental app-backed mode 2 (Start/Stop) before ONE power-on.
   * Unlike v3.4: no 0x65 refresh; this changes a *documented* controller mode.
   * If mode is not confirmed on live 3A00 status, start is never sent.
   * No automatic restore while power state is uncertain; user has explicit restore action.
   */
  async startWithMode2(){
    if(!this.canControl)throw new Error('START: geçerli BLE bağlantısı ve telemetri bekleniyor.');
    const initial=this.lastVerifiedStatus;
    if(initial.errorFlags)throw new Error('Cihaz hatası var. START gönderilmedi.');
    if(!isOffStep(initial) || initial.fan || initial.pump || initial.glow)
      throw new Error('Isıtıcı tamamen kapanıp fan durmadan START denenmez.');
    this.onLog(`V3.5 MODE-2 testi: önce mod=${this.runMode}, hedef=${initial.target}, adım=${runningStep(initial)}. Mod 2 doğrulanırsa tek START gönderilecek.`);
    const modeOK=await this.writeMode(2);
    if(!modeOK) return {transportAccepted:true, confirmed:false, modeVerified:false, kind:'mode'};
    // Give controller a moment to apply the new mode and confirm stability.
    await new Promise(resolve=>setTimeout(resolve,700));
    const now=this.lastVerifiedStatus;
    if(!this.canControl || this.runMode!==2 || !now || now.errorFlags || !isOffStep(now) || now.fan || now.pump || now.glow){
      this.onLog('Mod sonrası durum kararlı veya kapalı değil; START gönderilmedi.');
      return {transportAccepted:true,confirmed:false,modeVerified:true,kind:'mode'};
    }
    this.onLog('MOD 2 3A00 üzerinden DOĞRULANDI. Şimdi tek 0x61 START gönderiliyor.');
    const result=await this.sendCommand('start');
    return {...result, modeVerified:true};
  }
  async restoreTemperatureMode(){
    this.onLog('V3.5: kullanıcı talebiyle otomatik sıcaklık moduna (0) dönülüyor.');
    return this.writeMode(0);
  }
  async start(){return this.startWithMode2();}
  async stop(){return this.sendCommand('stop');}
  async target(degrees){return this.sendCommand('target',degrees);}
}
