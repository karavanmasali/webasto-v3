# Karavan Webasto V3.5 — MOD 2 + START Testi

**Deneysel sürüm. RE5011’de START henüz doğrulanmadı.** 0x61 START komutu V3.2–V3.4 sürümlerinde ısıtıcıyı başlatmadı; 0x65 otomatik telemetri kaydı da işe yaramadı. V3.5 yeni bir deneme olarak, uygulama kaynak kütüphanesinde belgelenen *START/STOP çalışma modu 2* için `0x66 00 00 02` komutunu kullanır.

## Aynen korunanlar
- **STOP/CLEAR** baytları değişmedi: `AA 00 61 02 FF 00 25 D3`.
- **Hedef +/−** komutu aynı, sınır **10–40°C**.
- Bluetooth 3A00 CRC telemetrisi / 3A01 GATT yazma / manuel onay / demoda termostat mantığı / gerçek cihazda otomatik kontrol KAPALI.

## START modu testi
1. Cihaz tamamen durmuş olmalı. Önce manüel onay ve hedef sıcaklığı +1/−1 geri okuma testi gerekir.
2. `AA 00 66 00 00 02 [CRC16]` ile çalışma modu 2 (START/STOP) seçilir. Bu, `diesel-heater-ble 0.3.8 ProtocolHeatGenie` kaynak kodundaki `build_command(2, 2, 0)` çağrısıyla aynıdır.
3. Mod ancak **yeni 3A00 telemetrisinin flags[6:5]==2** olduğu cihaz raporuyla doğrulanır. Sadece GATT ACK yeterli değildir.
4. **Mod doğrulanmazsa START hiç gönderilmez.** Doğrulanırsa geçerli/hatasız/kapalı durumda yalnızca bir kez eski `AA 00 61 01 FF 00 7C 83` komutu gönderilir.
5. Ateşleme başlamazsa dosyayı indir ve gönder; otomatik ikinci deneme yok.

**Mod değişikliği kalıcı olabilir.** Uygulamadaki `Otomatik/Sıcaklık moduna dön (0)` düğmesi yalnızca ısıtıcı tamamen durmuş, Bluetooth bağlantısı ve manüel onay etkin ve çalışma modu 2 ise kullanılabilir. Mod 0'a döndüğünü 3A00 kaydından doğrular. Herhangi bir ara koşulda kumandayı kullan. Modu çalışırken değiştirme.

## GitHub kurulum
ZIP içindeki dosyaları doğrudan `karavanmasali/webasto-v3` deposunun kök dizinine yükle, onayla. Var olan `.nojekyll` dosyasını silme. `Ctrl + Shift + R` ile önbelleği yenile. Başlık `V3.5 MOD 2 / START TEST` olmalı.

## Güvenli test
Normal soğutma tamamen bittiğinde, aktif CO alarmı ve gözetimle Windows Chrome üzerinden bağlan. Manuel onayı ver, hedef +/− testini tamamla, **bir kez** `START (MOD 2 + TEK START)` bas. Başlarsa orijinal kumanda veya bilinen STOP/CLEAR ile normal kapanma/soğutma uygula. Başlamazsa hemen **Tanı kayıtlarını indir**, tekrar START basma.

Kaynak: `diesel-heater-ble 0.3.8`, MIT. Protokolde Mode 2=START/STOP, Mode 0=Auto. Bu kaynak bilgisi tek başına fiziksel RE5011 kabulünü kanıtlamaz.
