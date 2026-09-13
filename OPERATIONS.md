# Momentum ücretsiz işletim notları

Bu kurulum yalnız Vercel Hobby, Supabase Free ve herkese açık GitHub deposunun ücretsiz GitHub Actions kotasını hedefler. Alan adı, ücretli izleme, ücretli yedekleme veya plan yükseltmesi gerekmez.

## Aylık kontrol

1. Canlı uygulamanın, gizlilik ve destek sayfalarının açıldığını kontrol et.
2. GitHub Actions içindeki `CI`, `CodeQL` ve `Ücretsiz canlılık kontrolü` çalışmalarının yeşil olduğunu doğrula.
3. Supabase kullanım ekranında veritabanı, Edge Function ve bant genişliği limitlerine bak. Kota yaklaşırsa arka plan hatırlatıcılarını cihazlardan kapat; ücretli plana otomatik geçiş yapma.
4. Veri Yönetimi’nden indirilen JSON yedeğini boş bir tarayıcı profilinde önizle; içe aktarma özetindeki sayıları kontrol et.

## Yedekleme düzeni

- Chromium tabanlı masaüstü tarayıcıda Veri Yönetimi → Cihaz dışı yedek bölümünden OneDrive veya Google Drive’ın bilgisayardaki senkronize klasörünü seç.
- Momentum her başarılı veri kaydından sonra `momentum-latest.json` dosyasını ve o günün `momentum-YYYY-MM-DD.json` kopyasını günceller.
- Firefox ve iOS gibi klasör API'sini sunmayan ortamlarda ayda bir `JSON Yedeği İndir` seçeneğini kullan.
- Supabase şeması ve fonksiyonları migration/kaynak kod olarak Git'tedir. Kullanıcı içeriğinin taşınabilir asıl kurtarma kopyası JSON yedeğidir.

## Sürüm yayımlama

```bash
npm ci
npm run check
npm run test:e2e
npx supabase db lint --linked --level error
npx supabase db push --linked
npm run supabase:functions:deploy
npx vercel --prod
```

Canlıya aldıktan sonra ana sayfa ve son kullanıcı belgelerinde HTTP 200, `push-reminders` public-key çağrısında 200, sırsız dispatch çağrısında 401 beklenir. Gerçek e-posta doğrulama, parola sıfırlama ve cihaz bildirimi denemeleri yalnız kendi hesabın ve gelen kutunla yapılmalıdır; repoda kalıcı test hesabı ya da service-role test uç noktası bulundurulmaz.
