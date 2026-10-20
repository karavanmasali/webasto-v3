# Karavan Webasto V4.0 (web)

Sade arayüz + kalıcı otomatik mod + çalışma geçmişi. Windows Chrome/Edge, HTTPS (GitHub Pages) gerekir.

## Ekranlar
- **Ana ekran:** ortam sıcaklığı, cihaz durumu, bağlantı durumu (Bağlı / Yeniden bağlanıyor / Bağlantı kesildi), akü, son START/STOP saati, START ve STOP sıcaklık ayarı, otomatik mod anahtarı, manuel START/STOP.
- **Geçmiş:** START/STOP sayısı, toplam çalışma süresi, sıcaklık aralığı (son 12 saat / 24 saat / bugün), sıcaklık grafiği (çalışma aralıkları gölgeli), olay listesi (saat + kaynak: otomatik/manuel/cihaz), CSV dışa aktarma.
- **Ayrıntılar:** bildirimler, STOP gecikmesi, minimum çalışma süresi, minimum bekleme, Mod 0’a dön, bağlantıyı kes, tanı kaydı.
- **Gece modu (☾):** siyah/koyu kırmızı sade ekran; START/STOP için butona 1,5 sn basılı tutmak gerekir; çıkış da basılı tutarak.

## Davranış
- Otomatik mod tercihi tarayıcıda saklanır; sayfa yenilense de açık kalır. Yalnızca **manuel STOP** veya güvenlik nedeniyle (cihaz hatası, Fahrenheit, art arda 2 etkisiz START) kapanır; kapanınca ekranda söylenir. Manuel START otomatiği kapatmaz.
- Bağlantı kopsa da tercih saklanır; ana ekranda kırmızı şeritle “Otomatik mod AÇIK ama kontrol çalışmıyor” yazar. 10 dk boyunca kendiliğinden yeniden bağlanmayı dener. Sayfa yenilenince daha önce izin verilen cihaza sessizce bağlanmayı dener (Chrome izin verirse), yoksa “Bluetooth’a bağlan” gerekir.
- STOP sıcaklığını değiştirince (otomatik açıkken) Webasto’nun hedefi de güncellenir.
- Oda STOP sıcaklığına ulaşsa bile **minimum çalışma süresi** (varsayılan 10 dk) dolmadan STOP gitmez. STOP sonrası soğutma bitmeden (fan/pompa/kızdırma kapanmadan) START gitmez; ayrıca **minimum bekleme** (varsayılan 3 dk) ve saatte en çok 4 START sınırı vardır.
- **Akü:** her zaman gösterilir. Uyarı yalnızca ısıtıcı çalışırken (soğutma ve kapalıyken değil) 11,0 V altında 30 sn sürerse gelir (cihaz ~10,8 V’ta keser).
- **Bildirimler** (tarayıcı izni gerekir): START/STOP sessiz, uyarılar (hata, bağlantı kopması, düşük akü, etkisiz komut) sesli. Ör. “02:15 — Ortam 20°C, Webasto çalıştırıldı.”
- Geçmiş (olaylar + dakikada bir sıcaklık örneği, 7 gün) bu tarayıcıda, bu sitenin verisi olarak saklanır; site verisini silersen geçmiş de gider.

## Sınırlar
- Chrome sekmesi açık ve bilgisayar uyanık olmalı (otomatik açıkken ekran uyku kilidi alınır). Tarayıcı kapalıyken kontrol ve bildirim yoktur; bu iOS uygulamasının işi.
- Isıtıcı aynı anda tek BLE bağlantısı kabul eder: HeatGenie uygulaması açıkken bu sayfa bağlanamaz.
- Oda sıcaklığı ısıtıcının verdiği değerdir.

## Yükleme
Dosyaları GitHub Pages deposunun köküne yükle (eski `thermostat.mjs` ve `V3.2-KOMUT-DURUMU.md` dosyalarını silebilirsin), `Ctrl+Shift+R` ile yenile.
