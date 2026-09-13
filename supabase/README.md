# Supabase kurulumu

1. Supabase Dashboard'da ücretsiz bir proje oluşturun.
2. SQL Editor içinde `migrations` klasöründeki SQL dosyalarını tarih sırasıyla çalıştırın. Migration'lar kullanıcı verisi, geri bildirim ve RLS korumalı Web Push aboneliklerini oluşturur; son migration ücretsiz Supabase Cron görevini de kurar.
3. Project Settings → API bölümündeki Project URL ve publishable key değerlerini `.env.local` dosyasına ekleyin.
4. Authentication → URL Configuration içinde yerel ve production adreslerini izinli yönlendirme adreslerine ekleyin.
5. Edge Functions bölümünde `analyze-screen-time`, `delete-account` ve `push-reminders` fonksiyonlarını deploy edin. `push-reminders`, istemci ve cron kimlik doğrulamasını kendi içinde yaptığı için `verify_jwt=false` ile yayımlanır.
6. Function Secrets bölümüne `GEMINI_API_KEY`, isteğe bağlı `GEMINI_MODEL` ve P-256 Web Push anahtar çiftini `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` olarak ekleyin. Özel VAPID anahtarını repoya veya istemci ortam değişkenlerine koymayın.
7. `supabase db lint --linked --level error` ile şemayı; `{ "action": "public-key" }` çağrısıyla push fonksiyonunu doğrulayın. `dispatch` eylemi Vault içindeki cron sırrı olmadan 401 dönmelidir.

Browser'a yalnızca publishable key verilir. Secret/service-role anahtarları hiçbir zaman `VITE_` değişkenlerinde veya Git geçmişinde tutulmaz.

`momentum-push-reminders` görevi beş dakikada bir çalışır. Bu düzenli veritabanı işi ücretsiz projenin etkin kalmasına yardımcı olur; sağlayıcı kotası dolarsa ücretli plana geçmek yerine arka plan bildirimlerini kapatın. Şema migration'larla Git'te tutulur; kişisel uygulama verisi için Momentum'un JSON/klasör yedeklerini kullanın.
