# Karavan Webasto V3.2 — kaynak protokollü manuel komut testi

**UYARI: Deneysel sürüm, gerçek ısıtıcıyı etkileyebilir. İnsansız kullanma.**

Dosyaları GitHub `karavanmasali/webasto-v3` deposunun **kök dizinine** yükle. `.nojekyll` zaten varsa değiştirmeye gerek yok. Settings > Pages: main / (root).

## Yapılanlar
- RE5011 `181A` servis, `3A00` notify/okuma, `3A01` GATT write.
- `3A00` durum raporlarının CRC16 doğrulaması ve canlı sıcaklık/voltaj okuma.
- `diesel-heater-ble-0.3.8` (ProtocolHeatGenie) kütüphanesinden aynı 8 baytlık güç ve sıcaklık komutlarının JavaScript'e aktarılması.
- **Kullanıcının açık onayıyla tek seferlik manuel deneme** (otomatik komut tekrarı yok).
- Testten önce onay kutusu; ilk önce hedef sıcaklık +/− ve 3A00'den eşleşme görülürse START/STOP düğmeleri etkinleşir.
- GATT aktarım yanıtı, fiziksel cihaz eyleminden ayrı kaydedilir. Sonuç alınmazsa yazma otomatik tekrarlanmaz.
- Otomatik termostat gerçek cihazda KAPALI ve iOS arka plan sorunu çözülmüş değildir.

## Test sırası
1. Windows 11 Chrome/Edge ile Pages sitesini aç; HeatGenie bağlantısını kes, `RE5011` seç.
2. Gerçek `3A00` verileri akmaya başlayınca **manuel test onay kutusunu** işaretle.
3. **Hedef +** veya **Hedef −** butonuna bir kere bas; onay penceresini kabul et.
4. Yaklaşık 7 saniye sonra 'Cihaz hedefi geri okundu' mesajı gelirse ilk adım geçti. Gelmezse tanı kayıtlarını indir; START/STOP'a geçme.
5. Hedef başarılıysa ve ortam güvenliyse, orijinal kontrol yanında **START** ve gerekirse **STOP/CLEAR** butonunu tek seferlik dene, normal soğutmayı izle. Komutların daha önce çalışmamış olabileceğini göz önünde bulundur.
6. `Tanı kayıtlarını indir` ile kaydı paylaş.

## Komut örnekleri
- START `AA 00 61 01 FF 00 7C 83`
- STOP `AA 00 61 02 FF 00 25 D3`
- Hedef 22°C `AA 00 66 01 00 16 5C A6`
- Hedef 23°C `AA 00 66 01 00 17 4C 87`

Bu değerler açık kaynak koddan doğrulandı ama **kullanıcının RE5011 cihazı üzerinde fiili kabulü henüz teyit edilmedi.** Önceki başarısız START/STOP paketleriyle aynı oldukları özellikle belirtilmelidir.

## Telif
Komut oluşturma yöntemi, `diesel-heater-ble` `ProtocolHeatGenie` kaynak kodundan uyarlanmıştır.
Orijinal telif: Copyright (c) 2024 Spettacolo83. MIT Lisansı (LICENSE-THIRD-PARTY.txt içinde).
https://github.com/Spettacolo83/diesel-heater-ble
