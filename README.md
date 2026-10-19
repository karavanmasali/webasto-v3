# Karavan Webasto V3.8 — DİZİ C TEK START

**Cihaz START'ı için seçilen yöntem kullanıcı tarafından bağımsız RE5011 START aracıyla fiziksel olarak başarılı bildirilmiştir. V3.8 web uygulamasında çalışma henüz ayrıca doğrulanmadı.**

## Kullanıcı tarafından başarılı olduğu bildirilen yöntemin programa entegrasyonu

- Referans kaynak: kullanıcının gönderdiği `re5011_start_test.html`, Dizi C (`btnSeqC`, satır 208): `build(0x61,0x01,tgt(),0x00)`.
- START (Dizi C) = `AA 00 61 01 [B4=sıcaklık, 10..40] 00 [CRC-H] [CRC-L]`.
- B4 **tarayıcıdaki eski bir sayıdan değil**, güncel ve CRC'si doğrulanmış **3A00 telemetrisindeki hedef sıcaklıktan** alınır. Böylece 10–40°C aralığı geçerlidir.
- 22°C örneği: `AA 00 61 01 16 00 D6 A9`.
- 23°C örneği: `AA 00 61 01 17 00 E5 98`.
- 25°C örneği: `AA 00 61 01 19 00 C6 97`.
- 0x41 komut kabul yanıtında B4 eşleşmesi kontrol edilir. Nihai fiziksel başarı `Adım 5→1` veya başka gerçek çalışma adımı ve fan/kızdırma gibi cihaz aktivitesiyle değerlendirilir. GATT yazma sonucu tek başına yeterli değildir.
- Otomatik tekrar yok. MOD 0 korunur, MOD 1 ve MOD 2'ye gizlice geçilmez.

## Değiştirilmeyen fonksiyonlar

- STOP/CLEAR aynen: `AA 00 61 02 FF 00 25 D3`.
- Hedef sıcaklık +/− aynen: `0x66 0x01 0x00 [hedef]`, 10–40°C, cihazdan geri okuma onayı.
- Hata/CRC/kapanma güvenliği, tek START/bağlantı, manuel onay.
- Gerçek cihaz otomatik termostatı **henüz açılmadı**. Önce V3.8 fiziksel START+STOP denemesi ve soğutma davranışı doğrulanmalı.

## GitHub Pages'e kurulum

ZIP içindeki dosyaları `karavanmasali/webasto-v3` deposunun **köküne** yükle ve `Commit changes` yap. Mevcut `.nojekyll` dosyasını silme. Ardından `https://karavanmasali.github.io/webasto-v3/` adresini Windows Chrome'da `Ctrl+Shift+R` ile yenile. Başlık `V3.8 DİZİ C START` olmalı.

## Gerçek cihazda tek kontrol

1. Isıtıcı tamamen durmuş olsun; soğutma tamamlanmış olsun. Ortam havalandırması ve çalışan CO alarmı sağla.
2. Bluetooth bağlantısı kur, cihaz MOD 0 (sıcaklık) değilse tamamen durmuşken `Otomatik/Sıcaklık moduna dön (0)` düğmesini kullan.
3. Manuel testi onayla, hedefi 1°C değiştirip cihazdan geri okuma ile doğrula (istersen tekrar 22°C'ye ayarla).
4. `START (DİZİ C · HEDEF + TEK START)` düğmesine **bir defa** bas. Yanında fan/kızdırma ve çalışma adımını gözle.
5. Tanı kaydını indir ve paylaş. Otomatik ikinci START yapma.

Bu sürüm kullanıcı tarafından doğrulandığı bildirilen Dizi C'nin entegrasyonudur; yazılım testleri fiziksel ısıtıcı testinin yerini tutmaz.
