# Karavan Webasto V3.3 — kontrollü START testi

**Deneysel sürüm.** RE5011 üzerinde gerçek START henüz doğrulanmadı. Fiziksel ısıtıcıyı yalnızca yanında, yeterli havalandırma ve CO alarmı varken test edin. Otomatik termostat Bluetooth bağlantısında kapalıdır. iPhone arka planda güvenilir çalışma sağlamaz.

## Neler değişti?
- Hedef sıcaklığı +/− aralığı 10–40°C (HeatGenie kullanıcı kılavuzundaki aralık) ve demo START/STOP sınırları buna uygun.
- STOP/CLEAR (`AA 00 61 02 FF 00 25 D3`) ve hedef gönderim komutlarının biçimi değiştirilmedi.
- START testi: **önce sabit sıcaklık modu** (`AA 00 66 00 00 00 19 61`) bir kere gönderiliyor, 3A00 durum raporu gözleniyor, sonra **tek START** (`AA 00 61 01 FF 00 7C 83`) gönderiliyor. Yeni sıra RE5011 donanımında DOĞRULANMADI. Isıtıcı diğer moddaysa veya fan/pompa/kızdırma çalışıyorsa test iptal edilir.
- Başlatmadan önce/sonra durum adımı ve *kayıt34* değişimi tanılama dosyasında gösteriliyor. Kayıt34 alanının anlamı henüz belirlenmedi.
- Otomatik tekrar yok; GATT yazma onayı ateşlemenin gerçekleştiği anlamına gelmez.

## GitHub
ZIP'i çıkarıp tüm dosyaları `karavanmasali/webasto-v3` deponun **köküne** yükle (`Add file` → `Upload files` → `Commit changes`). `main` ve `/(root)` Pages ayarları aynı kalır. `.nojekyll` değişmiyorsa yeniden oluşturma. Sitede Ctrl+Shift+R yap ve başlığın `V3.3 START TEST` olduğunu kontrol et.

## Deneme
1. Isıtıcının normal soğutmasını tamamladığını, fan/pompa/kızdırmanın kapalı olduğunu kontrol et. Bluetooth bağlı ve hata kodu sıfır olsun.
2. Manuel test onayını aç; önce hedef +/− ile bir kez cihazdan geri okuma testini tamamla.
3. `START (SABİT MOD TEST)` düğmesine **bir kere** bas. Her komut iki ayrı GATT yazması içeren onaylı bir testtir; ekranda ve gerçek cihazda ateşleme başlayıp başlamadığını izle.
4. Başlamazsa başka deneme yapma. `Tanı kayıtlarını indir` çıktısını paylaş. Başlarsa çalışmasını fiziksel olarak teyit et; STOP/CLEAR ile normal soğutma tamamlat.

## Kanıt ve sınırlar
Önceki V3.2 kaydında 20:55:08'de START GATT yazması başarılıydı, ama cihazın durum adımı 5'te kalmıştı; durum paketinde ham kayıt34 02→01 değişmişti. Bu alan için protokol belgesi anlam belirtmiyor. Bu nedenle "START kabul edildi" veya "başlatma düzeldi" sonucunu peşinen iddia etmiyoruz.

Komut profili: `diesel-heater-ble 0.3.8 / ProtocolHeatGenie`, MIT (LICENSE-THIRD-PARTY.txt). HeatGenie 10–40°C limit kaynağı: https://www.dieselheat.com.au/dieselheat-2-2kw-air-heatgenie-app-user-guide/
