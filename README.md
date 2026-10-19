# Karavan Webasto V3.6 — Manual Mode 1 + START Diagnosis

**RE5011 cihazında START henüz doğrulanmadı. Yalnızca gözetimli manuel test içindir.**

## V3.5 kaydından kesin tespit

1. `AA 00 66 00 00 02 39 23` cihazdan ACK aldı ve 3A00 mod 2 oldu.
2. Ardından `AA 00 61 01 FF 00 7C 83` GATT yazması başarılıydı ama durum 5'ten çıkmadı.
3. `Otomatik/Sıcaklık moduna dön (0)` komutu gerçekten mod 0'a döndürdü.
4. Kullanıcı ardından START'a bastığında **V3.5 kodu gizlice yine MOD 2 seçti.** Dolayısıyla bu iki deneme de fiilen MOD 2 + START oldu; doğrudan MOD 0 START denemesi değildi.

## V3.6'da yeni deney

- Tek kalan alternatif HeatGenie çalışma modu **1 (manuel güç)** denenir; kaynağı `diesel-heater-ble 0.3.8 ProtocolHeatGenie` (MIT).
- Cihaz MOD 0'dayken, tamamen durmuşken ve kullanıcı açık onay verdiğinde `AA 00 66 00 00 01 [CRC16]` ile MOD 1 seçilir.
- Mod 1 yalnızca canlı 3A00 flags bit 5-6 = 1 ile **doğrulanırsa** ve cihaz hâlâ kapalıysa mevcut START bir kere gönderilir. Yeni START HEX'i keşfedildiği iddia edilmez.
- Mod değişimi tek başına çalışmayı başlatırsa ikinci START gönderilmez.
- Her bağlantıda START yalnızca **bir kez** denenebilir. Başlamazsa ikinci kez basmak yerine log indirilir.
- MOD 0'a geri dönüş düğmesi hem MOD 1 hem MOD 2'den çalışır (yalnızca ısıtıcı durduğunda).

## Kesinlikle korunacaklar

- STOP/CLEAR: `AA 00 61 02 FF 00 25 D3` (değişmedi).
- Hedef +/−: `AA 00 66 01 00 XX CRC` (değişmedi).
- Hedef sıcaklık **10–40°C**.
- Canlı telemetri, kısa 8-bayt ACK, CRC16, demo, gerçek cihazda otomatik kontrol kapalı.

## Kurulum ve test

ZIP'teki dosyaları `karavanmasali/webasto-v3` GitHub depo köküne yükle, `.nojekyll` dosyasını silme. Ctrl+Shift+R yapıp başlığın `V3.6 MOD 1 / START TEST` olduğundan emin ol.

1. Isıtıcı tamamen kapanıp soğutma döngüsünü bitirsin; gözetim, havalandırma, CO alarmı hazır olsun.
2. Bluetooth'a bağlan. Mevcut **Mod 2** ise önce `Otomatik/Sıcaklık moduna dön (0)` düğmesine bas; mod 0 geri okumasını doğrula.
3. Hedef +1/−1 testini cihazdan doğrula, manuel test onayını ver.
4. **START (MOD 1 + TEK START)** düğmesine yalnızca bir kere bas.
5. Sonuç ne olursa olsun **Tanı kayıtlarını indir** dosyasını gönder. Otomatik ikinci START yok. Fiziksel START başarılı olursa gerektiğinde bilinen STOP/CLEAR ile olağan kapanma/soğutma yap. Cihaz tamamen durduğunda mod 0'a geri dön.

Bu test de başarısız olursa rastgele yeni HEX göndermek yerine orijinal HeatGenie uygulamasının gerçek START BLE yazması yakalanmalıdır. Windows'taki sadece 3A00 dinlemesi bu yazmayı göremez.
