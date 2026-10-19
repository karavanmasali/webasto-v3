/* HeatGenie BLE GATT: yalnızca keşif/okuma. Doğrulanmamış komut üretilmez. */
export const HEATGENIE_SERVICE = '0000181a-0000-1000-8000-00805f9b34fb';
const hex = data => Array.from(new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? undefined))
  .map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();
export class HeatGenieBLE {
  constructor(onLog, onDisconnect) {
    this.onLog = onLog; this.onDisconnect = onDisconnect;
    this.device = null; this.server = null; this.chars = [];
    this.connected = false;
  }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Bu tarayıcı Web Bluetooth desteklemiyor. iPhone için Bluefy kullan.');
    // Kullanıcı seçimi zorunlu, program arka planda cihaz aramaz.
    const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:[HEATGENIE_SERVICE]});
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.connected=false;this.chars=[];
      this.onLog('Bluetooth bağlantısı koptu. Otomatik kontrol durduruldu.');
      this.onDisconnect();
    });
    this.server=await device.gatt.connect();
    this.connected=true;
    const services = await this.server.getPrimaryServices();
    this.onLog('Bağlandı: '+ (device.name||'Adsız cihaz') + ' | Servis sayısı: '+services.length);
    const heatgenie = services.find(s => s.uuid.toLowerCase() === HEATGENIE_SERVICE);
    if (!heatgenie) {
      this.onLog('Uyarı: 181A HeatGenie servisi bulunamadı; başka cihaz seçilmiş olabilir.');
      return device.name;
    }
    const chars = await heatgenie.getCharacteristics();
    this.chars = chars;
    for (const ch of chars) {
      const p=ch.properties;
      this.onLog(`Karakteristik ${ch.uuid}; read=${p.read}, notify=${p.notify}, write=${p.write}, writeNoResp=${p.writeWithoutResponse}`);
      if (p.notify || p.indicate) {
        try {
          ch.addEventListener('characteristicvaluechanged', e => this.onLog(`BİLDİRİM ${ch.uuid}: ${hex(e.target.value)}`));
          await ch.startNotifications();
        } catch(e) {this.onLog(`Bildirim açılamadı ${ch.uuid}: ${e.message}`);}
      }
      if (p.read) {
        try { const v=await ch.readValue();this.onLog(`OKUMA ${ch.uuid}: ${hex(v)}`); }
        catch(e) {this.onLog(`Okuma başarısız ${ch.uuid}: ${e.message}`);}
      }
    }
    return device.name || 'Bluetooth cihazı';
  }
  async read() {
    for (const ch of this.chars) if(ch.properties.read) {
      try {this.onLog(`OKUMA ${ch.uuid}: ${hex(await ch.readValue())}`);}
      catch(e) {this.onLog(e.message);}
    }
  }
  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.connected=false;this.chars=[];
  }
  get canControl() {return false;} // HeatGenie çerçeveleri doğrulanana kadar kapalı.
  async start() {throw new Error('Gerçek START paketi doğrulanmadı; komut gönderilmedi.');}
  async stop() {throw new Error('Gerçek STOP/CLEAR paketi doğrulanmadı; komut gönderilmedi.');}
  async target() {throw new Error('Gerçek hedef sıcaklık paketi doğrulanmadı; komut gönderilmedi.');}
}
