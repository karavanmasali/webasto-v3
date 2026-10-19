# Karavan Webasto V3.9 — OTOMATİK TERMOSTAT (gerçek cihaz testi)

V3.8 üzerine eklenenler:
- **Gerçek cihazda otomatik START/STOP** (`auto-engine.mjs`). iOS uygulamasındaki motorla aynı mantık: oda ≥ STOP → (gecikme sonrası) STOP; oda ≤ START → START.
- Yeniden başlatma beklemesi, saatlik START sınırı (4), etkisiz START'ta en çok 2 deneme, etkisiz STOP'ta 60 sn arayla 3 tekrar.
- Otomatik mod kendini kapatır: hata bayrağı, Fahrenheit, iki başarısız START, yeniden bağlanma süresi aşımı.
- **STOP artık hiçbir koşula bağlı değil**: hedef testi, hata bayrağı ve telemetri tazeliği STOP'u engellemez; doğrulama beklenirken de STOP gönderilebilir.
- **Art arda START**: tek bağlantıda kilit yok (60 sn koruması var). 0x41 "TEKRAR KOMUT" yanıtı gelirse sonraki START'ta B4 ±1 kaydırılır (DOĞRULANMAMIŞ varsayım; kayıttaki `0x41 ACK` satırlarına bak).
- **Otomatik yeniden bağlanma** (en çok 10 dk, kullanıcı hareketi gerekmez), telemetri 20 sn gelmezse salt-okunur durum isteği.
- Bildirim (izin verilirse), ekran uyku kilidi (otomatik açıkken).

## Test (Windows / Chrome)
1. Dosyaları GitHub Pages deposunun köküne yükle, `Ctrl+Shift+R` ile yenile; başlık `V3.9` olmalı.
2. Bağlan → manuel test onay kutusu → hedef +/− ile bir derece değiştirip geri okumayı doğrula.
3. Önce **manuel** START ve STOP'u dene (adım 5→1, soğutma).
4. START/STOP eşiklerini odanın hemen üstüne/altına getirip **Otomatik termostat**'ı aç; kayıtta `OTOMATİK KARAR` satırlarını izle.
5. START → STOP → START döngüsünde `0x41 ACK` durumuna bak (TEKRAR KOMUT çıkıyor mu?).
6. Bluetooth'u (ısıtıcı kapsama alanı dışına çıkarak ya da kısa süre) kesip yeniden bağlanmayı dene.
7. Tanı kaydını indirip paylaş.

Sınırlar: tarayıcı sekmesi ve bilgisayar açık kalmalı; bilgisayar uykuya geçerse otomatik kontrol durur. Oda sıcaklığı ısıtıcının verdiği değerdir.
CO alarmı, havalandırma ve cihaz başında gözetim olmadan otomatik mod kullanma.
