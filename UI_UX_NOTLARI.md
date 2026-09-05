# Momentum arayüz güncellemesi

2 Eylül 2026

## Kullanım

- **Bugün:** Daha okunaklı yazılar, ortak kart/düğme ölçüleri ve çizgi ikonlar. Süre kaydında “30 dk kitap”, “1 saat 20 dk DSA”, “1,5 saat İngilizce” yazılabilir. Kaydetmeden önce ayrıştırılan konu, süre ve alan gösterilir. Yeni konu, odak kategorilerine eklenir.
- **Son kullandıkların:** En son altı konu/süre birleşimi depoda tutulur; hızlı seçimde ilk dördü gösterilir. Süre seç bölümünün ön ayarları da yakın kayıtlara göre güncellenir.
- **Kaydetme:** Ana kayıt yazımı başarıyla tamamlandıktan sonra ekran güncellenir ve “Kaydedildi” görünür. Yazım hatasında form değerleri korunur. Bildirim altı saniye sonra kapanır.
- **Geri al:** Bildirimdeki düğme veya üst çubuktaki geri ok, mevcut uygulama oturumundaki son değişikliği geri alır. Önceki durum da veritabanına yazılır. Sayfa yenilenince bu tek adımlı işlem geçmişi sıfırlanır. Dosya içe aktarmanın kalıcı geri alma yedeği ayrıca korunur.
- **Odak:** Zamanlayıcı açıkken diğer kartlar geri planda kalır. “Tam ekran odak” konu, sayaç ve duraklatma/bitirme düğmelerini öne çıkarır. Kapatma veya Escape çalışma oturumunu silmez. Tam ekran desteği yoksa aynı görünüm uygulama penceresini kaplar.
- **Başarı anları:** Minimum ve ideal alışkanlıklar halka/tik ile gösterilir. İlk 10 saat, 7 günlük seri ve tamamlanan hedef gibi eşikler bir defa kutlanır. Daha büyük eşiklerde kısa parçacık animasyonu vardır. Geri alınan işlem yeniden yapıldığında aynı ödül tekrarlanmaz.
- **Tercihler:** Ayarlar → Profil altında “Hareketi azalt” ve “Başarı sesi” bulunur. Sistem hareket azaltma tercihi de uygulanır. Ses başlangıçta kapalıdır.
- **İlerleme:** Günlük/haftalık/aylık sütunlar ve haftalık grafikler yeni değerlerine geçiş yapar. Günlük sütun veya gün seçilince kayıt ayrıntıları sağ panelde açılır.
- **Takvim:** Haftalık çalışma blokları eklenir, düzenlenir ve silinir. Sürüklerken bırakılacak saat gösterilir; çakışan taşıma kaydedilmez. Klavye ve dokunmatik kullanımda bloğu seçerek tarih/saat alanlarından taşınabilir. Haftanın planı listesi dar ekranlarda da kullanılabilir.
- **Plan ve gerçekleşen süre:** Takvim blokları planlamadır. Odak istatistiklerine yalnızca zamanlayıcı veya süre kaydı ile eklenen gerçek çalışmalar katılır.

## Veri uyumluluğu

Mevcut kayıtlara isteğe bağlı takvim, görünüm tercihleri, son girişler ve görülen başarı eşikleri eklendi. Önceki yedekler bu alanlar olmadan açılır; yeni alanlar JSON yedeklerine dahil edilir. IndexedDB ana kaydı işlem tamamlanınca onaylanır. Geçici localStorage kaydı gerekiyorsa veri ve kurtarma tarihi aynı atomik yazımda tutulur.

## Doğrulama

- `npm run check`: 32 test, TypeScript kontrolü ve üretim derlemesi başarılı (2 Eylül 2026, ikinci kontrol).
- Edge/Chromium, 1440 px ve 390 px: beş sekme; hızlı giriş; gerçek depo okuması; hatalı yazım ve tekrar deneme; ekleme/geri alma; yenileme sonrası tercihler; odak duraklatma/devam/bitirme; takvim taşıma, çakışma, geri alma ve yan panel kontrol edildi.
- Sütunların dönem değişiminde aynı DOM öğesini koruduğu ve hareket azaltma ayarının uygulandığı kontrol edildi.
- IndexedDB yazımı başarısızken geçici kaydın korunması ve yenilemede ana depoya dönmesi doğrulandı.
- Tarayıcı testleri ayrı, geçici bir profilde yapıldı. Sonuç ve görüntüler: `outputs/ui-ux/`.

## Takılma bildirimi sonrası kontrol

- Önceki Codex görevi, görev kaydında 17:18:10'da tamamlanmış görünüyor. Bildirilen 1 saat 15 dakikalık gösterge ve durdurma hatasının kesin nedeni görev kaydından belirlenemedi.
- Ana veri deposu ve otomatik yedek deposunda süresiz yanıt bekleme ihtimali giderildi. Açma ve işlem adımlarında sekiz saniye sınırı var. Süresi dolan yazma işlemi iptal edilir; sonradan gelen bağlantı kullanılmadan kapatılır.
- Yanıtsız veri deposu ve kullanılamayan geçici depo birlikte test edildi: hata gösterildi, giriş korunarak düğmeler açıldı; tekrar denemede yalnızca bir kayıt yazıldı.
- 75 dakikalık açık zamanlayıcı yeniden yüklendi, duraklatıldı ve kaydedildi.
- Test komutu `node work/run-ui-review.cjs` kendi geçici sunucusunu açar ve işlem sonunda kapatır. Test tarayıcısı hata durumunda da kapatılır; tüm tarayıcı kontrolünün süre sınırı iki dakikadır.
- Gerçek kullanıcı verileri üzerinde ekleme veya silme yapılmadı.
