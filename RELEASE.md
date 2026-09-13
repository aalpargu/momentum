# Yayın ve geri dönüş rehberi

## Yayın öncesi

1. Node 22.12 veya 24 ile `npm ci` çalıştır.
2. `npm run check` ve `npm run test:e2e` sonuçlarını doğrula.
3. Supabase için `npm run supabase:db:push` ve `npm run supabase:functions:deploy` çalıştır.
4. `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` ve Edge Function `GEMINI_API_KEY` değerlerinin hedef ortamda bulunduğunu kontrol et.
5. `CHANGELOG.md` ile `package.json` sürümünü birlikte güncelle.

## Yayın

`vX.Y.Z` biçiminde bir Git etiketi gönderildiğinde release iş akışı doğrulama yapar ve derlenmiş web paketini GitHub sürümüne ekler. Vercel ana dal dağıtımından sonra giriş, yerel kayıt, bulut senkronu, çevrimdışı açılış ve PWA güncelleme akışlarına kısa bir smoke test uygula.

## Geri dönüş

1. Vercel'de son sağlıklı dağıtımı **Promote to Production** ile yeniden etkinleştir.
2. Veritabanı değişikliği geriye uyumlu değilse, önce ilgili migration için önceden hazırlanmış ters migration'ı uygula. Kullanıcı verisini silen otomatik geri dönüş çalıştırma.
3. Edge Function sorununda önceki sağlıklı fonksiyon sürümünü yeniden deploy et.
4. Uygulama yedek biçimi v2 ve v3'ü okur; geri dönüşten önce Ayarlar → Veriyi dışa aktar ile örnek bir üretim yedeğini sakla.
5. Olayı, etkilenen sürümü ve kurtarma adımlarını `CHANGELOG.md` altında belgeleyip düzeltme sürümü çıkar.
