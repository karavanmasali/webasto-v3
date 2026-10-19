# Karavan Webasto V3 — Quatro / HeatGenie

## Bu sürüm ne yapar?
- Koyu renk, telefon uyumlu arayüz; manuel START/STOP ve hedef sıcaklık kontrolünün **demo modu**.
- Gerçek Web Bluetooth servis keşfi, `181A` HeatGenie servisi, bildirim ve ham okuma tanısı.
- START / STOP sıcaklıkları, en az 2°C aralık, 20 sn STOP eşiğinde bekleme, 120 sn yeniden başlatma beklemesi; isteğe bağlı süreler.
- Otomatik mod açılınca STOP sıcaklığı ile hedef ayarın eşitlenmesi; STOP değişince hedefin de eşitlenmesi.
- Ayarlar yerel depolanır; güvenlik gerekçesiyle sayfa yenilendiğinde otomatik mod *kapalı* başlar.

## ÖNEMLİ — gerçek cihaz desteği
HeatGenie gerçek cihaz START, STOP/CLEAR, hedef sıcaklık ve durum paketlerini bu sürümde doğrulayamadık. Bu yüzden BLE'de **yalnızca tanılama** açıktır. Bluetooth'a bağlanmak gerçek kontrolün tamamlandığı anlamına gelmez. Bu paketler doğrulanmadan ısıtıcıya rastgele komut göndermek güvenli değildir. Panelde gerçek START/STOP ve otomatik mod bilinçli olarak devre dışıdır. Yazılımı cihaz üzerinde gerçek çalışıyor diye sunmayın.

Entegrasyon için kullanılabilecek **bağımsız referans**, Home Assistant `diesel-heater-ble` (HeatGenie/Boygu protokolü) projesidir:
https://github.com/Spettacolo83/homeassistant-diesel-heater

## GitHub'a SIFIRDAN yükleme (.github klasörü gerekmez)
1. GitHub hesabına giriş yap: https://github.com/new
2. Repository name: `webasto-v3`; `Public` seç; `Add a README file` isteğe bağlı; `Create repository`.
3. Repository sayfasında `Add file` -> `Upload files` aç.
4. Bu ZIP'i bilgisayarda bir klasöre **çıkar**. `index.html`, `app.js`, `ble.js`, `thermostat.mjs`, `style.css`, `favicon.svg`, `manifest.webmanifest`, `.nojekyll` dosyalarını sürükleyip bırak. `webasto-v3` üst klasörünü değil, **içindeki dosyaları** köke koy.
5. `Commit changes` -> tekrar `Commit changes`.
6. `Settings` -> `Pages` -> `Build and deployment` -> `Source: Deploy from a branch` -> Branch `main` -> Folder `/(root)` -> `Save`.
7. Sayfa, `https://KULLANICIADI.github.io/webasto-v3/` adresinde yayımlanır. GitHub Actions, token veya `.github/workflows` hazırlamak gerekmez.
8. iPhone'da Safari Web Bluetooth desteklemediği için Bluefy ile HTTPS sayfasını aç: https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055
9. `Bluetooth ile cihazı bul` -> `RE5011` cihazını seç -> BLE tanı kayıtlarına bak. HeatGenie uygulaması bağlantıyı tutuyorsa önce uygulamayı tamamen kapat.

## Emniyet
- Demo gerçek cihazı başlatmaz/kapatmaz.
- Bu tarayıcı sayfası arka planda çalışacağı garanti edilen termostat **değildir**. Telefonda ekran kilidi ve işletim sistemi zamanlayıcıları kontrolü kesebilir.
- Uzun süre sahipsiz, otomatik çalışan bir ısıtıcı için yerel donanım tabanlı, doğrulanmış kontrol ve üreticinin güvenlik korumaları gerekir.
- Yanma havası, egzoz, karbonmonoksit alarmı, sigorta ve cihazın soğutma/clear prosedürleri bağımsız korunmalıdır; beslemeyi keserek STOP yapılmaz.

## Yerel test
`python -m http.server 8000` ve `http://localhost:8000` (uygun Web Bluetooth tarayıcısında). Termostat algoritma testleri: `node --test tests/thermostat.test.mjs`.
