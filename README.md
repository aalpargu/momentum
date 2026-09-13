# Momentum

Momentum; odak oturumlarını, alışkanlıkları, günlük öncelikleri, ekran süresini ve uzun vadeli hedefleri tek yerde takip eden local-first bir React PWA'dır.

> Durum: v1.1.0. Hesap, RLS korumalı bulut senkronizasyonu ve sunucu taraflı AI özellikleri Supabase üzerinden çalışır. Proje, ücretli alan adı veya ücretli servis gerektirmeden sağlayıcıların ücretsiz katmanlarına göre yapılandırılmıştır.

**Canlı demo:** [momentum-kappa-sepia.vercel.app](https://momentum-kappa-sepia.vercel.app)

![Momentum bugün ekranı](outputs/ui-ux/today-desktop.png)

## Öne çıkanlar

- Niyet ve kapanış notu destekli, mola/tur ayarlı tam ekran odak zamanlayıcısı
- Gün seçimi ve geçici dondurma destekli minimum/ideal alışkanlık takibi
- Dünden öncelik taşıma, haftalık değerlendirme ve kilometre taşlı hedefler
- Takvim blokları, `.ics` dışa aktarma ve evrensel hızlı kayıt
- Ekran süresi kaydı, görsel sıkıştırma ve Gemini destekli sınıflandırma
- Günlük, haftalık ve aylık üretkenlik raporları
- IndexedDB ana deposu, otomatik kurtarma sürümleri ve doğrulanan JSON yedekleri
- Açık/koyu/sistem teması, erişilebilir klavye akışları ve mobil alt gezinme
- Sürümlü PWA kurulumu, çevrimdışı uygulama kabuğu ve güncelleme bildirimi
- İsteğe bağlı hesap, cihazlar arası çakışma korumalı senkronizasyon ve hesap silme
- 30 günlük yerel çöp kutusu, açık izinli hata raporu ve cihaz bazında analiz kapatma

## Mimari

```text
React PWA ──önce──> IndexedDB
    │
    ├── isteğe bağlı oturum ──> Supabase Auth
    ├── revizyon kontrollü yedek ──> PostgreSQL + RLS
    └── ekran görüntüsü ──> kimlik doğrulanan Edge Function ──> Gemini
```

Uygulama hesap olmadan çalışır. Hesap bağlandığında yerel kayıt ve bulut kaydı otomatik olarak birleştirilmez; kullanıcı ilk seferde hangisinin esas alınacağını seçer. Sonraki yazımlar revizyon kontrolüyle yapılır, böylece başka cihazdaki daha yeni veri sessizce ezilmez.

## Teknoloji

- React 19, TypeScript ve Vite
- IndexedDB tabanlı local-first veri katmanı
- Supabase Auth, PostgreSQL ve Row Level Security (v1.0)
- Supabase Edge Functions üzerinden Gemini API (v1.0)
- Node test runner ve GitHub Actions (v1.0)
- Gizlilik filtreli Vercel Web Analytics ve Supabase geri bildirim tablosu (v1.1)

## Yerel geliştirme

Gereksinim: Node.js 22.12 veya daha yeni bir sürüm.

```bash
npm ci
npm run dev
```

Üretim doğrulaması:

```bash
npm run check
```

Kritik masaüstü ve mobil kullanıcı akışları:

```bash
npx playwright install chromium
npm run test:e2e
```

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` adıyla kopyalayın ve Supabase projenizin browser için güvenli değerlerini girin. Secret veya service-role anahtarlarını `VITE_` ile başlayan değişkenlere koymayın; bu değişkenler tarayıcı paketine dahil edilir.

Bulut değerleri tanımlı değilse Momentum hesap özelliğini kapalı tutarak yerel çalışmaya devam eder.

Supabase veritabanı, Auth ve Edge Function kurulumu için [Supabase kurulum notlarına](supabase/README.md) bakın.

## Production deploy

Mevcut production ortamı Vercel üzerindedir; Supabase Auth yönlendirmeleri canlı alan adına bağlıdır. Yeni sürümü yayımlamak için aşağıdaki yapılandırmayı doğrulayıp ana dal dağıtımını çalıştırın.

1. Ücretsiz Supabase projesini oluşturup migration'ları ve Edge Function'ı deploy edin.
2. Projeyi GitHub'a gönderin ve Vercel'e bağlayın.
3. Vercel Environment Variables alanına `VITE_SUPABASE_URL` ile `VITE_SUPABASE_PUBLISHABLE_KEY` değerlerini ekleyin.
4. Vercel adresini Supabase Authentication URL Configuration alanındaki Site URL ve Redirect URLs listesine ekleyin.
5. Canlı uygulamada yeni bir deneme hesabıyla giriş, iki yönlü senkronizasyon ve AI analizini doğrulayın.

Ücret politikası: Vercel Hobby, Supabase Free ve herkese açık depolar için GitHub Actions ücretsiz kotası dışına çıkılmamalıdır. Özel alan adı, ücretli izleme hizmeti veya plan yükseltmesi zorunlu değildir. Sağlayıcı limitleri dolarsa kapasite satın almak yerine özellik geçici olarak sınırlandırılmalıdır.

Vercel güvenlik başlıkları [vercel.json](vercel.json), her push/PR doğrulaması ise [.github/workflows/ci.yml](.github/workflows/ci.yml) içinde tanımlıdır.

## Veri güvenliği

- Kullanıcı verisi varsayılan olarak cihazdaki IndexedDB'de tutulur.
- Bulut senkronizasyonu isteğe bağlıdır.
- Bulut kayıtları kullanıcı kimliğiyle ayrılır ve PostgreSQL RLS politikalarıyla korunur.
- Gemini anahtarı istemciye gönderilmez; AI çağrıları kimlik doğrulanan server-side function üzerinden yapılır.
- Ekran görüntüleri analiz amacı dışında kalıcı olarak saklanmaz.
- Anonim sayfa istatistikleri ayarlardan kapatılabilir; üretkenlik içeriği analiz olaylarına eklenmez.
- Geri bildirim yalnız kullanıcı açıkça gönderdiğinde yazılır ve sunucuda günlük hız sınırına tabidir.

## Yol haritası

- [x] Güvenilir yerel kayıt, kurtarma ve yedekleme
- [x] Üretkenlik panelleri ve Gemini destekli ekran süresi ayrıştırma
- [x] İsteğe bağlı hesap oluşturma ve giriş
- [x] Çakışma korumalı cihazlar arası bulut senkronizasyonu
- [x] Gemini çağrısını kimlik doğrulanan Edge Function'a taşıma
- [x] Test, tip kontrolü ve build için GitHub Actions
- [x] Supabase ve Vercel production ortamlarını oluşturup canlıya alma
