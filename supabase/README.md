# Supabase kurulumu

1. Supabase Dashboard'da ücretsiz bir proje oluşturun.
2. SQL Editor içinde `migrations` klasöründeki SQL dosyalarını tarih sırasıyla çalıştırın.
3. Project Settings → API bölümündeki Project URL ve publishable key değerlerini `.env.local` dosyasına ekleyin.
4. Authentication → URL Configuration içinde yerel ve production adreslerini izinli yönlendirme adreslerine ekleyin.
5. Edge Functions bölümünde `analyze-screen-time` fonksiyonunu deploy edin.
6. Function Secrets bölümüne `GEMINI_API_KEY` ve isteğe bağlı `GEMINI_MODEL` değerlerini ekleyin.

Browser'a yalnızca publishable key verilir. Secret/service-role anahtarları hiçbir zaman `VITE_` değişkenlerinde veya Git geçmişinde tutulmaz.
