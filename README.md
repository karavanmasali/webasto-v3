# Karavan Webasto V3.4 — START + ACK Tanılama

**Deneysel sürüm; fiziksel RE5011 START başarısı henüz doğrulanmadı.** Bu sürümün amacı farklı, protokolden alınmış bir START öncesi hazırlık adımını sınamak ve gerçek kısa komut yanıtlarını kaydetmek. Otomatik termostat gerçek cihazda yine kilitlidir. Isıtıcıyı gözetimsiz çalıştırmayın.

## Korunan çalışan özellikler
- STOP/CLEAR paketinin baytları değiştirilmedi: `AA 00 61 02 FF 00 25 D3`.
- Hedef +/− komutu değiştirilmedi; aralık **10–40°C**.
- CRC kontrollü 3A00 telemetri ve 3A01 GATT yazma davranışı korundu.

## Yeni kontrollü START deneyi
- Ön hazırlık: açık kaynak `diesel-heater-ble 0.3.8`, `ProtocolHeatGenie.build_command(1, ...)` kaynaklı `AA 00 65 02 14 1E [CRC]` otomatik durum kayıt isteği. Bu **alternatif bir START komutu değildir**; cihazın kabul edeceği belirsizdir.
- 1,2 saniye yeni telemetri beklendikten sonra yalnızca bir defa eski START `AA 00 61 01 FF 00 7C 83` gönderilir.
- Isıtıcı fan, pompa veya kızdırma aktifse veya durum adımı 5/0 dışında ise START gönderilmez. Bağlantı koparsa veya yeni telemetri gelmezse iptal edilir.
- Gelen 8 baytlık 3A00 yanıtları CRC16 kontrolüyle tanıya ayrı `KISA YANIT` satırı olarak eklenir; GATT onayı veya kısa yanıt ateşlemenin başladığını kanıtlamaz.
- Tek komut denemesi sonunda 3A00 çalışma adımında `5 → 1` değişimi aranır. Otomatik tekrar, diğer START varyantlarını körlemesine deneme yoktur.

## GitHub'a yükleme
ZIP'i çıkar. İçindeki dosyaları ve **tests/** klasörünü doğrudan GitHub `karavanmasali/webasto-v3` deposunun ana dizinine yükle. .nojekyll gizli dosyasını yeniden yaratmana gerek yok; GitHub'da zaten varsa koru. GitHub Pages sayfasını açınca Ctrl+Shift+R yap ve **V3.4 START / ACK TEST** başlığını kontrol et.

## Test
Tam soğutma bittikten sonra Windows 11 Chrome'dan bağlan, manuel onay kutusunu işaretle, bir kez +/− hedef testiyle cihaz dönüşünü doğrula; ardından **START (KAYIT + TEK START)** düğmesine sadece bir kez bas. Isıtıcının yanında kal, normal ateşlemeyi gözlemle. Başlarsa ve test tamamlanırsa orijinal kumanda veya çalışan STOP/CLEAR ile normal soğut. Başlamazsa `Tanı kayıtlarını indir` dosyasını paylaş. Daha fazla START komutu gönderme.

Komut kaynağı: kullanıcıca sağlanan `diesel-heater-ble 0.3.8` kaynak paketi, MIT lisanslıdır.
