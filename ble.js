/* HeatGenie BLE GATT: gerçek paket okuma ve CRC doğrulama. Kasıtlı olarak komut YOK. */
import {HEATGENIE_SERVICE, HEATGENIE_READ_CHAR, parseHeatGenieStatus} from './protocol.mjs';
const hex = data => Array.from(new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? undefined))
  .map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();
export class HeatGenieBLE {
  constructor(onLog, onDisconnect, onStatus=()=>{}) {
    this.onLog = onLog; this.onDisconnect = onDisconnect; this.onStatus = onStatus;
    this.device = null; this.server = null; this.chars = [];
    this.connected = false;
  }
  process(data, source) {
    this.onLog(`${source}: ${hex(data)}`);
    try {
      const status = parseHeatGenieStatus(data);
      this.onLog(`CRC OK | Oda ${status.roomTemp.toFixed(1)} °C | Kasa ${status.caseTemp.toFixed(1)} °C | Akü ${status.voltage.toFixed(1)} V | Hedef ${status.target} °C | Durum 0x${status.stateCode.toString(16).padStart(2,'0')} | Hata 0x${status.errorFlags.toString(16)}`);
      this.onStatus(status);
    } catch (e) {
      this.onLog(`Paket yorumlanmadı: ${e.message}`);
    }
  }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Bu tarayıcı Web Bluetooth desteklemiyor. iPhone için Bluefy kullan.');
    // Kullanıcı seçimi zorunlu, program arka planda cihaz aramaz.
    const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:[HEATGENIE_SERVICE]});
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.connected=false;this.chars=[];
      this.onLog('Bluetooth bağlantısı koptu. Otomatik kontrol kapalı.');
      this.onDisconnect();
    });
    this.server=await device.gatt.connect();
    this.connected=true;
    const services = await this.server.getPrimaryServices();
    this.onLog('Bağlandı: '+ (device.name||'Adsız cihaz') + ' | Servis sayısı: '+services.length);
    const heatgenie = services.find(s => s.uuid.toLowerCase() === HEATGENIE_SERVICE);
    if (!heatgenie) {
      this.onLog('181A HeatGenie servisi bulunamadı; başka cihaz seçilmiş olabilir.');
      return device.name;
    }
    const chars = await heatgenie.getCharacteristics();
    this.chars = chars;
    for (const ch of chars) {
      const p=ch.properties;
      this.onLog(`Karakteristik ${ch.uuid}; read=${p.read}, notify=${p.notify}, write=${p.write}, writeNoResp=${p.writeWithoutResponse}`);
      if (p.notify || p.indicate) {
        try {
          ch.addEventListener('characteristicvaluechanged', e => {
            if (ch.uuid.toLowerCase() === HEATGENIE_READ_CHAR) this.process(e.target.value, `BİLDİRİM ${ch.uuid}`);
          });
          await ch.startNotifications();
        } catch(e) {this.onLog(`Bildirim açılamadı ${ch.uuid}: ${e.message}`);}
      }
      if (p.read && ch.uuid.toLowerCase() === HEATGENIE_READ_CHAR) {
        try { this.process(await ch.readValue(), `OKUMA ${ch.uuid}`); }
        catch(e) {this.onLog(`Okuma başarısız ${ch.uuid}: ${e.message}`);}
      }
    }
    return device.name || 'Bluetooth cihazı';
  }
  async read() {
    for (const ch of this.chars) if(ch.properties.read && ch.uuid.toLowerCase() === HEATGENIE_READ_CHAR) {
      try {this.process(await ch.readValue(), `OKUMA ${ch.uuid}`);}
      catch(e) {this.onLog(e.message);}
    }
  }
  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.connected=false;this.chars=[];
  }
  get canControl() {return false;} // Komut çerçevelerini henüz doğrulamadık; güvenlik kilidi.
  async start() {throw new Error('START komut paketi doğrulanmadı; komut gönderilmedi.');}
  async stop() {throw new Error('STOP/CLEAR komut paketi doğrulanmadı; komut gönderilmedi.');}
  async target() {throw new Error('Hedef sıcaklık komut paketi doğrulanmadı; komut gönderilmedi.');}
}
